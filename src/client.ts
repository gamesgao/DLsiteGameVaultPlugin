import { DlsiteParseError } from "./errors.js";
import { buildWorkUrl, normalizeWorkId, parseWorkUrl } from "./identity.js";
import { parseProductHtml } from "./product-parser.js";
import { parseSearchHtml } from "./search-parser.js";
import type {
  DlsiteProduct,
  DlsiteProductInfoResponse,
  DlsiteSearchCandidate,
} from "./types.js";

export type DlsiteLocale = "ja_JP" | "en_US" | "zh_CN" | "zh_TW";
export type DlsiteSearchSection = "home" | "maniax" | "soft" | "pro";

export class DlsiteClientError extends Error {
  constructor(
    public readonly code:
      "http" | "network" | "timeout" | "unsafe-url" | "invalid-response",
    message: string,
    public readonly url: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DlsiteClientError";
  }
}

export interface DlsiteSupplementWarning {
  id: string;
  error: DlsiteClientError;
}

export interface DlsiteClientOptions {
  locale?: DlsiteLocale;
  searchSections?: readonly DlsiteSearchSection[];
  requestIntervalMs?: number;
  timeoutMs?: number;
  retries?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  fetch?: typeof globalThis.fetch;
  onWarning?: (warning: DlsiteSupplementWarning) => void;
}

export interface DlsiteRequestOptions {
  forceRefresh?: boolean;
}

export interface DlsiteImage {
  url: string;
  contentType: string;
  data: Uint8Array;
}

interface Cache<T> {
  values: Map<string, { value: T; expiresAt: number }>;
  pending: Map<string, Promise<T>>;
}

function cache<T>(): Cache<T> {
  return { values: new Map(), pending: new Map() };
}

