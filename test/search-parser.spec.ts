import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DlsiteParseError, parseSearchHtml } from "../src/index.js";

const fixture = readFileSync(
  new URL("./fixtures/search.html", import.meta.url),
  "utf8",
);

describe("parseSearchHtml", () => {
  it("parses the real list structure and keeps the first candidate per work ID", () => {
    expect(parseSearchHtml(fixture)).toEqual([
      {
        id: "RJ000001",
        title: "Tiny & Sky",
        url: "https://www.dlsite.com/home/work/=/product_id/RJ000001.html",
        excerpt: "Explore together.",
      },
      {
        id: "VJ00000002",
        title: "Second game",
        url: "https://www.dlsite.com/soft/work/=/product_id/VJ00000002.html",
      },
    ]);
  });

  it("returns a valid empty list without interpreting unrelated pages as no matches", () => {
    expect(
      parseSearchHtml('<table class="work_1col_table n_worklist"></table>'),
    ).toEqual([]);
    expect(
      parseSearchHtml(
        '<table class="work_1col_table n_worklist"><tr><th>Title</th></tr></table>',
      ),
    ).toEqual([]);
    expect(() => parseSearchHtml("<h1>502 Bad Gateway</h1>")).toThrow(
      DlsiteParseError,
    );
    expect(() => parseSearchHtml("")).toThrow(DlsiteParseError);
    expect(() =>
      parseSearchHtml(
        '<div class="error_box_work">Unavailable</div><table class="work_1col_table n_worklist"></table>',
      ),
    ).toThrow(expect.objectContaining({ code: "unavailable" }));
  });

  it("does not turn a broken result list into a successful empty result", () => {
    expect(() =>
      parseSearchHtml(`<table class="work_1col_table n_worklist"><tr>
      <td class="work_name"><a href="https://example.com/RJ000001.html">Not a work</a></td>
    </tr></table>`),
    ).toThrow(DlsiteParseError);
  });

  it("skips incomplete entries while retaining usable candidates", () => {
    const extra = `<table class="work_1col_table n_worklist">
      <tr><td class="work_name"><a href="/home/work/=/product_id/RJ000002.html"> </a></td></tr>
      <tr><td class="work_name"><a>Missing URL</a></td></tr>
      <tr><td class="work_name"><a href="javascript:bad()">Invalid URL</a></td></tr>
    </table>`;
    expect(parseSearchHtml(fixture + extra)).toHaveLength(2);
  });
});
