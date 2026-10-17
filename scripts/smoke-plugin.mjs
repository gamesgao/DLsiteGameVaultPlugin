import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { backend: { type: "string" }, archive: { type: "string" } },
});
if (!values.backend) {
  throw new Error(
    "Usage: npm run smoke:plugin -- --backend /path/to/disposable-gamevault-backend [--archive PATH]",
  );
}
const backend = resolve(values.backend);
const archive = resolve(values.archive ?? "artifacts/dlsite-0.1.0.zip");
const copiedPlugin = join(backend, "dist/src/modules/dlsite");
try {
  await access(copiedPlugin);
  throw new Error(
    "Build the disposable host clean first: dist/src/modules/dlsite already exists.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const runtime = await mkdtemp(join(tmpdir(), "gamevault-dlsite-"));
const oldCwd = process.cwd();
let app;
let address;
const deadline = setTimeout(() => {
  console.error("Packaged-plugin smoke exceeded its 60-second deadline.");
  process.exit(1);
}, 60_000);
deadline.unref();

try {
  for (const name of [
    "CONFIG",
    "FILES",
    "MEDIA",
    "LOGS",
    "SQLITEDB",
    "PLUGINS",
    "SAVEFILES",
  ]) {
    const directory = join(runtime, name.toLowerCase());
    await mkdir(directory);
    process.env[`VOLUMES_${name}`] = directory;
  }
  Object.assign(process.env, {
    NODE_ENV: "production",
    DB_SYSTEM: "SQLITE",
    DB_SYNCHRONIZE: "false",
    SERVER_LOG_LEVEL: "error",
    SERVER_LOG_FILES_ENABLED: "false",
    SERVER_REGISTRATION_DISABLED: "false",
    SERVER_ADMIN_USERNAME: "",
    SERVER_ADMIN_PASSWORD: "",
    SERVER_ONLINE_ACTIVITIES_DISABLED: "true",
    WEB_UI_ENABLED: "false",
    METADATA_IGDB_ENABLED: "false",
    AUTH_BASIC_AUTH_ENABLED: "true",
    AUTH_OAUTH2_ENABLED: "false",
    AUTH_SEED: randomBytes(32).toString("hex"),
    PLUGIN_GAMESGAO_DLSITE_LOCALE: "ja_JP",
    PLUGIN_GAMESGAO_DLSITE_PRIORITY: "20",
    PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS: "500",
  });
  execFileSync("unzip", ["-q", archive, "-d", process.env.VOLUMES_PLUGINS]);
  await access(
    join(process.env.VOLUMES_PLUGINS, "dlsite/dlsite.plugin.module.js"),
  );
  // This host's Nest asset copy nests assets/assets; ProgressService needs this path.
  await mkdir(join(backend, "dist/assets"), { recursive: true });
  await cp(
    join(backend, "assets/ignored-executables.txt"),
    join(backend, "dist/assets/ignored-executables.txt"),
  );
  process.chdir(backend);
  const hostImport = (file) => import(pathToFileURL(join(backend, file)).href);
  // The official main imports AppModule before invoking the plugin loader.
  const { AppModule } = await hostImport("dist/src/app.module.js");
  const { default: loadPlugins } = await hostImport("dist/src/plugin.js");
  const { NestFactory } = await hostImport(
    "node_modules/@nestjs/core/index.js",
  );
  const { ValidationPipe } = await hostImport(
    "node_modules/@nestjs/common/index.js",
  );
  const plugins = await loadPlugins();
  assert.equal(plugins.length, 1, "Expected exactly the extracted plugin");
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
  address = await app.getUrl();

  const request = (path, init) =>
    fetch(`${address}/api/${path}`, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
  const username = `dlsite_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  const registration = await request("auth/basic/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(registration.status, 201, "Temporary admin registration failed");
  const admin = await registration.json();
  assert.equal(admin.role, 3);
  const login = await request("auth/basic/login", {
    headers: {
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
  });
  assert.equal(login.status, 200, "Temporary admin login failed");
  const { access_token } = await login.json();
  assert.equal(typeof access_token, "string");
  const response = await request("metadata/providers", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  assert.equal(response.status, 200);
  const providers = await response.json();
  assert.deepEqual(
    providers.filter((provider) => provider.slug === "dlsite"),
    [{ slug: "dlsite", name: "DLsite", priority: 20, enabled: true }],
  );
  console.log(
    JSON.stringify(
      {
        endpoint: `${address}/api/metadata/providers`,
        status: response.status,
        providers,
        archiveSha256: createHash("sha256")
          .update(await readFile(archive))
          .digest("hex"),
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await app?.close();
    if (address) {
      await assert.rejects(
        fetch(`${address}/api/metadata/providers`, {
          signal: AbortSignal.timeout(1_000),
        }),
        "Temporary server should no longer accept connections",
      );
      console.log("Temporary localhost server stopped.");
    }
  } finally {
    clearTimeout(deadline);
    process.chdir(oldCwd);
    await rm(copiedPlugin, { recursive: true, force: true });
    await rm(runtime, { recursive: true, force: true });
  }
}
// The host can retain maintenance handles after app.close(); this is a bounded CLI check.
process.exit(0);
