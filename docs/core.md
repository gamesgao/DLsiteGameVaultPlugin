# Identity and parsing core

This component is the offline parsing part of the TypeScript ESM library, not
an installable GameVault plugin. `src/index.ts` is the public entry point;
`npm run build` emits `dist/index.js` and declarations. The parsers have no
network dependency. The separate [HTTP client](client.md) now supplies network
requests; no NestJS/backend copy or browser execution is included.

## Public API

| Export | Contract |
| --- | --- |
| `normalizeWorkId(text)` | Normalize one complete ID to uppercase; otherwise `undefined`. |
| `extractWorkId(text)` | Find one distinct explicit ID in a filename/title or supported work URL. Repeated identical IDs are fine; conflicting IDs or no match return `undefined`. |
| `parseWorkUrl(url)` | Return `{ id, section, url }`, or `undefined` for unsupported/ambiguous URLs. |
| `buildWorkUrl(id, section = "home")` | Build an HTTPS work URL; invalid ID/section throws `TypeError`. The default is a **lookup URL**, not proof of the product's final section. |
| `parseProductHtml(html, pageUrl, productInfo?)` | Return `DlsiteProduct`; `pageUrl` is the lookup/final response URL. Optional JSON is an already-decoded, ID-keyed `product/info/ajax` response. |
| `parseSearchHtml(html)` | Return `DlsiteSearchCandidate[]` in source order, retaining the first usable candidate per ID. |
| `DlsiteParseError` | Parser failure with `code`: `unavailable`, `invalid-page`, or `identity-mismatch`. |

The entry point also exports `DlsiteSection`, `DlsiteWorkUrl`, `DlsiteProduct`,
`DlsiteSearchCandidate`, `DlsiteCircle`, `DlsiteWorkType`, `DlsiteLink`,
`DlsiteProductInfo` and `DlsiteProductInfoResponse`.

```ts
import {
  buildWorkUrl,
  extractWorkId,
  parseProductHtml,
} from "dlsite-gamevault-plugin";

const id = extractWorkId("[RJ000001] Tiny Adventure (W).zip");
if (id) {
  const lookupUrl = buildWorkUrl(id);
  // The HTTP client supplies HTML and optionally decoded JSON.
  const product = parseProductHtml(html, lookupUrl, {
    RJ000001: { work_name: "Tiny Adventure", rate_average_2dp: "4.25" },
  });
  // product.score === 85; it must not be multiplied again by the adapter.
}
```

## Identity decisions

Accept `RJ`, `BJ`, `VJ`, `RE` with exactly six or eight digits, case-insensitively.
Preserve leading zeroes and the complete prefix: no padding or `RE` to `RJ`
conversion. ASCII letters/digits cannot touch either side of an extracted ID;
spaces, square brackets, underscores, Japanese punctuation and GameVault tags
can delimit it. A GameVault `(NC)` tag does not change identity recognition;
the future adapter remains responsible for respecting no-refresh behavior.

Work URLs must use HTTP(S), exactly `dlsite.com` or `www.dlsite.com`, no credentials
or nonstandard port, and the observed `/section/work/=/product_id/ID.html` shape.
Supported sections are `home`, `maniax`, `soft`, `pro`, `aix`; `-touch` variants
normalize to desktop URLs. Locale/tracking query strings and fragments are
removed. Distinct IDs in the URL are rejected rather than guessed.

The Playnite reference uses `home` as a generic ID lookup route. We use that
route without inferring sections from prefixes. A matching HTML canonical link
can supply a different section; conflicting canonical/primary product IDs fail.
The client's live smoke now confirms a `home` to `maniax` redirect for RJ150726
and a direct `home` lookup for RJ141995. Other sections, alternate work URL
shapes, and successful live lookup of every prefix remain unverified.

## Product fields and presence

`id`, `title`, `url` and `links` are always present on a successful parse.
All other fields are optional. `undefined` means missing, unrecognized or not
meaningfully supplied; an array can be `[]` when its source section exists but
contains no usable entries. This is not permission to clear saved metadata.

| Field | Meaning |
| --- | --- |
| `circle` | Brand/circle name, optional profile URL and `maker_id` from a DLsite profile link. Not an inferred publisher. |
| `releaseDate` | Valid `YYYY-MM-DD` calendar date, without a fabricated timestamp/time zone. |
| `minimumAge` | `0`, `15`, `18`, or unknown. An unknown age is not “all ages.” |
| `workTypes` | `{ code, name }[]` from `work_type` links. These provide genre/type input; unknown codes remain literal and do not prove a product is a game. |
| `tags` | DLsite's topical “Genre”/ジャンル/分类 labels, separate from work types. |
| `series`, `features` | Series name; product options, file formats and miscellaneous labels. The adapter can add `Series:` / `Features:` tag prefixes. |
| `description` | Markdown preserving headings, paragraphs, emphasis, lists, links and images. Relative web URLs are resolved; executable markup/non-web link targets are not retained. |
| `coverUrl`, `galleryUrls` | Existing HTML image URLs only; gallery is deduplicated and excludes the cover. No guessed thumbnail/icon/background filenames. |
| `score` | Rounded integer `rating × 20` from a real 1–5 value. Zero/no ratings, templates and out-of-range values remain unknown. |
| `links` | Canonical DLsite page and Ci-en link when present in HTML. |

Only the matching JSON record contributes `work_name` and `rate_average_2dp`;
meaningful JSON values take precedence over HTML. The title still requires a
`#work_name` product-page marker. Static `itemprop="ratingValue"` can supply a
score; scripts and Vue interpolation text are not evaluated.

Outline labels support the Japanese, English, Simplified Chinese and Traditional
Chinese forms present in the reference translation dictionary. Dates recognize
Japanese/Chinese year-month-day text (with optional hour), English `Feb/29/2024`
(with optional hour), and ISO dates. Invalid dates, multiple dates and ambiguous
numeric `03/02/2024` remain unknown. This is not a claim of support for all
DLsite locales.

## Search and next-component boundary

Search uses the reference plugin's `.work_1col_table.n_worklist` rows,
`.work_name a` links and `.work_text` excerpts. An existing empty list is a valid
`[]`. Missing list structure, including an unrecognized no-results layout, is
`invalid-page`, not a silent successful empty search. The client's live checks
also confirmed `.work_not_found > .lead` as DLsite's explicit no-results layout;
that layout now returns `[]` without requiring a result table. Broken entries are skipped
if other usable results exist; a nonempty list with no usable entries fails.
The known `.error_box_work` marker produces `unavailable` for either parser.

The client supplies downloaded HTML/final URLs and optional decoded JSON,
and handles transport status, redirects, retries and caching. The adapter uses
the complete `id` for identity, maps work types conservatively, consumes `score`
unchanged, and preserves previous fields on missing data or parse failure.
Neither parser auto-selects a search result or assigns DLsite as publisher.

Tests use compact invented fixtures through public exports only. Coverage
includes all authored `src/**/*.ts` code, with gates of 90% lines/functions/
statements and 85% branches. Private saved pages are not fixtures or package
contents.
