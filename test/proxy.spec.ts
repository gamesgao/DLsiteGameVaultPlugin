import { inspect } from "node:util";
import { ProxyAgent } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DlsiteProxyTransport } from "../src/index.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("plugin-owned proxy transport", () => {
  it.each([
    "http://localhost:8080",
    "https://user:p%40ss@localhost:8443",
    "https://127.0.0.1:8443",
    "http://user@localhost:8080",
  ])(
    "keeps the standard fetch contract and leaves independent fetch unchanged",
    async (proxy) => {
      const response = new Response("fixture");
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(response);
      vi.stubGlobal("fetch", fetch);
      const transport = new DlsiteProxyTransport(proxy);
      const signal = new AbortController().signal;
      try {
        expect(
          await transport.fetch("https://www.dlsite.com", {
            signal,
            redirect: "manual",
          }),
        ).toBe(response);
        expect(fetch.mock.calls[0]?.[1]).toMatchObject({
          signal,
          redirect: "manual",
        });
        expect(globalThis.fetch).toBe(fetch);
        await globalThis.fetch("https://independent.example");
        expect(fetch.mock.calls[1]).toEqual(["https://independent.example"]);
      } finally {
        await transport.close();
      }
    },
  );

  it.each([
    "http://user:%invalid@localhost",
    "socks5://user:password@localhost",
    "user:password@",
  ])("does not expose invalid proxy credentials or nested causes", (proxy) => {
    let failure: unknown;
    try {
      new DlsiteProxyTransport(proxy);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
    expect(inspect(failure, { depth: 10 })).not.toMatch(
      /user|password|invalid@/,
    );
    expect(failure).not.toHaveProperty("cause");
  });

  it("reports shutdown failure without retaining the transport cause", async () => {
    const transport = new DlsiteProxyTransport("http://localhost:8080");
    vi.spyOn(ProxyAgent.prototype, "close").mockRejectedValueOnce(
      new Error("fixture-password", { cause: new Error("fixture-user") }),
    );
    await expect(transport.close()).rejects.toThrow(
      /^DLsite proxy transport shutdown failed$/,
    );
    await transport.close();
  });
});
