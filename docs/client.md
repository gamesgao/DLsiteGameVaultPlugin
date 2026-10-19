# DLsite HTTP client

`DlsiteClient` is a standalone server-side ESM client exported from
`dist/index.js` (alongside the accepted identity and parser exports). It is not
a NestJS provider or a package loader. Use Node.js 24 LTS or compatible 26+.
It uses standard `fetch`; no login, browser automation or credentials are needed.

```ts
import { DlsiteClient } from "dlsite-gamevault-plugin";

const client = new DlsiteClient({
  locale: "ja_JP",
  onWarning: ({ id, error }) => console.warn(id, error.message),
});
const product = await client.getProduct("RJ150726");
const candidates = await client.search("東方紅輝心");
const exact = await client.search(product.url); // one exact candidate, not a title search
const cover = product.coverUrl
  ? await client.getImage(product.coverUrl)
  : undefined;
const refreshed = await client.getProduct(product.id, { forceRefresh: true });
```

## Public contracts

| API | Result |
| --- | --- |
| `getProduct(idOrUrl, options?)` | `Promise<DlsiteProduct>` using the existing core type and presence semantics. Accepts a complete supported ID or work URL, not a filename containing an ID. Use `extractWorkId` separately for filenames. |
| `search(query, options?)` | `Promise<DlsiteSearchCandidate[]>`. A complete ID or supported work URL calls `getProduct` and returns exactly `{ id, title, url }` in a one-element array. Otherwise searches trimmed keywords. No automatic selection. |
| `getImage(url, options?)` | `Promise<DlsiteImage>`: `{ url: string, contentType: string, data: Uint8Array }`. URL is the final response URL; bytes are downloaded, not written to disk. |
| `DlsiteRequestOptions` | `{ forceRefresh?: boolean }` accepted by all three methods. |
| `DlsiteClientError` | Transport/response error with `code`, `url`, optional HTTP `status` and `retryAfterMs`. Raw fetch/body transport causes are intentionally omitted because they can embed proxy credentials. JSON parse errors retain their non-transport cause. |
| `DlsiteSupplementWarning` | `{ id: string, error: DlsiteClientError }`, delivered to `onWarning` for optional JSON failures. |

`DlsiteLocale`, `DlsiteSearchSection`, `DlsiteClientOptions` and `DlsiteImage`
are also exported types. Products/candidates are not new competing models.
Scores remain the parser's rounded 0–100 score; missing fields stay unknown.

## Configuration

All durations are integer milliseconds. Invalid bounds throw `TypeError`.

