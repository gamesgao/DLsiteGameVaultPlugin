import "reflect-metadata";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GameMetadata } from "../../../src/modules/metadata/games/game.metadata.entity.js";
import { PublisherMetadata } from "../../../src/modules/metadata/publishers/publisher.metadata.entity.js";
import { parseProductHtml, buildWorkUrl } from "../src/index.js";
import type { DlsiteProduct } from "../src/index.js";
import {
  mapCandidate,
  mapProduct,
  mapProductCandidate,
} from "../plugin/mapper.js";

const full = () =>
  parseProductHtml(
    readFileSync(
      new URL("../test/fixtures/product.html", import.meta.url),
      "utf8",
    ),
    buildWorkUrl("RJ000001"),
  );
const minimal = (id = "RJ000001"): DlsiteProduct => ({
  id,
  title: "New title",
  url: buildWorkUrl(id),
  links: [{ name: "DLsite", url: buildWorkUrl(id) }],
});

describe("native metadata mapping", () => {
  it("maps real parsed fields, UTC calendar date and score exactly once", () => {
    const result = mapProduct(full());
    expect(result).toBeInstanceOf(GameMetadata);
    expect(result).toMatchObject({
      provider_slug: "dlsite",
      provider_data_id: "RJ000001",
      provider_data_url: buildWorkUrl("RJ000001", "maniax"),
      title: "小さな冒険 & 空",
      release_date: new Date("2024-02-29T00:00:00.000Z"),
      age_rating: 0,
      rating: 85,
      developers: [
        {
          name: "紙飛行機工房",
          provider_slug: "dlsite",
          provider_data_id: "maker:RG00001",
        },
      ],
      genres: [
        {
          name: "ロールプレイング",
          provider_slug: "dlsite",
          provider_data_id: "work-type:RPG",
        },
      ],
      publishers: [],
      url_websites: [
        buildWorkUrl("RJ000001", "maniax"),
        "https://ci-en.dlsite.com/creator/123",
      ],
      url_screenshots: ["https://img.dlsite.jp/synthetic/scene.jpg"],
    });
    expect(result.description).toContain("## 空の旅");
    expect(result.tags?.map((tag) => tag.name)).toEqual([
      "探索",
      "友情",
      "Series: 空の旅",
      "Features: 音楽あり",
      "Features: アプリケーション",
      "Features: コントローラー対応",
    ]);
    expect(result.tags?.every((tag) => tag.provider_slug === "dlsite")).toBe(
      true,
    );
    expect(result).not.toHaveProperty("icon");
    expect(result).not.toHaveProperty("user_metadata");
  });

  it("leaves missing values unknown without inventing a publisher or age", () => {
    const result = mapProduct(minimal());
    for (const field of [
      "rating",
      "age_rating",
      "release_date",
      "description",
      "url_screenshots",
      "cover",
    ]) {
      expect(result[field as keyof GameMetadata]).toBeUndefined();
    }
    expect([
      result.developers,
      result.publishers,
      result.genres,
      result.tags,
    ]).toEqual([[], [], [], []]);
  });

  it.each([undefined, []])(
    "preserves prior relations for missing or empty sections: %s",
    (empty) => {
      const previous = mapProduct(full());
      previous.publishers = [
        Object.assign(new PublisherMetadata(), {
          provider_slug: "dlsite",
          provider_data_id: "known-publisher",
          name: "Known publisher",
        }),
      ];
      const result = mapProduct(
        {
          ...minimal(),
          workTypes: empty,
          tags: empty,
          features: empty,
          galleryUrls: empty,
        },
        previous,
      );
      expect(result.title).toBe("New title");
      expect(result.url_websites).toContain(
        "https://ci-en.dlsite.com/creator/123",
      );
      expect(result.url_websites).toContain(buildWorkUrl("RJ000001"));
      for (const key of [
        "developers",
        "publishers",
        "genres",
        "tags",
        "rating",
        "age_rating",
        "description",
        "release_date",
        "url_screenshots",
      ] as const) {
        expect(result[key]).toEqual(previous[key]);
      }
    },
  );

  it("updates supplied tag groups independently, preserving unknown groups", () => {
    const previous = mapProduct(full());
    const result = mapProduct(
      { ...minimal(), tags: ["謎", "謎"], features: ["音声"] },
      previous,
    );
    expect(result.tags?.map((tag) => tag.name)).toEqual([
      "謎",
      "Series: 空の旅",
      "Features: 音声",
    ]);
    const next = mapProduct({ ...minimal(), series: "次の旅" }, result);
    expect(next.tags?.map((tag) => tag.name)).toEqual([
      "謎",
      "Series: 次の旅",
      "Features: 音声",
    ]);
    expect(previous.tags?.map((tag) => tag.name)).toContain("友情");
  });

  it("deduplicates refreshed website links without erasing absent optional links", () => {
    const product = full();
    const previous = mapProduct(product);
    expect(mapProduct(product, previous).url_websites).toEqual(
      previous.url_websites,
    );
  });

  it("replaces known relations and scalars including all-ages zero", () => {
    const previous = mapProduct(full());
    const result = mapProduct(
      {
        ...minimal(),
        circle: { name: "新工房" },
        workTypes: [{ code: "NEW", name: "新形式" }],
        score: 92,
        minimumAge: 0,
        releaseDate: "2025-03-01",
        description: "New text",
        galleryUrls: ["https://img.dlsite.jp/new.jpg"],
      },
      { ...previous, age_rating: 18 },
    );
    expect(result.rating).toBe(92);
    expect(result.age_rating).toBe(0);
    expect(result.description).toBe("New text");
    expect(result.release_date?.toISOString()).toBe("2025-03-01T00:00:00.000Z");
    expect(result.developers?.map((d) => d.name)).toEqual(["新工房"]);
    expect(result.genres?.map((g) => g.name)).toEqual(["新形式"]);
    expect(result.url_screenshots).toEqual(["https://img.dlsite.jp/new.jpg"]);
  });

  it.each([
    { provider_slug: "dlsite", provider_data_id: "RJ000002" },
    { provider_slug: "other", provider_data_id: "RJ000001" },
  ])("never copies another product/provider's values: %j", (identity) => {
    expect(
      mapProduct(minimal(), { ...mapProduct(full()), ...identity }),
    ).toEqual(mapProduct(minimal()));
  });

  it("keeps CJK identities distinct and stable without slug transliteration", () => {
    const result = mapProduct({
      ...minimal(),
      circle: { name: "紙工房" },
      tags: ["空", "海"],
      features: ["空"],
      series: "空",
    });
    const ids = result.tags!.map((tag) => tag.provider_data_id);
    expect(new Set(ids).size).toBe(4);
    expect(
      mapProduct({ ...minimal(), tags: ["海", "空"] }).tags?.map(
        (tag) => tag.provider_data_id,
      ),
    ).toEqual(ids.slice(0, 2).reverse());
    expect(
      mapProduct({ ...minimal(), circle: { name: "紙工房" } }).developers,
    ).toEqual(result.developers);
    expect(
      mapProduct({ ...minimal(), circle: { name: "木工房" } }).developers?.[0]
        ?.provider_data_id,
    ).not.toBe(result.developers?.[0]?.provider_data_id);
    expect(mapProduct({ ...minimal(), tags: ["é"] }).tags).toMatchObject([
      {
        provider_data_id: mapProduct({ ...minimal(), tags: ["e\u0301"] })
          .tags?.[0]?.provider_data_id,
      },
    ]);
  });

  it("returns useful minimal candidates for keyword and exact searches", () => {
    expect(
      mapCandidate({
        id: "RJ000001",
        title: "Adventure",
        url: buildWorkUrl("RJ000001"),
        excerpt: "A story",
      }),
    ).toEqual({
      provider_slug: "dlsite",
      provider_data_id: "RJ000001",
      title: "Adventure",
      description: "A story",
    });
    expect(mapProductCandidate(full())).toMatchObject({
      provider_slug: "dlsite",
      provider_data_id: "RJ000001",
      title: "小さな冒険 & 空",
      release_date: new Date("2024-02-29T00:00:00.000Z"),
      cover_url: "https://img.dlsite.jp/synthetic/cover.jpg",
    });
    expect(mapProductCandidate(minimal()).release_date).toBeUndefined();
  });
});
