import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DlsiteParseError, parseProductHtml } from "../src/index.js";

const pageUrl = "https://www.dlsite.com/maniax/work/=/product_id/RJ000001.html";
const fixture = readFileSync(
  new URL("./fixtures/product.html", import.meta.url),
  "utf8",
);

function page(body = ""): string {
  return `<h1 id="work_name">Tiny Adventure</h1>${body}`;
}

function row(label: string, value: string): string {
  return `<table id="work_outline"><tr><th>${label}</th><td>${value}</td></tr></table>`;
}

describe("parseProductHtml", () => {
  it("extracts useful product data without treating topical tags as game genres", () => {
    const product = parseProductHtml(fixture, pageUrl);
    expect(product).toMatchObject({
      id: "RJ000001",
      title: "小さな冒険 & 空",
      url: pageUrl,
      circle: {
        id: "RG00001",
        name: "紙飛行機工房",
        url: "https://www.dlsite.com/maniax/circle/profile/=/maker_id/RG00001.html",
      },
      releaseDate: "2024-02-29",
      minimumAge: 0,
      workTypes: [{ code: "RPG", name: "ロールプレイング" }],
      tags: ["探索", "友情"],
      features: ["音楽あり", "アプリケーション", "コントローラー対応"],
      series: "空の旅",
      coverUrl: "https://img.dlsite.jp/synthetic/cover.jpg",
      galleryUrls: ["https://img.dlsite.jp/synthetic/scene.jpg"],
      score: 85,
      links: [
        { name: "DLsite", url: pageUrl },
        { name: "Ci-en", url: "https://ci-en.dlsite.com/creator/123" },
      ],
    });
  });

  it("converts descriptions to readable Markdown with resolved links and images", () => {
    const description = parseProductHtml(fixture, pageUrl).description;
    expect(description).toContain("## 空の旅");
    expect(description).toContain("**冒険**");
    expect(description).toContain("。  \n友達と歩こう。");
    expect(description).toMatch(/- +探索\n- +パズル/);
    expect(description).toContain(
      "[作品ページ](https://www.dlsite.com/home/work/=/product_id/RJ000001.html)",
    );
    expect(description).toContain(
      "![地図](https://img.dlsite.jp/synthetic/map.jpg)",
    );
    expect(description).not.toMatch(/doNotInclude|display:|<strong>/);
  });

  it("leaves absent optional fields unknown, not empty successful metadata", () => {
    const product = parseProductHtml(page(), pageUrl);
    expect(product.id).toBe("RJ000001");
    expect(product.title).toBe("Tiny Adventure");
    for (const field of [
      "circle",
      "releaseDate",
      "minimumAge",
      "workTypes",
      "tags",
      "features",
      "series",
      "description",
      "coverUrl",
      "galleryUrls",
      "score",
    ] as const) {
      expect(product[field], field).toBeUndefined();
    }
    expect(product.links).toEqual([{ name: "DLsite", url: pageUrl }]);
  });

  it("accepts a canonical section redirect, but never changes work identity", () => {
    expect(
      parseProductHtml(
        fixture,
        "https://www.dlsite.com/home/work/=/product_id/RJ000001.html?locale=en_US",
      ).url,
    ).toBe(pageUrl);
    expect(() =>
      parseProductHtml(
        fixture,
        "https://www.dlsite.com/home/work/=/product_id/RJ000002.html",
      ),
    ).toThrow(/identity/i);
  });

  it("uses only the matching decoded JSON record and scales its score once", () => {
    const product = parseProductHtml(fixture, pageUrl, {
      RJ000001: { work_name: "Unmasked title", rate_average_2dp: "4.79" },
      RJ000002: { work_name: "Other work", rate_average_2dp: 1 },
    });
    expect(product.title).toBe("Unmasked title");
    expect(product.score).toBe(96);
    expect(
      parseProductHtml(fixture, pageUrl, {
        RJ000002: { work_name: "Wrong identity", rate_average_2dp: 1 },
      }).score,
    ).toBe(85);
  });

  it("can fill a masked title, but requires an actual product page", () => {
    expect(
      parseProductHtml(
        '<h1 id="work_name">{{ product.work_name }}</h1>',
        pageUrl,
        {
          RJ000001: { work_name: "Readable title" },
        },
      ).title,
    ).toBe("Readable title");
    expect(() =>
      parseProductHtml("<h1>Access denied</h1>", pageUrl, {
        RJ000001: { work_name: "A title" },
      }),
    ).toThrow(DlsiteParseError);
  });

  it.each([
    "{{ product.rate_average_2dp }}",
    "",
    "0",
    "6",
    "85",
    "-1",
    "4.5/5",
  ])("does not fabricate a score from %s", (value) => {
    const html = page(`<meta itemprop="ratingValue" content="${value}">`);
    expect(
      parseProductHtml(html, pageUrl, {
        RJ000001: { rate_average_2dp: value },
      }).score,
    ).toBeUndefined();
  });

  it("uses a real HTML score when supplemental values are absent or invalid", () => {
    expect(
      parseProductHtml(fixture, pageUrl, {
        RJ000001: { work_name: " ", rate_average_2dp: null },
      }),
    ).toMatchObject({ title: "小さな冒険 & 空", score: 85 });
    expect(
      parseProductHtml(page('<span itemprop="ratingValue">5</span>'), pageUrl)
        .score,
    ).toBe(100);
    expect(
      parseProductHtml(page(), pageUrl, {
        RJ000001: { rate_average_2dp: 1 },
      }).score,
    ).toBe(20);
  });

  it.each([
    ["Release date", "Feb/29/2024 16", "2024-02-29"],
    ["发售日", "2023年5月1日", "2023-05-01"],
    ["販賣日", "2024年12月31日", "2024-12-31"],
    ["Release date", "2024-03-02", "2024-03-02"],
    ["Release date", "03/02/2024", undefined],
    ["販売日", "2023年02月29日", undefined],
    ["販売日", "2024年04月31日", undefined],
    ["Release date", "Coming soon", undefined],
    ["販売日", "2024年01月01日 / 2024年02月02日", undefined],
  ])(
    "handles release date %s / %s without guessing",
    (label, value, expected) => {
      expect(
        parseProductHtml(page(row(label, value)), pageUrl).releaseDate,
      ).toBe(expected);
    },
  );

  it.each([
    ["Age", "R-15", 15],
    ["年龄指定", "全年龄", 0],
    ["年齡指定", "全年齡", 0],
    ["年齢指定", "R18", 18],
    ["Age", "All ages", 0],
    ["Age", "Not specified", undefined],
  ])("recognizes evidenced age label %s / %s", (label, value, expected) => {
    expect(parseProductHtml(page(row(label, value)), pageUrl).minimumAge).toBe(
      expected,
    );
  });

  it("handles English and Chinese row labels and unknown work types literally", () => {
    const product = parseProductHtml(
      page(`
      ${row("Product format", '<a href="/home/works/type/=/work_type/NEW">New format</a>')}
      ${row("Genre", "<a>Exploration</a>")}
      ${row("Series name", "Clouds")}
      ${row("File format", "<span>Application</span>")}
      ${row("Miscellaneous", "<a>Controller</a>")}
    `),
      pageUrl,
    );
    expect(product.workTypes).toEqual([{ code: "NEW", name: "New format" }]);
    expect(product.tags).toEqual(["Exploration"]);
    expect(product.series).toBe("Clouds");
    expect(product.features).toEqual(["Application", "Controller"]);
    expect(
      parseProductHtml(page(row("分类", "<a>探索</a>")), pageUrl).tags,
    ).toEqual(["探索"]);
    expect(
      parseProductHtml(page(row("分類", "<a>探索</a>")), pageUrl).tags,
    ).toEqual(["探索"]);
  });

  it("preserves a circle name when its stable ID is unavailable", () => {
    expect(
      parseProductHtml(
        page('<span itemprop="brand">Paper Studio</span>'),
        pageUrl,
      ).circle,
    ).toEqual({ name: "Paper Studio" });
  });

  it("distinguishes observed empty sections from missing sections", () => {
    const product = parseProductHtml(
      page(`
      ${row("販売日", "")}${row("年齢指定", "")}
      ${row("ジャンル", "<a> </a>")}
      <div itemprop="description"><script>ignore()</script></div>
      <div id="work_left">
        <meta itemprop="image" content="//img.dlsite.jp/synthetic/cover.jpg">
        <div class="product-slider-data"></div>
      </div>
    `),
      pageUrl,
    );
    expect(product.releaseDate).toBeUndefined();
    expect(product.minimumAge).toBeUndefined();
    expect(product.tags).toEqual([]);
    expect(product.description).toBeUndefined();
    expect(product.coverUrl).toBe("https://img.dlsite.jp/synthetic/cover.jpg");
    expect(product.galleryUrls).toEqual([]);
  });

  it("deduplicates work types and keeps a plain-text topical tag readable", () => {
    const product = parseProductHtml(
      page(`
      ${row(
        "作品形式",
        `
        <a href="/home/works/type/=/work_type/RPG">Role-playing</a>
        <a href="/home/works/type/=/work_type/RPG">Role-playing</a>
        <a href="/home/works/type/=/work_type/ADV">Adventure</a>
      `,
      )}
      ${row("Genre", "Exploration")}
    `),
      pageUrl,
    );
    expect(product.workTypes).toEqual([
      { code: "RPG", name: "Role-playing" },
      { code: "ADV", name: "Adventure" },
    ]);
    expect(product.tags).toEqual(["Exploration"]);
  });

  it("uses only existing image URLs rather than manufacturing artwork variants", () => {
    const html = page(`<div id="work_left"><div class="product-slider-data">
      <div data-src="//img.dlsite.jp/synthetic/RJ000001_img_main.jpg"></div>
      <div data-src="/sample.jpg"></div>
      <div data-src="javascript:bad()"></div>
    </div></div>`);
    expect(parseProductHtml(html, pageUrl)).toMatchObject({
      coverUrl: "https://img.dlsite.jp/synthetic/RJ000001_img_main.jpg",
      galleryUrls: ["https://www.dlsite.com/sample.jpg"],
    });
  });

  it("removes non-web description targets without discarding readable text", () => {
    const product = parseProductHtml(
      page(`<div itemprop="description">
      <p><a href="javascript:bad()">Read me</a></p>
      <img src="data:image/png;base64,AA=="><img>
      <a href="/guide">Guide</a><iframe src="https://example.com"></iframe>
    </div><div class="link_cien"><a href="javascript:bad()">Bad</a></div>`),
      pageUrl,
    );
    expect(product.description).toBe(
      "Read me\n\n[Guide](https://www.dlsite.com/guide)",
    );
    expect(product.links).toHaveLength(1);
  });

  it.each([
    "",
    "<html><title>Gateway error</title><p>Try later</p></html>",
    '<h1 id="work_name"> </h1>',
  ])("rejects incomplete or unrelated product pages", (html) => {
    expect(() => parseProductHtml(html, pageUrl)).toThrow(DlsiteParseError);
  });

  it("reports an unavailable product explicitly", () => {
    expect(() =>
      parseProductHtml(
        '<div class="error_box_work"><p class="error_large_text">Unavailable</p></div>',
        pageUrl,
      ),
    ).toThrow(expect.objectContaining({ code: "unavailable" }));
  });

  it("rejects invalid source/canonical URLs and conflicting primary product IDs", () => {
    expect(() =>
      parseProductHtml(fixture, "https://example.com/RJ000001.html"),
    ).toThrow(DlsiteParseError);
    expect(() =>
      parseProductHtml(
        page('<link rel="canonical" href="https://example.com">'),
        pageUrl,
      ),
    ).toThrow(DlsiteParseError);
    expect(() =>
      parseProductHtml(
        page(
          '<div data-vue-component="product-price" data-product-id="RJ000002"></div>',
        ),
        pageUrl,
      ),
    ).toThrow(expect.objectContaining({ code: "identity-mismatch" }));
  });
});
