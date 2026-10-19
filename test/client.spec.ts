import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DlsiteClient,
  DlsiteClientError,
  DlsiteParseError,
  buildWorkUrl,
} from "../src/index.js";
import type { DlsiteClientOptions } from "../src/index.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const productHtml = fixture("product.html");
const infoJson = fixture("product-info.json");
const searchHtml = fixture("search.html");
const emptySearchHtml = fixture("search-empty.html");
const imageUrl = "https://img.dlsite.jp/synthetic/cover.jpg";
const imageBytes = new Uint8Array([255, 216, 255, 224, 1]);

function html(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function json(body = infoJson): Response {
  return new Response(body, {
    headers: { "Content-Type": "application/json" },
  });
}

function image(): Response {
  return new Response(imageBytes, {
    headers: { "Content-Type": "image/jpeg" },
  });
}

function page(id = "RJ000001", title = "HTML title"): string {
  return `<link rel="canonical" href="${buildWorkUrl(id)}"><h1 id="work_name">${title}</h1>`;
}

function setup(options: DlsiteClientOptions = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "img.dlsite.jp") return image();
    if (url.pathname.includes("/fsr/")) return html(searchHtml);
    if (url.pathname.includes("/product/info/")) {
      const id = url.searchParams.get("product_id")!;
      return id === "RJ000001"
        ? json()
        : json(JSON.stringify({ [id]: { rate_average_2dp: 4 } }));
    }
    const id = url.pathname.match(/product_id\/(\w+)\.html/)![1]!;
    return html(page(id));
  });
  const onWarning = vi.fn();
  const client = new DlsiteClient({ fetch, onWarning, ...options });
  return { client, fetch, onWarning };
}

