export {
  buildWorkUrl,
  extractWorkId,
  normalizeWorkId,
  parseWorkUrl,
} from "./identity.js";
export type { DlsiteSection, DlsiteWorkUrl } from "./identity.js";
export { DlsiteParseError } from "./errors.js";
export { parseProductHtml } from "./product-parser.js";
export { parseSearchHtml } from "./search-parser.js";
export { DlsiteClient, DlsiteClientError } from "./client.js";
export { DlsiteProxyTransport } from "./proxy.js";
export type {
  DlsiteClientOptions,
  DlsiteImage,
  DlsiteLocale,
  DlsiteRequestOptions,
  DlsiteSearchSection,
  DlsiteSupplementWarning,
} from "./client.js";
export type {
  DlsiteCircle,
  DlsiteLink,
  DlsiteProduct,
  DlsiteProductInfo,
  DlsiteProductInfoResponse,
  DlsiteSearchCandidate,
  DlsiteWorkType,
} from "./types.js";
