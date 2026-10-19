import type { DlsiteLocale } from "./core/index.js";

const prefix = "PLUGIN_DLSITE_";

export function readDlsiteConfig(env: NodeJS.ProcessEnv = process.env) {
  const locale = env[`${prefix}LOCALE`] ?? "ja_JP";
  if (!["ja_JP", "en_US", "zh_CN", "zh_TW"].includes(locale)) {
    throw new TypeError(`${prefix}LOCALE is not a supported DLsite locale`);
  }
  const priority = Number(env[`${prefix}PRIORITY`] ?? 20);
  if (!Number.isSafeInteger(priority)) {
    throw new TypeError(`${prefix}PRIORITY must be a safe integer`);
  }
  const requestIntervalMs = Number(env[`${prefix}REQUEST_INTERVAL_MS`] ?? 500);
  if (
    !Number.isInteger(requestIntervalMs) ||
    requestIntervalMs < 0 ||
    requestIntervalMs > 60_000
  ) {
    throw new TypeError(
      `${prefix}REQUEST_INTERVAL_MS must be an integer from 0 to 60000`,
    );
  }
  const proxyUrl = env[`${prefix}PROXY_URL`];
  if (
    proxyUrl !== undefined &&
    (!URL.canParse(proxyUrl) ||
      !["http:", "https:"].includes(new URL(proxyUrl).protocol))
  ) {
    throw new TypeError(
      `${prefix}PROXY_URL must be an HTTP or HTTPS proxy URL`,
    );
  }
  return {
    locale: locale as DlsiteLocale,
    priority,
    requestIntervalMs,
    proxyUrl,
  };
}
