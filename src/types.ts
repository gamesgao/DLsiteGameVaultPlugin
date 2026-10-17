export interface DlsiteLink {
  name: string;
  url: string;
}

export interface DlsiteCircle {
  name: string;
  id?: string;
  url?: string;
}

export interface DlsiteWorkType {
  code: string;
  name: string;
}

export interface DlsiteProduct {
  id: string;
  title: string;
  url: string;
  circle?: DlsiteCircle;
  /** Calendar date, YYYY-MM-DD; no inferred time zone. */
  releaseDate?: string;
  minimumAge?: 0 | 15 | 18;
  /** DLsite work_type labels, separate from topical tags. */
  workTypes?: DlsiteWorkType[];
  tags?: string[];
  series?: string;
  features?: string[];
  description?: string;
  coverUrl?: string;
  /** In source order, deduplicated, excluding the cover. */
  galleryUrls?: string[];
  /** Integer on GameVault's 0-100 scale; do not multiply again. */
  score?: number;
  links: DlsiteLink[];
}

export interface DlsiteSearchCandidate {
  id: string;
  title: string;
  url: string;
  excerpt?: string;
}

/** Relevant fields from the already-decoded product/info/ajax response. */
export interface DlsiteProductInfo {
  work_name?: string | null;
  rate_average_2dp?: number | string | null;
}

export type DlsiteProductInfoResponse = Record<
  string,
  DlsiteProductInfo | undefined
>;
