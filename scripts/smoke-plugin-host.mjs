import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Private child of smoke-plugin.mjs: real AppModule/loader, localhost only.
assert(process.send, "Run through smoke:plugin, not directly");
const hostImport = (file) =>
  import(pathToFileURL(join(process.cwd(), file)).href);
let app;
let failing = false;
let shuttingDown = false;
let remainingRequests = Number(process.argv[3]);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  assert(
    ["www.dlsite.com", "img.dlsite.jp"].includes(url.hostname),
    `Unexpected outbound request: ${url.origin}`,
  );
  if (failing && url.hostname === "www.dlsite.com") {
    process.send({ type: "injected-failure" });
    throw new TypeError(
      "Injected DLsite network failure (acceptance test only)",
    );
  }
  assert(remainingRequests-- > 0, "Exceeded live HTTP request budget");
  const response = await originalFetch(input, init);
  process.send({
    type: "http",
    status: response.status,
    url: `${url.origin}${url.pathname}`,
  });
  return response;
};

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 4_000);
  try {
    await app?.close();
    clearTimeout(deadline);
    // Host file watchers can survive app.close(); exit this disposable process.
    process.exit(process.exitCode ?? 0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
process.once("disconnect", shutdown);
process.on("message", (message) => {
  if (message.type === "failure-mode") {
    failing = message.enabled;
    process.send({ type: "failure-mode", enabled: failing });
  }
});

try {
  // Match main's import order to initialize the host's cyclic ESM graph.
  const { AppModule } = await hostImport("dist/src/app.module.js");
  const { default: loadPlugins } = await hostImport("dist/src/plugin.js");
  const { NestFactory } = await hostImport(
    "node_modules/@nestjs/core/index.js",
  );
  const { ValidationPipe } = await hostImport(
    "node_modules/@nestjs/common/index.js",
  );
  const { DataSource } = await hostImport("node_modules/typeorm/index.js");
  const plugins = await loadPlugins();
  assert.equal(plugins.length, Number(process.argv[2]));
  Reflect.defineMetadata(
    "imports",
    [...Reflect.getOwnMetadata("imports", AppModule), ...plugins],
    AppModule,
  );
  app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  await app.listen(0, "127.0.0.1");
  const [{ version }] = await app
    .get(DataSource)
    .query("SELECT sqlite_version() AS version");
  process.send({
    type: "ready",
    address: await app.getUrl(),
    sqlite: version,
    plugins: plugins.length,
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  await shutdown();
}
