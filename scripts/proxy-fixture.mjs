import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import dns from "node:dns";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { join } from "node:path";

// Synthetic HTML and a one-pixel PNG, never public DLsite responses/artwork.
export const fixtureImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
  "base64",
);

// Only installed in disposable test workers. A regression cannot contact DLsite.
export function forbidPublicDns(onAttempt) {
  const lookup = dns.lookup;
  dns.lookup = (hostname, options, callback) => {
    if (net.isIP(hostname) || hostname === "localhost")
      return lookup(hostname, options, callback);
    onAttempt(hostname);
    const done = typeof options === "function" ? options : callback;
    process.nextTick(
      done,
      Object.assign(new Error("Direct DNS forbidden in local proxy fixture"), {
        code: "ENOTFOUND",
      }),
    );
  };
}

export async function startProxyFixture(directory) {
  const ca = join(directory, "fixture-cert.pem");
  const key = join(directory, "fixture-key.pem");
  const config = join(directory, "fixture-tls.cnf");
  await writeFile(
    config,
    `[req]
distinguished_name=dn
x509_extensions=extensions
prompt=no
[dn]
CN=DLsite local fixture only
[extensions]
basicConstraints=critical,CA:TRUE
subjectAltName=DNS:www.dlsite.com,DNS:img.dlsite.jp,DNS:localhost,IP:127.0.0.1
`,
  );
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-config",
      config,
      "-keyout",
      key,
      "-out",
      ca,
    ],
    { stdio: "pipe", timeout: 15_000 },
  );
  const tls = { key: await readFile(key), cert: await readFile(ca) };
  const product = await readFile(
    new URL("../test/fixtures/product.html", import.meta.url),
    "utf8",
  );
  const search = await readFile(
    new URL("../test/fixtures/search.html", import.meta.url),
    "utf8",
  );
  const username = `fixture-${randomBytes(6).toString("hex")}`;
  const password = `p@ss:${randomBytes(12).toString("hex")}`;
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const sockets = new Set();
  const servers = [];
  const state = {
    mode: "healthy",
    authRequired: true,
    requests: [],
    connects: [],
    failures: [],
    independent: 0,
  };
  const track = (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    // Client aborts are expected in TLS/failure tests; no external connection is made.
    socket.on("error", () => {});
    return socket;
  };
  async function listen(server) {
    servers.push(server);
    server.on("connection", track);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    return server.address().port;
  }
  const close = async () => {
    for (const socket of sockets) socket.destroy();
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  };
  try {
    const originPort = await listen(
      https.createServer(tls, (req, res) => {
        const url = new URL(req.url, `https://${req.headers.host}`);
        const image = url.hostname === "img.dlsite.jp";
        const kind = image
          ? "image"
          : url.pathname.includes("/product/info/")
            ? "info"
            : url.pathname.includes("/fsr/")
              ? "search"
              : "product";
        state.requests.push({ kind, url: url.href });
        if (req.headers["proxy-authorization"] || req.headers.authorization)
          state.failures.push("Proxy credentials reached the origin");
        if (!["img.dlsite.jp", "www.dlsite.com"].includes(url.hostname))
          state.failures.push("Unexpected fixture origin");
        if (state.requests.length > 100) {
          state.failures.push("Fixture request budget exceeded");
          res.writeHead(503).end();
        } else if (state.mode === "metadata-fail" && !image) {
          res.writeHead(503).end("Synthetic metadata failure");
        } else if (image) {
          if (state.mode === "images-fail") res.writeHead(404).end();
          else if (!url.pathname.startsWith("/bytes/"))
            res.writeHead(302, { location: `/bytes${url.pathname}` }).end();
          else {
            res.writeHead(200, { "content-type": "image/png" });
            res.end(
              state.mode === "invalid-image"
                ? Buffer.from("not image bytes")
                : fixtureImage,
            );
          }
        } else if (kind === "info") {
          res.writeHead(200, { "content-type": "application/json" }).end(
            JSON.stringify({
              [url.searchParams.get("product_id")]: { rate_average_2dp: 4.8 },
            }),
          );
        } else if (kind === "search") {
          res.writeHead(200, { "content-type": "text/html" }).end(search);
        } else if (url.pathname.startsWith("/home/")) {
          res
            .writeHead(302, {
              location: url.pathname.replace("/home/", "/maniax/"),
            })
            .end();
        } else {
          const id = url.pathname.match(/product_id\/(RJ\d+)\.html/)?.[1];
          if (!["RJ000001", "RJ000002"].includes(id))
            return res.writeHead(404).end();
          const suffix = ["images-fail", "invalid-image"].includes(state.mode)
            ? "/changed"
            : "";
          res
            .writeHead(200, { "content-type": "text/html" })
            .end(
              product
                .replaceAll("RJ000001", id)
                .replaceAll("/synthetic/", `/synthetic/${id}${suffix}/`),
            );
        }
      }),
    );
    const proxyPorts = {};
    for (const scheme of ["http", "https"]) {
      const server =
        scheme === "https" ? https.createServer(tls) : http.createServer();
      server.on("request", (_req, res) =>
        res.writeHead(405).end("CONNECT only"),
      );
      server.on("connect", (req, client, head) => {
        const authorized = state.authRequired
          ? req.headers["proxy-authorization"] === auth
          : !req.headers["proxy-authorization"];
        state.connects.push({ scheme, target: req.url, authorized });
        if (state.mode === "deny" || !authorized) {
          client.end(
            "HTTP/1.1 407 Proxy Authentication Required\r\nConnection: close\r\n\r\n",
          );
          return;
        }
        if (!["www.dlsite.com:443", "img.dlsite.jp:443"].includes(req.url)) {
          state.failures.push("Unexpected CONNECT target");
          client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
          return;
        }
        const upstream = track(
          net.connect({ host: "127.0.0.1", port: originPort }),
        );
        upstream.once("connect", () => {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length) upstream.write(head);
          client.pipe(upstream);
          upstream.pipe(client);
        });
        client.on("close", () => upstream.destroy());
        upstream.on("close", () => client.destroy());
      });
      proxyPorts[scheme] = await listen(server);
    }
    const independentPort = await listen(
      http.createServer((_req, res) => {
        state.independent++;
        res.end("independent host request");
      }),
    );
    return {
      ca,
      state,
      close,
      fixtureImage,
      httpUrl: `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${proxyPorts.http}`,
      httpsUrl: `https://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${proxyPorts.https}`,
      independentUrl: `http://127.0.0.1:${independentPort}`,
      assertRedacted(text) {
        for (const secret of [
          username,
          password,
          encodeURIComponent(password),
          auth,
          auth.slice("Basic ".length),
        ])
          if (text.includes(secret))
            throw new Error("Fixture proxy credentials leaked");
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