type RequestKind = "product" | "info" | "search" | "image";
const origin = "https://www.dlsite.com";
const searchSections = ["home", "maniax", "soft", "pro"] as const;
const languages: Record<DlsiteLocale, string> = {
  ja_JP: "ja-JP",
  en_US: "en-US",
  zh_CN: "zh-CN",
  zh_TW: "zh-TW",
};
const maxRetryDelayMs = 30_000;
const textDecoder = new TextDecoder();
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function bounded(
  value: number,
  name: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new TypeError(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInfo(
  body: Uint8Array,
  id: string,
  url: string,
): DlsiteProductInfoResponse {
  let json: unknown;
  try {
    json = JSON.parse(textDecoder.decode(body));
  } catch (cause) {
    throw new DlsiteClientError(
      "invalid-response",
      "Invalid DLsite product JSON",
      url,
      undefined,
      undefined,
      { cause },
    );
  }
  const info = record(json) ? json[id] : undefined;
  if (
    !record(info) ||
    (info.work_name != null && typeof info.work_name !== "string") ||
    (info.rate_average_2dp != null &&
      typeof info.rate_average_2dp !== "number" &&
      typeof info.rate_average_2dp !== "string")
  ) {
    throw new DlsiteClientError(
      "invalid-response",
      `Missing or invalid supplemental record for ${id}`,
      url,
    );
  }
  return {
    [id]: {
      work_name: info.work_name,
      rate_average_2dp: info.rate_average_2dp,
    },
  };
}

export class DlsiteClient {
  private readonly locale: DlsiteLocale;
  private readonly sections: readonly DlsiteSearchSection[];
  private readonly interval: number;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly ttl: number;
  private readonly maxEntries: number;
  private readonly fetch: typeof globalThis.fetch;
  private readonly onWarning: (warning: DlsiteSupplementWarning) => void;
  private readonly products = cache<DlsiteProduct>();
  private readonly searches = cache<DlsiteSearchCandidate[]>();
  private readonly images = cache<DlsiteImage>();
  private queue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private rateLimitedUntil = 0;
  private rateLimitError?: DlsiteClientError;

  constructor(options: DlsiteClientOptions = {}) {
    this.locale = options.locale ?? "ja_JP";
    if (!Object.hasOwn(languages, this.locale))
      throw new TypeError("Unsupported DLsite locale");
    this.sections = [...new Set(options.searchSections ?? searchSections)];
    if (
      !this.sections.length ||
      this.sections.some((section) => !searchSections.includes(section))
    )
      throw new TypeError(
        "Expected at least one supported DLsite search section",
      );
    this.interval = bounded(
      options.requestIntervalMs ?? 500,
      "requestIntervalMs",
      0,
      60_000,
    );
    this.timeout = bounded(options.timeoutMs ?? 15_000, "timeoutMs", 1, 60_000);
    this.retries = bounded(options.retries ?? 1, "retries", 0, 3);
    this.ttl = bounded(options.cacheTtlMs ?? 60_000, "cacheTtlMs", 0, 300_000);
    this.maxEntries = bounded(
      options.cacheMaxEntries ?? 100,
      "cacheMaxEntries",
      0,
      1_000,
    );
    this.fetch = options.fetch ?? globalThis.fetch;
    this.onWarning =
      options.onWarning ??
      (({ id, error }) => {
        console.warn(
          `[DLsite] Supplemental data unavailable for ${id}: ${error.message}`,
        );
      });
  }

  async getProduct(
    input: string,
    options: DlsiteRequestOptions = {},
  ): Promise<DlsiteProduct> {
    const work = parseWorkUrl(input.trim());
    const id = work?.id ?? normalizeWorkId(input);
    if (!id)
      throw new TypeError("Expected a DLsite work ID or supported work URL");
    return this.memo(this.products, id, options, async () => {
      const page = await this.request(
        work?.url ?? buildWorkUrl(id),
        "product",
        id,
      );
      const section = parseWorkUrl(page.url)!.section;
      const infoUrl = `${origin}/${section}/product/info/ajax?product_id=${id}&cdn_cache_min=1`;
      let info: DlsiteProductInfoResponse | undefined;
      let cacheable = true;
      try {
        const response = await this.request(infoUrl, "info", id, page.url);
        info = readInfo(response.data, id, response.url);
      } catch (error) {
        if (!(error instanceof DlsiteClientError)) throw error;
        cacheable = false;
        this.onWarning({ id, error });
      }
      return {
        value: parseProductHtml(textDecoder.decode(page.data), page.url, info),
        cacheable,
      };
    });
  }

  async search(
    input: string,
    options: DlsiteRequestOptions = {},
  ): Promise<DlsiteSearchCandidate[]> {
    const query = input.trim();
    if (!query) throw new TypeError("Expected a nonempty DLsite search query");
    if (normalizeWorkId(query) || parseWorkUrl(query)) {
      const { id, title, url } = await this.getProduct(query, options);
      return [{ id, title, url }];
    }
    if (/^(?:[a-z][a-z\d+.-]*:\/\/|\/\/)/i.test(query))
      throw new TypeError("Expected keywords or a supported DLsite work URL");
    return this.memo(this.searches, query, options, async () => {
      const candidates = new Map<string, DlsiteSearchCandidate>();
      for (const section of this.sections) {
        const filters =
          section === "maniax"
            ? "sex_category[0]/male/work_category[0]/doujin/work_category[1]/books/work_category[2]/pc/work_category[3]/app"
            : section === "pro"
              ? "sex_category[0]/male/work_category[0]/pc"
              : section === "soft"
                ? "age_category[0]/general/work_category[0]/pc"
                : "age_category[0]/general/work_category[0]/doujin/work_category[1]/pc/work_category[2]/app";
        const url = `${origin}/${section}/fsr/=/language/jp/keyword/${encodeURIComponent(query)}/${filters}/order[0]/trend/options_and_or/and/per_page/30/show_type/1/from/fs.header/`;
        const page = await this.request(url, "search");
        for (const candidate of parseSearchHtml(
          textDecoder.decode(page.data),
        )) {
          if (!candidates.has(candidate.id))
            candidates.set(candidate.id, candidate);
        }
      }
      return { value: [...candidates.values()] };
    });
  }

  async getImage(
    input: string,
    options: DlsiteRequestOptions = {},
  ): Promise<DlsiteImage> {
    this.checkUrl(input, "image");
    const url = new URL(input);
    url.hash = "";
    return this.memo(this.images, url.href, options, async () => ({
      value: await this.request(url.href, "image"),
    }));
  }

  private async memo<T>(
    store: Cache<T>,
    key: string,
    options: DlsiteRequestOptions,
    load: () => Promise<{ value: T; cacheable?: boolean }>,
  ): Promise<T> {
    const pending = store.pending.get(key);
    if (pending) return structuredClone(await pending);
    const cached = store.values.get(key);
    if (!options.forceRefresh && cached && cached.expiresAt > Date.now())
      return structuredClone(cached.value);
    const promise = (async () => {
      const { value, cacheable = true } = await load();
      if (cacheable && this.ttl && this.maxEntries) {
        for (const [entry, item] of store.values) {
          if (item.expiresAt <= Date.now()) store.values.delete(entry);
        }
        store.values.delete(key);
        while (store.values.size >= this.maxEntries)
          store.values.delete(store.values.keys().next().value!);
        store.values.set(key, { value, expiresAt: Date.now() + this.ttl });
      } else {
        store.values.delete(key);
      }
      return value;
    })();
    store.pending.set(key, promise);
    try {
      return structuredClone(await promise);
    } finally {
      store.pending.delete(key);
    }
  }

  private checkUrl(input: string, kind: RequestKind, id?: string): void {
    const url = URL.canParse(input) ? new URL(input) : undefined;
    const allowedHost =
      url &&
      (kind === "image"
        ? url.hostname === "img.dlsite.jp"
        : ["www.dlsite.com", "dlsite.com"].includes(url.hostname));
    if (
      !url ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !allowedHost
    )
      throw new DlsiteClientError(
        "unsafe-url",
        "Unsupported DLsite request URL",
        input,
      );
    if (kind === "product") {
      const work = parseWorkUrl(input);
      if (!work)
        throw new DlsiteClientError(
          "unsafe-url",
          "Redirect is not a DLsite work page",
          input,
        );
      if (work.id !== id)
        throw new DlsiteParseError(
          "identity-mismatch",
          "DLsite redirect changed the requested work ID",
        );
    } else if (kind === "info") {
      if (
        !/^\/(home|maniax|soft|pro|aix)\/product\/info\/ajax$/.test(
          url.pathname,
        ) ||
        url.searchParams.get("product_id") !== id
      )
        throw new DlsiteClientError(
          "unsafe-url",
          "Unsupported DLsite product info redirect",
          input,
        );
    } else if (
      kind === "search" &&
      !/^\/(home|maniax|soft|pro)\/fsr\/=\//.test(url.pathname)
    ) {
      throw new DlsiteClientError(
        "unsafe-url",
        "Unsupported DLsite search redirect",
        input,
      );
    }
  }

  private request(
    url: string,
    kind: RequestKind,
    id?: string,
    referer?: string,
  ): Promise<DlsiteImage> {
    const result = this.queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.download(url, kind, id, referer);
        } catch (error) {
          if (!(error instanceof DlsiteClientError)) throw error;
          const retryable =
            error.code === "network" ||
            error.code === "timeout" ||
            (error.code === "http" &&
              [408, 425, 429, 500, 502, 503, 504].includes(error.status!));
          const delay = error.retryAfterMs ?? 500 * 2 ** attempt;
          if (!retryable || attempt >= this.retries || delay > maxRetryDelayMs)
            throw error;
          await sleep(delay);
        }
      }
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async download(
    input: string,
    kind: RequestKind,
    id?: string,
    referer?: string,
  ): Promise<DlsiteImage> {
    let url = new URL(input);
    if (kind !== "image") url.searchParams.set("locale", this.locale);
    for (let redirects = 0; ; redirects++) {
      this.checkUrl(url.href, kind, id);
      const cooldown = this.rateLimitedUntil - Date.now();
      if (cooldown > maxRetryDelayMs) throw this.rateLimitError!;
      const wait = Math.max(this.nextRequestAt - Date.now(), cooldown);
      if (wait > 0) await sleep(wait);
      this.nextRequestAt = Date.now() + this.interval;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const headers: Record<string, string> = {
          "User-Agent":
            "DLsiteGameVaultPlugin/0.2 (+https://github.com/gamesgao/DLsiteGameVaultPlugin)",
          Accept:
            kind === "image"
              ? "image/*"
              : kind === "info"
                ? "application/json"
                : "text/html",
        };
        if (kind !== "image") {
          headers.Cookie = `locale=${this.locale}; loginchecked=1`;
          headers["Accept-Language"] = languages[this.locale];
        }
        if (referer) {
          const page = new URL(referer);
          page.searchParams.set("locale", this.locale);
          headers.Referer = page.href;
          headers["X-Requested-With"] = "XMLHttpRequest";
        }
        const response = await this.fetch(url.href, {
          headers,
          signal: controller.signal,
          redirect: "manual",
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get("location");
          if (!location || redirects >= 4)
            throw new DlsiteClientError(
              "invalid-response",
              "Missing redirect location or too many DLsite redirects",
              url.href,
              response.status,
            );
          url = new URL(location, url);
          continue;
        }
        if (response.url) this.checkUrl(response.url, kind, id);
        if (!response.ok) {
          await response.body?.cancel();
          const retryAfter = response.headers.get("retry-after");
          const milliseconds =
            retryAfter === null
              ? NaN
              : /^\d+(?:\.\d+)?$/.test(retryAfter)
                ? Number(retryAfter) * 1000
                : Date.parse(retryAfter) - Date.now();
          const retryAfterMs = Number.isFinite(milliseconds)
            ? Math.max(0, milliseconds)
            : undefined;
          const error = new DlsiteClientError(
            "http",
            `DLsite HTTP ${response.status}`,
            url.href,
            response.status,
            retryAfterMs,
          );
          if (response.status === 429) {
            this.rateLimitedUntil = Date.now() + (retryAfterMs ?? 500);
            this.rateLimitError = error;
          }
          throw error;
        }
        const contentType = (response.headers.get("content-type") ?? "")
          .split(";")[0]!
          .trim()
          .toLowerCase();
        const expected =
          kind === "image"
            ? /^image\/(?:jpeg|png|webp|gif|avif)$/
            : kind === "info"
              ? /^application\/json$/
              : /^text\/html$/;
        if (!expected.test(contentType)) {
          await response.body?.cancel();
          throw new DlsiteClientError(
            "invalid-response",
            `Unexpected DLsite content type: ${contentType || "(missing)"}`,
            url.href,
          );
        }
        const data = new Uint8Array(await response.arrayBuffer());
        if (!data.length)
          throw new DlsiteClientError(
            "invalid-response",
            "Empty DLsite response",
            url.href,
          );
        return { url: response.url || url.href, contentType, data };
      } catch (cause) {
        if (
          cause instanceof DlsiteClientError ||
          cause instanceof DlsiteParseError
        )
          throw cause;
        // Fetch/body errors may embed proxy credentials, including nested causes.
        throw new DlsiteClientError(
          controller.signal.aborted ? "timeout" : "network",
          controller.signal.aborted
            ? "DLsite request timed out"
            : "DLsite network request failed",
          url.href,
        );
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
