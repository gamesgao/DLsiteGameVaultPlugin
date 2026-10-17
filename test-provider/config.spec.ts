import { describe, expect, it } from "vitest";
import { readDlsiteConfig } from "../plugin/config.js";

describe("provider configuration", () => {
  it("defaults to Japanese, priority 20 and modest pacing", () => {
    expect(readDlsiteConfig({})).toEqual({
      locale: "ja_JP",
      priority: 20,
      requestIntervalMs: 500,
    });
  });
  it.each(["ja_JP", "en_US", "zh_CN", "zh_TW"])("supports %s", (locale) => {
    expect(
      readDlsiteConfig({
        PLUGIN_GAMESGAO_DLSITE_LOCALE: locale,
        PLUGIN_GAMESGAO_DLSITE_PRIORITY: "-5",
        PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS: "0",
      }),
    ).toEqual({ locale, priority: -5, requestIntervalMs: 0 });
  });
  it.each([
    ["LOCALE", "fr_FR"],
    ["PRIORITY", "NaN"],
    ["PRIORITY", "1.5"],
    ["PRIORITY", "9007199254740992"],
    ["REQUEST_INTERVAL_MS", "-1"],
    ["REQUEST_INTERVAL_MS", "60001"],
    ["REQUEST_INTERVAL_MS", "no"],
  ])("rejects invalid %s=%s rather than silently defaulting", (key, value) => {
    expect(() =>
      readDlsiteConfig({ [`PLUGIN_GAMESGAO_DLSITE_${key}`]: value }),
    ).toThrow(`PLUGIN_GAMESGAO_DLSITE_${key}`);
  });
});
