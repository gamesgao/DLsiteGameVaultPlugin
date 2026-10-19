import { isIP } from "node:net";
import { buildConnector, Pool, ProxyAgent } from "undici";

/** A private dispatcher, never installed as the process-wide default. */
export class DlsiteProxyTransport {
  private readonly agent: ProxyAgent;
  readonly fetch: typeof globalThis.fetch;

  constructor(proxyUrl: string) {
    try {
      const url = new URL(proxyUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new TypeError();
      const token =
        url.username || url.password
          ? `Basic ${Buffer.from(
              `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`,
            ).toString("base64")}`
          : undefined;
      const ipProxy =
        url.protocol === "https:" && isIP(url.hostname.replace(/^\[|\]$/g, ""));
      const connect = buildConnector({});
      this.agent = new ProxyAgent({
        uri: url.origin,
        token,
        // Undici 7 passes an IP as SNI; Node 26 rejects it. Omitting SNI
        // still verifies the proxy certificate against its actual IP.
        clientFactory: ipProxy
          ? (origin, options) =>
              new Pool(origin, {
                ...options,
                connect: (options, callback) =>
                  connect({ ...options, servername: undefined }, callback),
              })
          : undefined,
      });
    } catch {
      // URL/Undici errors can retain credentials in their message or cause.
      throw new TypeError(
        "PLUGIN_DLSITE_PROXY_URL must be a valid HTTP or HTTPS proxy URL",
      );
    }
    const fetch = globalThis.fetch;
    this.fetch = (input, init) => {
      const options = { ...init, dispatcher: this.agent };
      return fetch(input, options);
    };
  }

  async close(): Promise<void> {
    try {
      await this.agent.close();
    } catch {
      throw new Error("DLsite proxy transport shutdown failed");
    }
  }
}
