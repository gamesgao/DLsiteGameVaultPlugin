import type { CheerioAPI } from "cheerio";
import TurndownService from "turndown";
import { DlsiteParseError } from "./errors.js";

const markdown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
});

export function cleanText(
  value: string | null | undefined,
): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  return text && !text.includes("{{") ? text : undefined;
}

export function webUrl(
  value: string | undefined,
  base: string,
): string | undefined {
  if (!value?.trim() || !URL.canParse(value, base)) return undefined;
  const url = new URL(value, base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    return undefined;
  }
  return url.href;
}

export function assertAvailable($: CheerioAPI): void {
  const error = $(".error_box_work");
  if (error.length) {
    throw new DlsiteParseError(
      "unavailable",
      cleanText(error.text()) ?? "DLsite product is unavailable",
    );
  }
}

export function readDescription(
  $: CheerioAPI,
  base: string,
): string | undefined {
  const description = $('[itemprop="description"]').first().clone();
  if (!description.length) return undefined;
  description
    .find("script, style, template, noscript, iframe, object, embed")
    .remove();
  description.find("a, img").each((_, element) => {
    const node = $(element);
    const attribute = element.tagName === "a" ? "href" : "src";
    const url = webUrl(node.attr(attribute), base);
    if (url) {
      node.attr(attribute, url);
    } else if (attribute === "href") {
      node.removeAttr(attribute);
    } else {
      node.remove();
    }
  });
  return markdown.turndown(description.html() ?? "").trim() || undefined;
}
