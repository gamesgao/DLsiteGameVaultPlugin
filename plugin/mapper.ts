import { createHash } from "node:crypto";
import { DeveloperMetadata } from "../../../src/modules/metadata/developers/developer.metadata.entity.js";
import { GameMetadata } from "../../../src/modules/metadata/games/game.metadata.entity.js";
import type { MinimalGameMetadataDto } from "../../../src/modules/metadata/games/minimal-game.metadata.dto.js";
import { GenreMetadata } from "../../../src/modules/metadata/genres/genre.metadata.entity.js";
import { TagMetadata } from "../../../src/modules/metadata/tags/tag.metadata.entity.js";
import type { DlsiteProduct, DlsiteSearchCandidate } from "./core/index.js";

export const slug = "dlsite";

function namedId(kind: string, name: string): string {
  return `${kind}:${createHash("sha256").update(name.normalize("NFC")).digest("hex")}`;
}

function tags(
  kind: string,
  names: string[] | undefined,
  previous: TagMetadata[],
  prefix = "",
): TagMetadata[] {
  // Empty parsed sections do not prove removal; keep the last useful values.
  if (!names?.length) {
    return previous.filter((tag) =>
      tag.provider_data_id.startsWith(`${kind}:`),
    );
  }
  return [...new Set(names)].map((name) =>
    Object.assign(new TagMetadata(), {
      provider_slug: slug,
      provider_data_id: namedId(kind, name),
      name: `${prefix}${name}`,
    }),
  );
}

export function mapCandidate(
  candidate: DlsiteSearchCandidate,
): MinimalGameMetadataDto {
  return {
    provider_slug: slug,
    provider_data_id: candidate.id,
    title: candidate.title,
    description: candidate.excerpt,
  };
}

export function mapProductCandidate(
  product: DlsiteProduct,
): MinimalGameMetadataDto {
  return {
    ...mapCandidate(product),
    description: product.description,
    release_date: product.releaseDate
      ? new Date(`${product.releaseDate}T00:00:00.000Z`)
      : undefined,
    cover_url: product.coverUrl,
  };
}

export function mapProduct(
  product: DlsiteProduct,
  previous?: GameMetadata,
): GameMetadata {
  const prior =
    previous?.provider_slug === slug && previous.provider_data_id === product.id
      ? previous
      : undefined;
  const oldTags = prior?.tags ?? [];
  return Object.assign(new GameMetadata(), {
    provider_slug: slug,
    provider_data_id: product.id,
    provider_data_url: product.url,
    title: product.title,
    description: product.description ?? prior?.description,
    release_date: product.releaseDate
      ? new Date(`${product.releaseDate}T00:00:00.000Z`)
      : prior?.release_date,
    age_rating: product.minimumAge ?? prior?.age_rating,
    rating: product.score ?? prior?.rating,
    url_websites: [
      ...new Set([
        ...product.links.map((link) => link.url),
        ...(prior?.url_websites ?? []),
      ]),
    ],
    url_screenshots: product.galleryUrls?.length
      ? [...product.galleryUrls]
      : prior?.url_screenshots,
    developers: product.circle
      ? [
          Object.assign(new DeveloperMetadata(), {
            provider_slug: slug,
            provider_data_id: product.circle.id
              ? `maker:${product.circle.id}`
              : namedId("circle", product.circle.name),
            name: product.circle.name,
          }),
        ]
      : (prior?.developers ?? []),
    publishers: prior?.publishers ?? [],
    genres: product.workTypes?.length
      ? product.workTypes.map((type) =>
          Object.assign(new GenreMetadata(), {
            provider_slug: slug,
            provider_data_id: `work-type:${type.code}`,
            name: type.name,
          }),
        )
      : (prior?.genres ?? []),
    tags: [
      ...tags("tag", product.tags, oldTags),
      ...tags(
        "series",
        product.series ? [product.series] : undefined,
        oldTags,
        "Series: ",
      ),
      ...tags("feature", product.features, oldTags, "Features: "),
    ],
  });
}
