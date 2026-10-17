import { Injectable, NotFoundException } from "@nestjs/common";
import type { GamevaultGame } from "../../../src/modules/games/gamevault-game.entity.js";
import type { Media } from "../../../src/modules/media/media.entity.js";
import { MediaService } from "../../../src/modules/media/media.service.js";
import { DeveloperMetadataService } from "../../../src/modules/metadata/developers/developer.metadata.service.js";
import type { GameMetadata } from "../../../src/modules/metadata/games/game.metadata.entity.js";
import { GameMetadataService } from "../../../src/modules/metadata/games/game.metadata.service.js";
import type { MinimalGameMetadataDto } from "../../../src/modules/metadata/games/minimal-game.metadata.dto.js";
import { GenreMetadataService } from "../../../src/modules/metadata/genres/genre.metadata.service.js";
import { MetadataService } from "../../../src/modules/metadata/metadata.service.js";
import { MetadataProvider } from "../../../src/modules/metadata/providers/abstract.metadata-provider.service.js";
import { PublisherMetadataService } from "../../../src/modules/metadata/publishers/publisher.metadata.service.js";
import { TagMetadataService } from "../../../src/modules/metadata/tags/tag.metadata.service.js";
import {
  DlsiteClient,
  DlsiteClientError,
  DlsiteParseError,
  extractWorkId,
  normalizeWorkId,
  parseWorkUrl,
} from "./core/index.js";
import { readDlsiteConfig } from "./config.js";
import {
  mapCandidate,
  mapProduct,
  mapProductCandidate,
  slug,
} from "./mapper.js";

@Injectable()
export class DlsiteMetadataProviderService extends MetadataProvider {
  readonly slug = slug;
  readonly name = "DLsite";
  readonly priority: number;
  private readonly client: DlsiteClient;

  constructor(
    metadataService: MetadataService,
    private readonly savedGames: GameMetadataService,
    developers: DeveloperMetadataService,
    publishers: PublisherMetadataService,
    tags: TagMetadataService,
    genres: GenreMetadataService,
    media: MediaService,
  ) {
    super(
      metadataService,
      savedGames,
      developers,
      publishers,
      tags,
      genres,
      media,
    );
    const config = readDlsiteConfig();
    this.priority = config.priority;
    this.client = new DlsiteClient({
      locale: config.locale,
      requestIntervalMs: config.requestIntervalMs,
      onWarning: ({ id, error }) =>
        this.logger.warn({
          message: "DLsite supplemental data unavailable; using product HTML.",
          id,
          error,
        }),
    });
  }

  override async search(query: string): Promise<MinimalGameMetadataDto[]> {
    const id = normalizeWorkId(query) ?? parseWorkUrl(query)?.id;
    if (id) return [mapProductCandidate(await this.getProduct(id))];
    return (await this.client.search(query)).map(mapCandidate);
  }

  override async getBestMatch(
    game: GamevaultGame,
  ): Promise<MinimalGameMetadataDto> {
    // Use filenames, not parent directory names, as identity evidence.
    const filenames = [
      game.file_path,
      ...(game.versions ?? []).map((v) => v.file_path),
    ]
      .filter((path): path is string => !!path)
      .map((path) => path.split(/[\\/]/).pop());
    const id = extractWorkId([game.title, ...filenames].join(" "));
    if (!id) {
      throw new NotFoundException(
        "No unambiguous DLsite work ID; map manually.",
      );
    }
    return mapProductCandidate(await this.getProduct(id));
  }

  override async getByProviderDataIdOrFail(
    provider_data_id: string,
  ): Promise<GameMetadata> {
    const id = normalizeWorkId(provider_data_id);
    if (!id) throw new NotFoundException("Invalid DLsite provider_data_id.");
    const product = await this.getProduct(id, true);
    const previous = (
      await this.savedGames.findByProviderSlug(this.slug, {
        loadRelations: true,
      })
    ).find((game) => game.provider_data_id === id);
    const result = mapProduct(product, previous);
    result.cover = await this.image(product.coverUrl, previous?.cover);
    result.background = await this.image(
      product.galleryUrls?.[0],
      previous?.background,
    );
    return result;
  }

  private async getProduct(id: string, forceRefresh = false) {
    try {
      return await this.client.getProduct(id, { forceRefresh });
    } catch (error) {
      if (
        (error instanceof DlsiteParseError && error.code === "unavailable") ||
        (error instanceof DlsiteClientError &&
          (error.status === 404 || error.status === 410))
      ) {
        throw new NotFoundException(`DLsite work ${id} is unavailable.`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  private async image(
    source: string | undefined,
    previous?: Media,
  ): Promise<Media | undefined> {
    const prior =
      previous?.id && (await this.mediaService.isAvailable(previous.id))
        ? previous
        : undefined;
    if (!source) return prior;
    try {
      const url = new URL(source);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "img.dlsite.jp" ||
        url.port
      ) {
        throw new TypeError("Expected an HTTPS img.dlsite.jp image URL.");
      }
      if (prior?.source_url === source) return prior;
      return await this.mediaService.downloadByUrl(source);
    } catch (error) {
      this.logger.warn({
        message: prior
          ? "DLsite image failed; retaining available same-ID image."
          : "DLsite image failed; aborting metadata snapshot.",
        source,
        error,
      });
      if (prior) return prior;
      throw error;
    }
  }
}
