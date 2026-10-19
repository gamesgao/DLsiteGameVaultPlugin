import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { DlsiteClient, DlsiteProxyTransport } from "../dist/index.js";
import {
  startProxyFixture,
  fixtureImage,
  forbidPublicDns,
} from "./proxy-fixture.mjs";

if (process.send) {
  const directAttempts = [];
  forbidPublicDns((hostname) => directAttempts.push(hostname));
  const nativeFetch = globalThis.fetch;
  const transport = new DlsiteProxyTransport(
    process.env.PLUGIN_DLSITE_PROXY_URL,
  );
  const client = new DlsiteClient({
    fetch: transport.fetch,
    requestIntervalMs: 0,
    retries: 0,
    timeoutMs: 2_000,
  });
  try {
    if (process.argv[2] === "success") {
      const product = await client.getProduct("RJ000001");
      assert.equal(product.score, 96);
      assert.equal(product.id, "RJ000001");
      assert.equal(new URL(product.url).pathname.startsWith("/maniax/"), true);
      assert((await client.search("fixture")).length > 1);
      for (const url of [product.coverUrl, product.galleryUrls[0]]) {
        const image = await client.getImage(url);
        assert.deepEqual(Buffer.from(image.data), fixtureImage);
        assert.equal(image.contentType, "image/png");
      }
      assert.equal(globalThis.fetch, nativeFetch);
      assert.equal(
        await (await fetch(process.env.FIXTURE_INDEPENDENT_URL)).text(),
        "independent host request",
      );
      console.log(
        "Synthetic metadata, redirect, JSON, search, images and independent fetch passed.",
      );
    } else {
      const failure = await client
        .getProduct("RJ000001")
        .catch((error) => error);
      assert.equal(failure.code, "network");
      assert.equal(failure.cause, undefined);
      console.log(inspect(failure, { depth: 10 }));
    }
  } finally {
    await transport.close();
  }
  await assert.rejects(client.getProduct("RJ000002"), { code: "network" });
  assert.deepEqual(
    directAttempts,
    [],
    "Plugin must never fall back to direct DNS",
  );
  process.disconnect();
} else {
  const directory = await mkdtemp(join(tmpdir(), "dlsite-proxy-"));
  let fixture;
  let worker;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    fixture = await startProxyFixture(directory);
    async function run(mode, proxy, trust = true) {
      const env = {
        PATH: process.env.PATH,
        HOME: directory,
        PLUGIN_DLSITE_PROXY_URL: proxy,
        FIXTURE_INDEPENDENT_URL: fixture.independentUrl,
        ...(trust ? { NODE_EXTRA_CA_CERTS: fixture.ca } : {}),
      };
      let output = "";
      worker = fork(import.meta.filename, [mode], {
        env,
        execArgv: [],
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        signal: controller.signal,
        killSignal: "SIGKILL",
      });
      for (const stream of [worker.stdout, worker.stderr])
        stream.on("data", (chunk) => {
          output = (output + chunk).slice(-20_000);
        });
      const code = await new Promise((resolve, reject) => {
        worker.once("error", reject);
        worker.once("exit", resolve);
      });
      fixture.assertRedacted(output);
      assert.equal(code, 0, output);
      worker = undefined;
    }
    for (const proxy of [fixture.httpUrl, fixture.httpsUrl])
      await run("success", proxy);
    fixture.state.authRequired = false;
    await run("success", new URL(fixture.httpUrl).origin);
    fixture.state.authRequired = true;
    assert.equal(fixture.state.independent, 3);
    assert.deepEqual(
      Object.fromEntries(
        ["product", "info", "search", "image"].map((kind) => [
          kind,
          fixture.state.requests.filter((request) => request.kind === kind)
            .length,
        ]),
      ),
      { product: 6, info: 3, search: 12, image: 12 },
    );
    assert.deepEqual(
      new Set(fixture.state.requests.map((r) => r.kind)),
      new Set(["product", "info", "search", "image"]),
    );
    for (const scheme of ["http", "https"])
      assert(
        fixture.state.connects.some(
          (r) =>
            r.scheme === scheme &&
            r.authorized &&
            r.target === "img.dlsite.jp:443",
        ),
      );
    const before = fixture.state.requests.length;
    await run("failure", fixture.httpUrl, false);
    await run("failure", fixture.httpsUrl, false);
    const wrongAuth = new URL(fixture.httpUrl);
    wrongAuth.password = "deliberately-wrong-fixture-password";
    await run("failure", wrongAuth.href);
    assert(fixture.state.connects.some((r) => !r.authorized));
    fixture.state.mode = "deny";
    await run("failure", fixture.httpUrl);
    assert.equal(
      fixture.state.requests.length,
      before,
      "TLS/auth/proxy failures must not reach the origin",
    );
    assert.deepEqual(fixture.state.failures, []);
    console.log(
      JSON.stringify(
        {
          result: "local proxy fixtures passed (no live DLsite)",
          originRequests: before,
          connects: fixture.state.connects.length,
          independentRequests: fixture.state.independent,
          schemes: ["HTTP CONNECT", "HTTPS CONNECT"],
          checks: [
            "auth isolation",
            "redirects",
            "metadata",
            "images",
            "TLS rejection",
            "no fallback",
            "close",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      const exited = new Promise((resolve) => worker.once("exit", resolve));
      worker.kill("SIGKILL");
      await exited;
    }
    await fixture?.close();
    clearTimeout(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    await rm(directory, { recursive: true, force: true });
  }
}
