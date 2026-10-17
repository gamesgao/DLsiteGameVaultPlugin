import "reflect-metadata";
import { readFileSync } from "node:fs";
import { Logger, Module, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GamevaultGame } from "../../../src/modules/games/gamevault-game.entity.js";
import { Media } from "../../../src/modules/media/media.entity.js";
import { MediaModule } from "../../../src/modules/media/media.module.js";
import { MediaService } from "../../../src/modules/media/media.service.js";
import { MetadataModule } from "../../../src/modules/metadata/metadata.module.js";
import { MetadataService } from "../../../src/modules/metadata/metadata.service.js";
import { GameMetadataService } from "../../../src/modules/metadata/games/game.metadata.service.js";
import type { GameMetadata } from "../../../src/modules/metadata/games/game.metadata.entity.js";
import { DeveloperMetadataService } from "../../../src/modules/metadata/developers/developer.metadata.service.js";
import { PublisherMetadataService } from "../../../src/modules/metadata/publishers/publisher.metadata.service.js";
import { TagMetadataService } from "../../../src/modules/metadata/tags/tag.metadata.service.js";
import { GenreMetadataService } from "../../../src/modules/metadata/genres/genre.metadata.service.js";
import DlsitePluginModule from "../plugin/dlsite.plugin.module.js";
import { DlsiteMetadataProviderService } from "../plugin/dlsite.metadata-provider.service.js";
import { mapProduct } from "../plugin/mapper.js";
import {
  buildWorkUrl,
  parseProductHtml,
  DlsiteClientError,
  DlsiteParseError,
} from "../src/index.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), "utf8");
const fullHtml = fixture("product.html");
const coverUrl = "https://img.dlsite.jp/synthetic/cover.jpg";
const sceneUrl = "https://img.dlsite.jp/synthetic/scene.jpg";
const page = (id = "RJ000001") => `<h1 id="work_name">Title ${id}</h1>`;
const html = (body: string) =>
  new Response(body, { headers: { "content-type": "text/html" } });
const media = (id: number, source_url: string) =>
  Object.assign(new Media(), { id, source_url, type: "image/jpeg" });
const game = (title?: string, file_path?: string) =>
  Object.assign(new GamevaultGame(), { title, file_path });
const modules: TestingModule[] = [];

async function setup(productHtml = page()) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/product/info/")) {
      return Response.json({ [url.searchParams.get("product_id")!]: {} });
    }
    if (url.pathname.includes("/fsr/")) return html(fixture("search.html"));
    return html(productHtml);
  });
  vi.stubGlobal("fetch", fetch);
  const metadata = { registerProvider: vi.fn() };
  const savedGames = {
    findByProviderSlug: vi
      .fn<() => Promise<GameMetadata[]>>()
      .mockResolvedValue([]),
    save: vi.fn(),
  };
  let imageId = 100;
  const images = {
    downloadByUrl: vi.fn(async (url: string) => media(imageId++, url)),
    isAvailable: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  };
  const providers = [
    { provide: MetadataService, useValue: metadata },
    { provide: GameMetadataService, useValue: savedGames },
    ...[
      DeveloperMetadataService,
      PublisherMetadataService,
      TagMetadataService,
      GenreMetadataService,
    ].map((provide) => ({ provide, useValue: {} })),
  ];
  @Module({ providers, exports: providers.map(({ provide }) => provide) })
  class MetadataBoundary {}
  @Module({
    providers: [{ provide: MediaService, useValue: images }],
    exports: [MediaService],
  })
  class MediaBoundary {}
  const module = await Test.createTestingModule({
    imports: [DlsitePluginModule],
  })
    .overrideModule(MetadataModule)
    .useModule(MetadataBoundary)
    .overrideModule(MediaModule)
    .useModule(MediaBoundary)
    .compile();
  modules.push(module);
  await module.init();
  return {
    provider: module.get(DlsiteMetadataProviderService),
    plugin: module.get(DlsitePluginModule),
    metadata,
    savedGames,
    images,
    fetch,
  };
}

