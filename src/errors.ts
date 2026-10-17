export class DlsiteParseError extends Error {
  constructor(
    public readonly code: "unavailable" | "invalid-page" | "identity-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "DlsiteParseError";
  }
}