| Option | Default | Supported values |
| --- | --- | --- |
| `locale` | `ja_JP` | `ja_JP`, `en_US`, `zh_CN`, `zh_TW` (the core's supported outline/date labels) |
| `searchSections` | `["home", "maniax", "soft", "pro"]` | Nonempty array of those sections; duplicates removed, supplied order retained |
| `requestIntervalMs` | `500` | 0–60,000; minimum interval between HTTP request starts |
| `timeoutMs` | `15000` | 1–60,000; each HTTP exchange, including body consumption |
| `retries` | `1` | 0–3 additional attempts after a transient failure |
| `cacheTtlMs` | `60000` | 0–300,000 from successful completion; 0 disables completed-result caching |
| `cacheMaxEntries` | `100` | 0–1,000 entries **per result kind** (products/searches/images); 0 disables completed-result caching |
| `fetch` | `globalThis.fetch` | Standard fetch signature; used by the plugin's scoped proxy and unit tests. Must honor `signal` and `redirect: "manual"`. |
| `onWarning` | `console.warn` with work ID and error message | Synchronous callback for supplementary failures; host adapter can use its logger. A throwing callback propagates. |

Pacing is shared by product HTML, AJAX, search, images, redirects and retries
within **one client instance**. Exchanges are serialized. Reuse one client per
provider rather than constructing one for every game; separate instances/processes
do not coordinate. At most four redirect hops are followed per attempt.

`DlsiteProxyTransport(proxyUrl)` is the optional Node transport exported with
the core. Its `fetch` supplies a private Undici ProxyAgent dispatcher to
standard fetch; `close()` releases it. The adapter owns its lifecycle. It
accepts HTTP(S) proxy URIs and percent-encoded Basic proxy credentials, never
sets a process-wide dispatcher, and exposes no TLS verification bypass.
The host adapter reads `PLUGIN_DLSITE_PROXY_URL`; the standalone client itself
does not interpret environment variables. See [provider.md](provider.md).

Retries cover network/timeouts and HTTP 408, 425, 429, 500, 502, 503, 504.
Backoff is 500/1,000/2,000 ms. Numeric seconds and HTTP-date `Retry-After` take
precedence. A delay greater than 30 seconds fails immediately instead of
sleeping indefinitely; the error retains the server's delay. After 429, queued
requests share the cooldown: they also fail without network access while more
than 30 seconds remain, or wait for the remaining short cooldown. A future call
can succeed once it expires. Permanent HTTP, malformed responses and parser
errors are not retried.

## Endpoints and boundaries

Product IDs start at
`https://www.dlsite.com/home/work/=/product_id/ID.html?locale=LOCALE`;
accepted work URLs are normalized by the core. Only HTTPS DLsite work routes
are fetched. Genuine cross-section redirects are accepted, but a different
work ID raises `DlsiteParseError` with `identity-mismatch` **before** following
the redirect. HTML canonical/primary IDs remain checked by the core.

The final HTTP work section supplies the supplemental endpoint:
`https://www.dlsite.com/SECTION/product/info/ajax?product_id=ID&cdn_cache_min=1&locale=LOCALE`.
Site requests use anonymous `Cookie: locale=LOCALE; loginchecked=1`,
`Accept-Language` and a descriptive User-Agent. AJAX additionally uses
`Accept: application/json`, `X-Requested-With: XMLHttpRequest`, and a
locale-bearing work-page Referer. There is no cookie jar or stored login.

Keyword searches use the reference plugin's public HTML `/SECTION/fsr/=/` route:

```text
/SECTION/fsr/=/language/jp/keyword/ENCODED_KEYWORDS/FILTERS/order[0]/trend/options_and_or/and/per_page/30/show_type/1/from/fs.header/?locale=LOCALE
```

`FILTERS` are `age_category[0]/general` for home/soft or
`sex_category[0]/male` for maniax/pro, followed by `work_category` entries:
home = doujin/pc/app; maniax = doujin/books/pc/app; soft/pro = pc.
Keywords are encoded as one path segment (including spaces, slashes and `+`).
`language/jp` follows the reference's Japanese-work search; locale controls
display labels, not a promise to find every translated edition.

One page of up to 30 results is read per section, then deduplicated by full work
ID, retaining the first candidate in section/source order. These categories
can include non-game works: the client does not pretend every result is a game.
There is no pagination, exhaustive catalog search or automatic best-match choice.
A complete section failure rejects the entire search; no partial list is
silently reported as complete. A known empty list or the observed
`.work_not_found > .lead` layout returns `[]`. Other HTML layouts fail.

Image retrieval allows **only `https://img.dlsite.jp`**, observed on both verified
products. No site cookies are sent to the image host. Redirects must stay on
that host. Responses require nonempty bytes and JPEG/PNG/WebP/GIF/AVIF MIME.
The client does not infer image names, accept arbitrary third-party description
images, or expose a general-purpose URL-fetch method. Site redirects remain
restricted to known DLsite endpoint shapes; local files, credentials in URLs,
nonstandard ports and arbitrary hosts are rejected.

## Failure, cache and host refresh behavior

- Invalid method inputs/options throw `TypeError`; rejected request/redirect
  URLs use `DlsiteClientError` code `unsafe-url`.
- HTTP failures use `http` and preserve the status (including 403/404/410).
  Other client codes are `network`, `timeout`, `invalid-response`.
  Successful HTTP is not sufficient: HTML/JSON/image MIME and nonempty bodies
  are checked. Existing parser failures propagate unchanged.
- Supplemental HTTP/JSON failures call `onWarning`, then allow the HTML parser
  to return a real product, possibly without score. HTML static score can still
  be used. Only the matching JSON record's title/rating fields are consumed.
  Such degraded successes are **not cached**, so a later call immediately has
  a chance to recover. A valid record with an unknown/zero rating is not a
  transport failure and does not fabricate a score.
- Full product/identity failure rejects; supplemental data cannot turn an
  unavailable/missing product page into an empty successful record.

Successful results (including confirmed empty searches) have a short TTL and
bounded per-kind entry count; expired entries are pruned on successful writes,
then the oldest written entry is evicted if necessary. Keys are full normalized
product ID, trimmed case-sensitive search text, or image URL without fragment.
Locale/sections are fixed per client. Results are defensively cloned so host
mutation does not alter the cache.

`forceRefresh: true` bypasses a completed cache entry, **not** an active request.
Concurrent callers, including forced and non-forced callers, join the same
in-flight operation. A failed refresh is surfaced to all joined callers; no
stale success is substituted. A prior unexpired positive entry remains usable
by a later ordinary call. A degraded supplemental success removes the old
entry. Rejected operations are never cached and their in-flight entry is removed.

For host TTL refresh/remap, pass `forceRefresh: true` when fresh data is required;
do not let the client's short cache extend the host's refresh decision.
Selecting a different ID naturally uses a different key. The [native adapter](provider.md) retains previously saved same-ID metadata
on failures and treats absent fields as unknown, not as permission to clear
fields/relations/images. This standalone client does not implement persistence.

## Opt-in live smoke

```sh
npm run build
npm run smoke:dlsite
```

The script imports the built exports and checks RJ150726 plus independently
verified RJ141995 (`東方紅輝心`), exact-ID search/cache reuse, title search over
all default sections, supplemental scores, and one actual cover download.
It prints concise HTTP statuses/verified fields, never saves pages/artwork, and
exits nonzero on meaningful failures (including missing JSON scores). Retries
are disabled, with 10-second exchange timeouts, a 90-second network deadline,
and at most 16 HTTP requests. It is not part of unit tests or coverage runs.

No proxy configuration is changed by the library or script. Live failures must
be reported as failures; do not substitute fixtures or disable global proxies.
See [verification.md](verification.md) for executed checks and limitations.