beforeEach(() => {
  vi.stubEnv("PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS", "0");
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await Promise.all(modules.splice(0).map((module) => module.close()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("native provider behavior", () => {
  it("loads the default Nest module and registers exactly one dlsite provider", async () => {
    const { provider, metadata, plugin } = await setup();
    expect(metadata.registerProvider).toHaveBeenCalledExactlyOnceWith(provider);
    expect(provider.getDto()).toEqual({
      slug: "dlsite",
      name: "DLsite",
      priority: 20,
      enabled: true,
    });
    expect(plugin.metadata.name).toBe("DLsite");
  });

  it("uses configured locale and priority on the actual client/provider", async () => {
    vi.stubEnv("PLUGIN_GAMESGAO_DLSITE_LOCALE", "zh_TW");
    vi.stubEnv("PLUGIN_GAMESGAO_DLSITE_PRIORITY", "30");
    const { provider, fetch } = await setup();
    await provider.search("RJ000001");
    expect(provider.getDto().priority).toBe(30);
    expect(
      new URL(String(fetch.mock.calls[0]![0])).searchParams.get("locale"),
    ).toBe("zh_TW");
  });

  it.each(["rj000001", buildWorkUrl("RJ000001", "maniax")])(
    "returns rich exact search candidates for %s",
    async (query) => {
      const { provider, images } = await setup(fullHtml);
      const [result] = await provider.search(query);
      expect(result).toMatchObject({
        provider_slug: "dlsite",
        provider_data_id: "RJ000001",
        title: "小さな冒険 & 空",
        cover_url: coverUrl,
        release_date: new Date("2024-02-29T00:00:00Z"),
      });
      expect(result?.description).toContain("## 空の旅");
      expect(images.downloadByUrl).not.toHaveBeenCalled();
    },
  );

  it("exposes keyword candidates without automatically selecting one", async () => {
    const { provider } = await setup();
    const results = await provider.search("Adventure");
    expect(results.length).toBeGreaterThan(1);
    expect(results[0]).toMatchObject({
      provider_slug: "dlsite",
      provider_data_id: "RJ000001",
      title: "Tiny & Sky",
    });
    expect(results[0]?.description).toBeTruthy();
  });

  it.each([
    ["[RJ000001] Adventure", undefined],
    ["Adventure", "/files/[rj000001] Adventure (W).zip"],
    ["RJ000001", "C:\\files\\RJ000001 (NC).zip"],
    [undefined, "RJ000001.zip"],
  ])(
    "matches explicit unambiguous identity, leaving NC policy to the host: %s",
    async (title, path) => {
      const { provider } = await setup();
      expect(await provider.getBestMatch(game(title, path))).toMatchObject({
        provider_slug: "dlsite",
        provider_data_id: "RJ000001",
      });
    },
  );

  it.each([
    ["Adventure", "/files/Adventure.zip"],
    ["RJ000001 RJ000002", undefined],
    ["RJ000001", "/files/RJ000002.zip"],
    ["Adventure", "/files/RJ000001/Adventure.zip"],
    [undefined, undefined],
  ])(
    "refuses absent/conflicting IDs without a title-search guess: %s",
    async (title, path) => {
      const { provider, fetch } = await setup();
      await expect(
        provider.getBestMatch(game(title, path)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("checks version filenames together instead of silently choosing a conflicting version", async () => {
    const { provider } = await setup();
    const { GameVersion } =
      await import("../../../src/modules/games/game-version.entity.js");
    const input = Object.assign(game("Adventure"), {
      versions: [
        Object.assign(new GameVersion(), { file_path: "RJ000001.zip" }),
      ],
    });
    expect((await provider.getBestMatch(input)).provider_data_id).toBe(
      "RJ000001",
    );
    input.versions.push(
      Object.assign(new GameVersion(), { file_path: "RJ000002.zip" }),
    );
    await expect(provider.getBestMatch(input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("looks up manual provider_data_id directly, refreshes cached products and never saves itself", async () => {
    const { provider, fetch, savedGames } = await setup(fullHtml);
    await provider.search("RJ000001");
    fetch.mockClear();
    const result = await provider.getByProviderDataIdOrFail(" rj000001 ");
    expect(result).toMatchObject({
      provider_slug: "dlsite",
      provider_data_id: "RJ000001",
      rating: 85,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(savedGames.findByProviderSlug).toHaveBeenCalledWith("dlsite", {
      loadRelations: true,
    });
    expect(savedGames.save).not.toHaveBeenCalled();
  });

  it.each(["bad", "RJ000001 RJ000002", buildWorkUrl("RJ000001")])(
    "rejects invalid manual ID %s",
    async (id) => {
      const { provider, fetch } = await setup();
      await expect(
        provider.getByProviderDataIdOrFail(id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("preserves same-ID optional relations and images, not another remapped product", async () => {
    const { provider, savedGames, images } = await setup();
    const previous = mapProduct(
      parseProductHtml(fullHtml, buildWorkUrl("RJ000001")),
    );
    previous.cover = media(1, coverUrl);
    savedGames.findByProviderSlug.mockResolvedValue([previous]);
    const same = await provider.getByProviderDataIdOrFail("RJ000001");
    expect(same.tags).toEqual(previous.tags);
    expect(same.cover).toBe(previous.cover);
    const different = await provider.getByProviderDataIdOrFail("RJ000002");
    expect(different.tags).toEqual([]);
    expect(different.developers).toEqual([]);
    expect(different.cover).toBeUndefined();
    expect(different.rating).toBeUndefined();
    expect(images.downloadByUrl).not.toHaveBeenCalled();
  });

  it.each([404, 410])(
    "converts absent products (%i) to native NotFound",
    async (status) => {
      const { provider, fetch, savedGames, images } = await setup();
      fetch.mockResolvedValue(new Response("", { status }));
      await expect(
        provider.getByProviderDataIdOrFail("RJ000001"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(savedGames.findByProviderSlug).not.toHaveBeenCalled();
      expect(images.downloadByUrl).not.toHaveBeenCalled();
    },
  );

  it("converts explicit unavailable HTML to native NotFound", async () => {
    const { provider } = await setup(
      '<div class="error_box_work">Unavailable</div>',
    );
    await expect(provider.search("RJ000001")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("propagates full HTTP, parse and database failures before any metadata save", async () => {
    const { provider, fetch, savedGames, images } =
      await setup("broken layout");
    await expect(
      provider.getByProviderDataIdOrFail("RJ000001"),
    ).rejects.toBeInstanceOf(DlsiteParseError);
    fetch.mockResolvedValueOnce(new Response("", { status: 403 }));
    await expect(
      provider.getByProviderDataIdOrFail("RJ000001"),
    ).rejects.toBeInstanceOf(DlsiteClientError);
    fetch.mockResolvedValueOnce(html(page()));
    savedGames.findByProviderSlug.mockRejectedValue(
      new Error("Database unavailable"),
    );
    await expect(
      provider.getByProviderDataIdOrFail("RJ000001"),
    ).rejects.toThrow("Database unavailable");
    expect(images.downloadByUrl).not.toHaveBeenCalled();
    expect(savedGames.save).not.toHaveBeenCalled();
  });

  it("logs supplemental failure and preserves a prior score when HTML has none", async () => {
    const { provider, fetch, savedGames } = await setup();
    savedGames.findByProviderSlug.mockResolvedValue([
      mapProduct({
        id: "RJ000001",
        title: "Old",
        url: buildWorkUrl("RJ000001"),
        links: [],
        score: 92,
      }),
    ]);
    fetch
      .mockResolvedValueOnce(html(page()))
      .mockResolvedValueOnce(new Response("", { status: 403 }));
    expect((await provider.getByProviderDataIdOrFail("RJ000001")).rating).toBe(
      92,
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "RJ000001" }),
    );
  });
});

describe("host image handling", () => {
  it("downloads actual source images using host MediaService with no invented icon", async () => {
    const { provider, images } = await setup(fullHtml);
    const result = await provider.getByProviderDataIdOrFail("RJ000001");
    expect(result.cover).toMatchObject({
      source_url: coverUrl,
      type: "image/jpeg",
    });
    expect(result.background).toMatchObject({ source_url: sceneUrl });
    expect(images.downloadByUrl.mock.calls.map(([url]) => url)).toEqual([
      coverUrl,
      sceneUrl,
    ]);
  });

  it("reuses unchanged available source images without redownloading", async () => {
    const { provider, savedGames, images } = await setup(fullHtml);
    const previous = mapProduct(
      parseProductHtml(fullHtml, buildWorkUrl("RJ000001")),
    );
    previous.cover = media(1, coverUrl);
    previous.background = media(2, sceneUrl);
    savedGames.findByProviderSlug.mockResolvedValue([previous]);
    const result = await provider.getByProviderDataIdOrFail("RJ000001");
    expect(result.cover).toBe(previous.cover);
    expect(result.background).toBe(previous.background);
    expect(images.downloadByUrl).not.toHaveBeenCalled();
  });

  it("redownloads same-source images whose host file has disappeared", async () => {
    const { provider, savedGames, images } = await setup(fullHtml);
    savedGames.findByProviderSlug.mockResolvedValue([
      Object.assign(
        mapProduct({
          id: "RJ000001",
          title: "Old",
          url: buildWorkUrl("RJ000001"),
          links: [],
        }),
        { cover: media(1, coverUrl) },
      ),
    ]);
    images.isAvailable.mockResolvedValue(false);
    expect(
      (await provider.getByProviderDataIdOrFail("RJ000001")).cover?.id,
    ).toBe(100);
  });

  it("keeps valid old images on a temporary download or host format failure", async () => {
    const { provider, savedGames, images } = await setup(fullHtml);
    const previous = Object.assign(
      mapProduct(parseProductHtml(fullHtml, buildWorkUrl("RJ000001"))),
      {
        cover: media(1, "https://img.dlsite.jp/old-cover.jpg"),
        background: media(2, "https://img.dlsite.jp/old-scene.jpg"),
      },
    );
    savedGames.findByProviderSlug.mockResolvedValue([previous]);
    images.downloadByUrl.mockRejectedValue(
      new Error("Download/format unavailable"),
    );
    const result = await provider.getByProviderDataIdOrFail("RJ000001");
    expect(result.cover).toBe(previous.cover);
    expect(result.background).toBe(previous.background);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "DLsite image failed; retaining available same-ID image.",
      }),
    );
  });

  it.each([false, true])(
    "fails snapshot on image failure without usable prior media (missing=%s)",
    async (missing) => {
      const { provider, savedGames, images } = await setup(fullHtml);
      if (missing) {
        const previous = mapProduct(
          parseProductHtml(fullHtml, buildWorkUrl("RJ000001")),
        );
        previous.cover = media(1, coverUrl);
        savedGames.findByProviderSlug.mockResolvedValue([previous]);
        images.isAvailable.mockResolvedValue(false);
      }
      images.downloadByUrl.mockRejectedValue(new Error("Image timeout"));
      await expect(
        provider.getByProviderDataIdOrFail("RJ000001"),
      ).rejects.toThrow("Image timeout");
      expect(savedGames.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    "https://other.example/cover.jpg",
    "http://img.dlsite.jp/cover.jpg",
    "https://img.dlsite.jp:444/cover.jpg",
  ])("rejects unsupported source %s before host download", async (source) => {
    const { provider, images } = await setup(
      fullHtml.replaceAll("//img.dlsite.jp/synthetic/cover.jpg", source),
    );
    await expect(
      provider.getByProviderDataIdOrFail("RJ000001"),
    ).rejects.toThrow("HTTPS img.dlsite.jp");
    expect(images.downloadByUrl).not.toHaveBeenCalled();
  });

  it("lets the core discard credential-bearing image URLs instead of fetching them", async () => {
    const { provider, images } = await setup(
      fullHtml.replaceAll(
        "//img.dlsite.jp/synthetic/cover.jpg",
        "https://user:pass@img.dlsite.jp/cover.jpg",
      ),
    );
    expect(
      (await provider.getByProviderDataIdOrFail("RJ000001")).cover,
    ).toBeUndefined();
    expect(images.downloadByUrl.mock.calls.map(([url]) => url)).toEqual([
      sceneUrl,
    ]);
  });

  it("rejects the whole snapshot if background fails after the cover download", async () => {
    const { provider, images, savedGames } = await setup(fullHtml);
    images.downloadByUrl
      .mockResolvedValueOnce(media(3, coverUrl))
      .mockRejectedValueOnce(new Error("Background unavailable"));
    await expect(
      provider.getByProviderDataIdOrFail("RJ000001"),
    ).rejects.toThrow("Background unavailable");
    expect(savedGames.save).not.toHaveBeenCalled();
  });
});
