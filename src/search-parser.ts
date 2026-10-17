import { load } from "cheerio";
import { DlsiteParseError } from "./errors.js";
import { assertAvailable, cleanText, webUrl } from "./html.js";
import { parseWorkUrl } from "./identity.js";
import type { DlsiteSearchCandidate } from "./types.js";

export function parseSearchHtml(html: string): DlsiteSearchCandidate[] {
  const $ = load(html);
  assertAvailable($);
  const lists = $(".work_1col_table.n_worklist");
  if (!lists.length) {
    if ($(".work_not_found > .lead").length) return [];
    throw new DlsiteParseError(
      "invalid-page",
      "DLsite search result list is missing",
    );
  }
  const results = new Map<string, DlsiteSearchCandidate>();
  const entries = lists.find("tr .work_name");
  entries.each((_, element) => {
    const entry = $(element);
    const link = entry.find("a").first();
    const title = cleanText(link.text());
    const url = webUrl(link.attr("href"), "https://www.dlsite.com/");
    const identity = url ? parseWorkUrl(url) : undefined;
    if (!title || !identity || results.has(identity.id)) return;
    results.set(identity.id, {
      id: identity.id,
      title,
      url: identity.url,
      excerpt: cleanText(entry.closest("tr").find(".work_text").text()),
    });
  });
  if (entries.length && !results.size) {
    throw new DlsiteParseError(
      "invalid-page",
      "DLsite search list has no readable work entries",
    );
  }
  return [...results.values()];
}
