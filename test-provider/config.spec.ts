import { describe, expect, it } from "vitest";
import { readDlsiteConfig } from "../plugin/config.js";

describe("provider configuration", () => {
  it("defaults to Japanese, priority 20 and modest pacing", () => {
    expect(readDlsiteConfig({})).toEqual({
      locale: "ja_JP",
      priority: 20,
      requestIntervalMs: 500,
      proxyUrl: undefined,
    });
  });
  it.each(["ja_JP", "en_US", "zh_CN", "zh_TW"])("supports %s", (locale) => {
    expect(
      readDlsiteConfig({
        PLUGIN_DLSITE_LOCALE: locale,
        PLUGIN_DLSITE_PRIORITY: "-5",
        PLUGIN_DLSITE_REQUEST_INTERVAL_MS: "0",
      }),
    ).toEqual({
      locale,
      priority: -5,
      requestIntervalMs: 0,
      proxyUrl: undefined,
    });
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
    expect(() => readDlsiteConfig({ [`PLUGIN_DLSITE_${key}`]: value })).toThrow(
      `PLUGIN_DLSITE_${key}`,
    );
  });
  it("does not use the removed 0.1 environment names", () => {
    expect(
      readDlsiteConfig({
        PLUGIN_GAMESGAO_DLSITE_LOCALE: "en_US",
        PLUGIN_GAMESGAO_DLSITE_PRIORITY: "90",
        PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS: "0",
      }),
    ).toEqual(readDlsiteConfig({}));
  });
  it.each([
    "http://localhost:8080",
    "https://user:password@proxy.example:8443",
  ])("accepts optional HTTP(S) proxy configuration", (proxyUrl) => {
    expect(
      readDlsiteConfig({ PLUGIN_DLSITE_PROXY_URL: proxyUrl }).proxyUrl,
    ).toBe(proxyUrl);
  });
  it.each(["", "not-a-url", "socks5://user:password@localhost:1080"])(
    "rejects invalid proxy configuration without echoing it",
    (proxyUrl) => {
      expect(() =>
        readDlsiteConfig({ PLUGIN_DLSITE_PROXY_URL: proxyUrl }),
      ).toThrow(/^PLUGIN_DLSITE_PROXY_URL must be an HTTP or HTTPS proxy URL$/);
    },
  );
});