async function finish<T>(work: Promise<T>): Promise<T> {
  const settled = work.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if (!result.ok) throw result.error;
  return result.value;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DLsite product requests", () => {
  it("follows a genuine section redirect, sends anonymous locale/AJAX headers, and preserves parsed fields", async () => {
    const { client, fetch, onWarning } = setup({ locale: "en_US" });
    fetch
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: buildWorkUrl("RJ000001", "maniax") },
        }),
      )
      .mockResolvedValueOnce(html(productHtml));
    const product = await finish(client.getProduct(" rj000001 "));
    expect(product).toMatchObject({
      id: "RJ000001",
      title: "Tiny Adventure",
      score: 96,
      url: buildWorkUrl("RJ000001", "maniax"),
      releaseDate: "2024-02-29",
      minimumAge: 0,
      workTypes: [{ code: "RPG", name: "ロールプレイング" }],
      coverUrl: imageUrl,
      galleryUrls: ["https://img.dlsite.jp/synthetic/scene.jpg"],
      tags: ["探索", "友情"],
    });
    expect(product.description).toContain("## 空の旅");
    expect(onWarning).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      new URL(String(fetch.mock.calls[0]![0])).searchParams.get("locale"),
    ).toBe("en_US");
    for (const [input, init] of fetch.mock.calls) {
      expect(new URL(String(input)).hostname).toBe("www.dlsite.com");
      expect(new Headers(init?.headers).get("cookie")).toBe(
        "locale=en_US; loginchecked=1",
      );
      expect(init?.redirect).toBe("manual");
    }
    const [input, init] = fetch.mock.calls.find(([url]) =>
      String(url).includes("/product/info/"),
    )!;
    expect(new URL(String(input)).pathname).toBe("/maniax/product/info/ajax");
    expect(new URL(String(input)).searchParams.get("product_id")).toBe(
      "RJ000001",
    );
    expect(new URL(String(input)).searchParams.get("cdn_cache_min")).toBe("1");
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-requested-with")).toBe("XMLHttpRequest");
    expect(headers.get("referer")).toBe(`${product.url}?locale=en_US`);
  });

  it("defaults to Japanese, normalizes accepted URLs, and leaves unknown fields unknown", async () => {
    const { client, fetch } = setup();
    const product = await finish(
      client.getProduct(
        "http://dlsite.com/home-touch/work/=/product_id/rj000001.html?tracking=1",
      ),
    );
    expect(product).toMatchObject({
      id: "RJ000001",
      title: "Tiny Adventure",
      score: 96,
    });
    expect(product.tags).toBeUndefined();
    expect(product.galleryUrls).toBeUndefined();
    expect(product.releaseDate).toBeUndefined();
    expect(String(fetch.mock.calls[0]![0])).toBe(
      `${buildWorkUrl("RJ000001")}?locale=ja_JP`,
    );
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get("cookie")).toBe(
      "locale=ja_JP; loginchecked=1",
    );
  });

  it.each([
    ["HTTP failure", () => new Response(null, { status: 404 })],
    ["malformed JSON", () => json("{broken")],
    ["wrong work ID", () => json('{"RJ000002":{"rate_average_2dp":5}}')],
    ["invalid title", () => json('{"RJ000001":{"work_name":42}}')],
    ["invalid score type", () => json('{"RJ000001":{"rate_average_2dp":{}}}')],
    ["array instead of record", () => json("[]")],
    ["null record", () => json('{"RJ000001":null}')],
    ["wrong content type", () => html("<h1>Unavailable</h1>")],
  ])(
    "reports optional %s without fabricating a score or caching degraded metadata",
    async (_, response) => {
      const { client, fetch, onWarning } = setup();
      fetch
        .mockResolvedValueOnce(html(page()))
        .mockImplementationOnce(async () => response());
      const partial = await finish(client.getProduct("RJ000001"));
      expect(partial).toMatchObject({ id: "RJ000001", title: "HTML title" });
      expect(partial.score).toBeUndefined();
      expect(onWarning).toHaveBeenCalledWith({
        id: "RJ000001",
        error: expect.any(DlsiteClientError),
      });
      expect(await finish(client.getProduct("RJ000001"))).toMatchObject({
        score: 96,
        title: "Tiny Adventure",
      });
      expect(fetch).toHaveBeenCalledTimes(4);
    },
  );

  it("does not treat a genuine unrated record as a transport failure", async () => {
    const { client, fetch, onWarning } = setup();
    fetch
      .mockResolvedValueOnce(html(page()))
      .mockResolvedValueOnce(
        json('{"RJ000001":{"work_name":null,"rate_average_2dp":0}}'),
      );
    expect((await finish(client.getProduct("RJ000001"))).score).toBeUndefined();
    expect((await client.getProduct("RJ000001")).score).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("retains real HTML ratings when JSON is unavailable and logs a warning by default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(html(productHtml))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const result = await finish(new DlsiteClient().getProduct("RJ000001"));
    expect(result.score).toBe(85);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("RJ000001"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("403"));
  });

  it.each([
    ["unavailable", '<div class="error_box_work">No longer sold</div>'],
    ["invalid-page", "<h1>Access denied</h1>"],
    ["identity-mismatch", page("RJ000002")],
  ])(
    "rejects full product failure %s, then recovers without a poisoned cache",
    async (code, body) => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(html(body));
      await expect(finish(client.getProduct("RJ000001"))).rejects.toMatchObject(
        { name: "DlsiteParseError", code },
      );
      expect((await finish(client.getProduct("RJ000001"))).id).toBe("RJ000001");
      expect(fetch).toHaveBeenCalledTimes(4);
    },
  );

  it("cannot use JSON to manufacture a valid product after both sources fail", async () => {
    const { client, fetch, onWarning } = setup();
    fetch
      .mockResolvedValueOnce(html("<h1>Denied</h1>"))
      .mockResolvedValueOnce(json("{}"));
    await expect(finish(client.getProduct("RJ000001"))).rejects.toBeInstanceOf(
      DlsiteParseError,
    );
    expect(onWarning).toHaveBeenCalledTimes(1);
  });
});

