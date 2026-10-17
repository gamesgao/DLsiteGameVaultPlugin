import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
import { DlsiteParseError } from "./errors.js";
import { assertAvailable, cleanText, readDescription, webUrl } from "./html.js";
import { normalizeWorkId, parseWorkUrl } from "./identity.js";
import type {
  DlsiteCircle,
  DlsiteProduct,
  DlsiteProductInfoResponse,
  DlsiteWorkType,
} from "./types.js";

type Outline = Pick<
  DlsiteProduct,
  "releaseDate" | "minimumAge" | "workTypes" | "tags" | "series" | "features"
>;

const labels: Record<string, keyof Outline | "format"> = {
  販売日: "releaseDate",
  "release date": "releaseDate",
  发售日: "releaseDate",
  販賣日: "releaseDate",
  年齢指定: "minimumAge",
  age: "minimumAge",
  年龄指定: "minimumAge",
  年齡指定: "minimumAge",
  作品形式: "format",
  "product format": "format",
  ジャンル: "tags",
  genre: "tags",
  分类: "tags",
  分類: "tags",
  シリーズ名: "series",
  "series name": "series",
  系列名: "series",
  ファイル形式: "features",
  "file format": "features",
  文件形式: "features",
  檔案形式: "features",
  その他: "features",
  miscellaneous: "features",
  其他: "features",
};

function releaseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const local = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(?: \d{1,2}時)?$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const english = value.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{1,2})\/(\d{4})(?: \d{1,2})?$/i,
  );
  const parts = local ?? iso;
  let year: number, month: number, day: number;
  if (parts) {
    year = Number(parts[1]);
    month = Number(parts[2]);
    day = Number(parts[3]);
  } else if (english) {
    year = Number(english[3]);
    month =
      [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ].indexOf(english[1]!.toLowerCase()) + 1;
    day = Number(english[2]);
  } else {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

function minimumAge(value: string | undefined): DlsiteProduct["minimumAge"] {
  if (!value) return undefined;
  if (["全年齢", "全年龄", "全年齡", "all ages"].includes(value.toLowerCase()))
    return 0;
  if (/^R-?15$/i.test(value)) return 15;
  if (/^R-?18$/i.test(value)) return 18;
  return undefined;
}

function values(cell: ReturnType<CheerioAPI>, $: CheerioAPI): string[] {
  const anchors = cell.find("a");
  const spans = cell.find("span");
  const nodes = anchors.length ? anchors : spans.length ? spans : cell;
  return [
    ...new Set(
      nodes.toArray().flatMap((element) => {
        const text = cleanText($(element).text());
        return text ? [text] : [];
      }),
    ),
  ];
}

function readOutline($: CheerioAPI): Outline {
  const result: Outline = {};
  $("#work_outline tr").each((_, element) => {
    const row = $(element);
    const label = cleanText(row.find("th").first().text())?.toLowerCase();
    const cell = row.find("td").first();
    const text = cleanText(cell.text());
    switch (label ? labels[label] : undefined) {
      case "releaseDate":
        result.releaseDate = releaseDate(text);
        break;
      case "minimumAge":
        result.minimumAge = minimumAge(text);
        break;
      case "series":
        result.series = text;
        break;
      case "tags":
        result.tags = values(cell, $);
        break;
      case "features":
        result.features = [
          ...new Set([...(result.features ?? []), ...values(cell, $)]),
        ];
        break;
      case "format": {
        const workTypes: DlsiteWorkType[] = [];
        const features: string[] = [];
        cell.find("a").each((_, anchor) => {
          const link = $(anchor);
          const name = cleanText(link.text());
          if (!name) return;
          const code = link
            .attr("href")
            ?.match(/\/work_type\/([a-z0-9_]+)(?:\/|$)/i)?.[1];
          if (code) {
            if (!workTypes.some((type) => type.code === code)) {
              workTypes.push({ code, name });
            }
          } else {
            features.push(name);
          }
        });
        result.workTypes = workTypes;
        result.features = [
          ...new Set([...(result.features ?? []), ...features]),
        ];
      }
    }
  });
  return result;
}

function readCircle($: CheerioAPI, base: string): DlsiteCircle | undefined {
  const brand = $('[itemprop="brand"]').first();
  const name = cleanText(brand.text());
  if (!name) return undefined;
  const url = webUrl(brand.find("a").first().attr("href"), base);
  const id = url
    ?.match(
      /^https?:\/\/(?:www\.)?dlsite\.com\/[^?#]*\/maker_id\/([a-z]{2}\d+)\.html(?:[/?#]|$)/i,
    )?.[1]
    ?.toUpperCase();
  return { name, id, url };
}

function score(value: number | string | null | undefined): number | undefined {
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim()))
    return undefined;
  const rating = Number(value);
  return rating >= 1 && rating <= 5 ? Math.round(rating * 20) : undefined;
}

export function parseProductHtml(
  html: string,
  pageUrl: string,
  productInfo?: DlsiteProductInfoResponse,
): DlsiteProduct {
  const source = parseWorkUrl(pageUrl);
  if (!source)
    throw new DlsiteParseError(
      "invalid-page",
      "Expected a supported DLsite work URL",
    );
  const $ = load(html);
  assertAvailable($);
  const canonical = $('link[rel="canonical"]').first().attr("href");
  const identity = canonical
    ? parseWorkUrl(webUrl(canonical, source.url) ?? "")
    : source;
  if (!identity)
    throw new DlsiteParseError(
      "invalid-page",
      "Invalid DLsite canonical work URL",
    );
  if (identity.id !== source.id) {
    throw new DlsiteParseError(
      "identity-mismatch",
      "DLsite page identity differs from the requested work",
    );
  }
  $(
    '[data-vue-component="product-slider"][data-product-id], [data-vue-component="product-price"][data-product-id]',
  ).each((_, element) => {
    if (
      normalizeWorkId($(element).attr("data-product-id") ?? "") !== source.id
    ) {
      throw new DlsiteParseError(
        "identity-mismatch",
        "Conflicting DLsite product identity",
      );
    }
  });

  const supplemental = productInfo?.[identity.id];
  const heading = $("#work_name");
  const title = cleanText(supplemental?.work_name) ?? cleanText(heading.text());
  if (!heading.length || !title) {
    throw new DlsiteParseError(
      "invalid-page",
      "DLsite product page is missing its title",
    );
  }

  const slider = $("#work_left .product-slider-data");
  const images = [
    ...new Set(
      slider
        .find("[data-src]")
        .toArray()
        .flatMap((element) => {
          const url = webUrl($(element).attr("data-src"), identity.url);
          return url ? [url] : [];
        }),
    ),
  ];
  const coverUrl =
    webUrl($('meta[property="og:image"]').attr("content"), identity.url) ??
    webUrl($('#work_left [itemprop="image"]').attr("content"), identity.url) ??
    images.find((url) => url.includes("_img_main."));
  const rating = $('[itemprop="ratingValue"]').first();
  const links = [{ name: "DLsite", url: identity.url }];
  const cien = webUrl($(".link_cien a").first().attr("href"), identity.url);
  if (cien) links.push({ name: "Ci-en", url: cien });

  return {
    id: identity.id,
    title,
    url: identity.url,
    circle: readCircle($, identity.url),
    ...readOutline($),
    description: readDescription($, identity.url),
    coverUrl,
    galleryUrls: slider.length
      ? images.filter((url) => url !== coverUrl)
      : undefined,
    score:
      score(supplemental?.rate_average_2dp) ??
      score(rating.attr("content") ?? rating.text()),
    links,
  };
}
