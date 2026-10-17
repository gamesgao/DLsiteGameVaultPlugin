const sections = ["home", "maniax", "soft", "pro", "aix"] as const;
const workIdPattern = "(?:RJ|BJ|VJ|RE)(?:\\d{8}|\\d{6})";

export type DlsiteSection = (typeof sections)[number];

export interface DlsiteWorkUrl {
  id: string;
  section: DlsiteSection;
  url: string;
}

export function normalizeWorkId(input: string): string | undefined {
  const id = input.trim().toUpperCase();
  return new RegExp(`^${workIdPattern}$`).test(id) ? id : undefined;
}

function distinctWorkIds(input: string): string[] {
  const pattern = new RegExp(`(?<![a-z0-9])${workIdPattern}(?![a-z0-9])`, "gi");
  return [
    ...new Set([...input.matchAll(pattern)].map(([id]) => id.toUpperCase())),
  ];
}

export function extractWorkId(input: string): string | undefined {
  const text = input.trim();
  if (/^(?:[a-z][a-z\d+.-]*:\/\/|\/\/)/i.test(text)) {
    return parseWorkUrl(text)?.id;
  }
  const ids = distinctWorkIds(text);
  return ids.length === 1 ? ids[0] : undefined;
}

export function buildWorkUrl(
  input: string,
  section: DlsiteSection = "home",
): string {
  const id = normalizeWorkId(input);
  if (!id || !sections.includes(section)) {
    throw new TypeError("Expected a DLsite work ID and supported section");
  }
  return `https://www.dlsite.com/${section}/work/=/product_id/${id}.html`;
}

export function parseWorkUrl(input: string): DlsiteWorkUrl | undefined {
  if (!URL.canParse(input)) return undefined;
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["dlsite.com", "www.dlsite.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    return undefined;
  }
  const match = url.pathname.match(
    new RegExp(
      `^/(${sections.join("|")})(?:-touch)?/work/=/product_id/(${workIdPattern})\\.html/?$`,
      "i",
    ),
  );
  if (!match) return undefined;
  const section = sections.find((value) => value === match[1]?.toLowerCase());
  const id = match[2]?.toUpperCase();
  if (!section || !id || distinctWorkIds(input).some((value) => value !== id)) {
    return undefined;
  }
  return { id, section, url: buildWorkUrl(id, section) };
}