describe("DLsite keyword and exact search", () => {
  it("URL-encodes keywords, searches the useful default sections and deduplicates by ID", async () => {
    const { client, fetch } = setup();
    const query = "Tiny: 空 / + & ?";
    const results = await finish(client.search(query));
    expect(results).toEqual([
      {
        id: "RJ000001",
        title: "Tiny & Sky",
        url: buildWorkUrl("RJ000001"),
        excerpt: "Explore together.",
      },
      {
        id: "VJ00000002",
        title: "Second game",
        url: buildWorkUrl("VJ00000002", "soft"),
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
    const urls = fetch.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.pathname.split("/")[1])).toEqual([
      "home",
      "maniax",
      "soft",
      "pro",
    ]);
    for (const url of urls) {
      expect(
        decodeURIComponent(url.pathname.match(/\/keyword\/([^/]+)/)![1]!),
      ).toBe(query);
      expect(url.pathname).toContain("/per_page/30/show_type/1/");
    }
  });

  it("supports configured sections and caches a genuinely empty result", async () => {
    const { client, fetch } = setup({ searchSections: ["soft", "soft"] });
    fetch.mockResolvedValue(html(emptySearchHtml));
    expect(await finish(client.search("Missing game"))).toEqual([]);
    expect(await client.search(" Missing game ")).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects partial search failures rather than presenting partial results as complete", async () => {
    const { client, fetch } = setup({
      searchSections: ["home", "maniax"],
      retries: 0,
    });
    fetch
      .mockResolvedValueOnce(html(searchHtml))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(finish(client.search("Tiny"))).rejects.toMatchObject({
      code: "http",
      status: 503,
    });
    expect(await finish(client.search("Tiny"))).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("does not confuse an unexpected HTML page with an empty search", async () => {
    const { client, fetch } = setup({ searchSections: ["home"] });
    fetch.mockResolvedValueOnce(html("<h1>Maintenance</h1>"));
    await expect(finish(client.search("Tiny"))).rejects.toMatchObject({
      code: "invalid-page",
    });
    expect(await finish(client.search("Tiny"))).toHaveLength(2);
  });

  it("routes IDs and work URLs to one exact product without keyword searches", async () => {
    const { client, fetch } = setup();
    const expected = [
      {
        id: "RJ000001",
        title: "Tiny Adventure",
        url: buildWorkUrl("RJ000001"),
      },
    ];
    expect(await finish(client.search("rj000001"))).toEqual(expected);
    expect(await client.search(buildWorkUrl("RJ000001", "maniax"))).toEqual(
      expected,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      await finish(client.search("RJ000001", { forceRefresh: true })),
    ).toEqual(expected);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe("DLsite image retrieval and URL boundaries", () => {
  it("returns image bytes and MIME, follows only allowed image redirects, and never sends site cookies", async () => {
    const { client, fetch } = setup();
    const final = "https://img.dlsite.jp/synthetic/updated.webp";
    fetch
      .mockResolvedValueOnce(
        new Response(null, { status: 307, headers: { Location: final } }),
      )
      .mockResolvedValueOnce(
        new Response(imageBytes, { headers: { "Content-Type": "image/webp" } }),
      );
    const result = await finish(client.getImage(imageUrl));
    expect(result).toEqual({
      url: final,
      data: imageBytes,
      contentType: "image/webp",
    });
    for (const [url, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).has("cookie")).toBe(false);
      expect(String(url)).not.toContain("locale");
    }
  });

  it.each([
    "file:///etc/passwd",
    "http://img.dlsite.jp/x.jpg",
    "https://example.com/x.jpg",
    "https://img.dlsite.jp.evil.test/x.jpg",
    "https://img.dlsite.jp:444/x.jpg",
    "https://user:pass@img.dlsite.jp/x.jpg",
    "/local.jpg",
  ])("rejects unsupported image URL %s without network access", async (url) => {
    const { client, fetch } = setup();
    await expect(client.getImage(url)).rejects.toMatchObject({
      code: "unsafe-url",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "not an ID",
    "https://example.com/home/work/=/product_id/RJ000001.html",
    "file:///local",
    "RJ000001 RJ000002",
  ])(
    "rejects invalid product input %s without network access",
    async (input) => {
      const { client, fetch } = setup();
      await expect(client.getProduct(input)).rejects.toBeInstanceOf(TypeError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([" ", "https://example.com/", "file:///local", "//example.com/"])(
    "rejects invalid search input %s without network access",
    async (input) => {
      const { client, fetch } = setup();
      await expect(client.search(input)).rejects.toBeInstanceOf(TypeError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    [buildWorkUrl("RJ000002"), "identity-mismatch"],
    ["https://example.com/", "unsafe-url"],
    ["https://www.dlsite.com/login", "unsafe-url"],
    [
      "http://www.dlsite.com/home/work/=/product_id/RJ000001.html",
      "unsafe-url",
    ],
  ])("does not fetch a product redirect to %s", async (location, code) => {
    const { client, fetch } = setup();
    fetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: location } }),
    );
    await expect(finish(client.getProduct("RJ000001"))).rejects.toMatchObject({
      code,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds redirect loops and rejects missing redirect locations", async () => {
    const { client, fetch } = setup();
    fetch.mockImplementation(
      async () =>
        new Response(null, { status: 308, headers: { Location: imageUrl } }),
    );
    await expect(finish(client.getImage(imageUrl))).rejects.toMatchObject({
      code: "invalid-response",
    });
    expect(fetch).toHaveBeenCalledTimes(5);
    fetch.mockResolvedValueOnce(new Response(null, { status: 301 }));
    await expect(finish(client.getImage(imageUrl))).rejects.toMatchObject({
      code: "invalid-response",
    });
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("rejects unsafe search and supplemental redirects before following them", async () => {
    const { client, fetch, onWarning } = setup({ searchSections: ["home"] });
    const redirect = () =>
      new Response(null, {
        status: 303,
        headers: { Location: "https://www.dlsite.com/login" },
      });
    fetch.mockResolvedValueOnce(redirect());
    await expect(finish(client.search("Tiny"))).rejects.toMatchObject({
      code: "unsafe-url",
    });
    fetch.mockResolvedValueOnce(html(page())).mockResolvedValueOnce(redirect());
    expect((await finish(client.getProduct("RJ000001"))).score).toBeUndefined();
    expect(onWarning).toHaveBeenCalledWith({
      id: "RJ000001",
      error: expect.objectContaining({ code: "unsafe-url" }),
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("checks nonempty response URLs even with an injected transport", async () => {
    const { client, fetch } = setup();
    const response = image();
    Object.defineProperty(response, "url", { value: imageUrl });
    fetch.mockResolvedValueOnce(response);
    expect((await finish(client.getImage(imageUrl))).url).toBe(imageUrl);
    const unsafe = image();
    Object.defineProperty(unsafe, "url", {
      value: "https://example.com/art.jpg",
    });
    fetch.mockResolvedValueOnce(unsafe);
    await expect(
      finish(client.getImage(imageUrl, { forceRefresh: true })),
    ).rejects.toMatchObject({ code: "unsafe-url" });
  });

  it.each([
    ["HTML instead of image", () => html("<h1>Denied</h1>")],
    ["missing MIME", () => new Response(imageBytes)],
    [
      "empty bytes",
      () => new Response(null, { headers: { "Content-Type": "image/jpeg" } }),
    ],
  ])(
    "rejects %s and recovers on the next image request",
    async (_, response) => {
      const { client, fetch } = setup();
      fetch.mockImplementationOnce(async () => response());
      await expect(finish(client.getImage(imageUrl))).rejects.toMatchObject({
        code: "invalid-response",
      });
      expect((await finish(client.getImage(imageUrl))).data).toEqual(
        imageBytes,
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
});

describe("pacing, retries and timeouts", () => {
  it("shares request pacing across simultaneous products, searches, and images", async () => {
    const { client, fetch } = setup({
      searchSections: ["home"],
      requestIntervalMs: 250,
    });
    const normal = fetch.getMockImplementation()!;
    const starts: number[] = [];
    fetch.mockImplementation((...args) => {
      starts.push(Date.now());
      return normal(...args);
    });
    const [product, results, artwork] = await finish(
      Promise.all([
        client.getProduct("RJ000001"),
        client.search("Tiny"),
        client.getImage(imageUrl),
      ]),
    );
    expect(product.score).toBe(96);
    expect(results).toHaveLength(2);
    expect(artwork.data).toEqual(imageBytes);
    expect(starts).toHaveLength(4);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(250);
  });

  it.each([403, 404, 410])(
    "does not retry permanent HTTP %s and permits recovery",
    async (status) => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(new Response(null, { status }));
      await expect(finish(client.getImage(imageUrl))).rejects.toMatchObject({
        code: "http",
        status,
        url: imageUrl,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect((await finish(client.getImage(imageUrl))).contentType).toBe(
        "image/jpeg",
      );
    },
  );

  it.each([408, 425, 500, 502, 503, 504])(
    "retries transient HTTP %s within the budget",
    async (status) => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(new Response(null, { status }));
      expect((await finish(client.getImage(imageUrl))).data).toEqual(
        imageBytes,
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("bounds retries, redacts transport causes, and does not poison later requests", async () => {
    const { client, fetch } = setup({ retries: 2, requestIntervalMs: 0 });
    const cause = new TypeError(
      "http://fixture-user:fixture-password@proxy.invalid",
      {
        cause: new Error("fixture-password"),
      },
    );
    fetch
      .mockRejectedValueOnce(cause)
      .mockRejectedValueOnce(cause)
      .mockRejectedValueOnce(cause);
    const error = await finish(client.getImage(imageUrl)).catch(
      (error: unknown) => error,
    );
    expect(error).toMatchObject({
      code: "network",
      message: "DLsite network request failed",
    });
    expect(error).not.toHaveProperty("cause");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((await finish(client.getImage(imageUrl))).data).toEqual(imageBytes);
  });
  it("redacts nested errors during response-body consumption, not only fetch", async () => {
    const { client, fetch } = setup({ retries: 0, requestIntervalMs: 0 });
    fetch.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(
              new Error("fixture-password", {
                cause: new Error("fixture-user"),
              }),
            );
          },
        }),
        { headers: { "content-type": "image/jpeg" } },
      ),
    );
    const error = await finish(client.getImage(imageUrl)).catch(
      (error: unknown) => error,
    );
    expect(error).toMatchObject({ code: "network" });
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain("fixture-");
  });

  it("aborts stalled fetches at the configured deadline and retries once", async () => {
    const { client, fetch } = setup({ timeoutMs: 100 });
    let aborted = false;
    fetch.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => {
            aborted = true;
            reject(init!.signal!.reason);
          });
        }),
    );
    expect((await finish(client.getImage(imageUrl))).data).toEqual(imageBytes);
    expect(aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("applies timeouts through response-body consumption, not just response headers", async () => {
    const { client, fetch } = setup({ timeoutMs: 100, retries: 0 });
    fetch.mockImplementationOnce(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init!.signal!.addEventListener("abort", () =>
                controller.error(init!.signal!.reason),
              );
            },
          }),
          { headers: { "Content-Type": "image/jpeg" } },
        ),
    );
    await expect(finish(client.getImage(imageUrl))).rejects.toMatchObject({
      code: "timeout",
    });
    expect((await finish(client.getImage(imageUrl))).data).toEqual(imageBytes);
  });

  it.each(["2", "Thu, 01 Jan 2026 00:00:02 GMT"])(
    "honors 429 Retry-After %s",
    async (retryAfter) => {
      const { client, fetch } = setup({ requestIntervalMs: 0 });
      const start = Date.now();
      fetch.mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": retryAfter },
        }),
      );
      const result = client.getImage(imageUrl);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await result).data).toEqual(imageBytes);
      expect(Date.now() - start).toBe(2000);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("uses bounded backoff for malformed Retry-After and shares the cooldown after exhausted retries", async () => {
    const { client, fetch } = setup({ retries: 0, requestIntervalMs: 0 });
    fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "nonsense" },
      }),
    );
    await expect(finish(client.getImage(imageUrl))).rejects.toMatchObject({
      status: 429,
      retryAfterMs: undefined,
    });
    const next = client.search("Tiny");
    await vi.advanceTimersByTimeAsync(499);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await finish(next)).toHaveLength(2);
  });

  it("surfaces long rate limits without sleeping for minutes or sending queued requests early", async () => {
    const { client, fetch } = setup();
    fetch.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
    );
    await expect(finish(client.getImage(imageUrl))).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 120_000,
    });
    await expect(finish(client.search("Tiny"))).rejects.toMatchObject({
      status: 429,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await finish(client.getImage(imageUrl))).data).toEqual(imageBytes);
  });
});

describe("positive caches and refresh", () => {
  it("deduplicates simultaneous ID/URL lookups and returns independently mutable values", async () => {
    const { client, fetch } = setup();
    const [first, second] = await finish(
      Promise.all([
        client.getProduct("RJ000001"),
        client.getProduct(buildWorkUrl("RJ000001", "maniax")),
        client.search("RJ000001"),
      ]),
    );
    expect(first).toEqual(second);
    first.title = "User edit";
    first.links.length = 0;
    expect(second.title).toBe("Tiny Adventure");
    expect((await client.getProduct("RJ000001")).links).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("deduplicates search and image requests and protects cached image bytes", async () => {
    const { client, fetch } = setup({ searchSections: ["home"] });
    const [first, second] = await finish(
      Promise.all([
        client.getImage(imageUrl),
        client.getImage(`${imageUrl}#fragment`),
        client.search("Tiny"),
        client.search(" Tiny "),
      ]),
    );
    first.data[0] = 0;
    expect(second.data).toEqual(imageBytes);
    expect((await client.getImage(imageUrl)).data).toEqual(imageBytes);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("expires product, search, and image caches and honors force refresh for each", async () => {
    const { client, fetch } = setup({
      cacheTtlMs: 1000,
      requestIntervalMs: 0,
      searchSections: ["home"],
    });
    const load = (forceRefresh = false) =>
      Promise.all([
        client.getProduct("RJ000001", { forceRefresh }),
        client.search("Tiny", { forceRefresh }),
        client.getImage(imageUrl, { forceRefresh }),
      ]);
    await finish(load());
    await finish(load());
    expect(fetch).toHaveBeenCalledTimes(4);
    await finish(load(true));
    expect(fetch).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(1000);
    await finish(load());
    expect(fetch).toHaveBeenCalledTimes(12);
  });

  it("shares an active refresh and surfaces refresh failure without replacing valid cached data", async () => {
    const { client, fetch } = setup({ requestIntervalMs: 0, retries: 0 });
    await finish(client.getImage(imageUrl));
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const results = await finish(
      Promise.allSettled([
        client.getImage(imageUrl, { forceRefresh: true }),
        client.getImage(imageUrl, { forceRefresh: true }),
        client.getImage(imageUrl),
      ]),
    );
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await client.getImage(imageUrl)).data).toEqual(imageBytes);
    expect(
      (await finish(client.getImage(imageUrl, { forceRefresh: true }))).data,
    ).toEqual(imageBytes);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("evicts old entries at the configured bound", async () => {
    const { client, fetch } = setup({
      cacheMaxEntries: 1,
      requestIntervalMs: 0,
    });
    await finish(client.getProduct("RJ000001"));
    await finish(client.getProduct("RJ000002"));
    await finish(client.getProduct("RJ000002"));
    expect(fetch).toHaveBeenCalledTimes(4);
    await finish(client.getProduct("RJ000001"));
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it.each([{ cacheTtlMs: 0 }, { cacheMaxEntries: 0 }])(
    "can disable completed-result caching with %o while keeping in-flight deduplication",
    async (options) => {
      const { client, fetch } = setup(options);
      await finish(
        Promise.all([client.getImage(imageUrl), client.getImage(imageUrl)]),
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      await finish(client.getImage(imageUrl));
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { timeoutMs: 0 },
    { timeoutMs: 60_001 },
    { retries: 4 },
    { retries: 0.5 },
    { requestIntervalMs: -1 },
    { cacheTtlMs: Infinity },
    { cacheMaxEntries: 1001 },
    { searchSections: [] },
  ])("rejects invalid bounds %o", (options) => {
    expect(() => new DlsiteClient(options)).toThrow(TypeError);
  });
});
