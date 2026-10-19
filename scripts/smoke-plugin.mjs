import assert from "node:assert/strict";
import { execFileSync, fork } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { startProxyFixture, fixtureImage } from "./proxy-fixture.mjs";

const { values } = parseArgs({
  options: {
    backend: { type: "string" },
    archive: { type: "string" },
    live: { type: "boolean", default: false },
    proxy: { type: "boolean", default: false },
  },
});
assert(
  values.backend,
  "Usage: npm run smoke:plugin -- --backend PATH [--archive PATH] [--live | --proxy]",
);
assert(
  !(values.live && values.proxy),
  "Choose live DLsite OR local proxy fixtures",
);
const backend = resolve(values.backend);
const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const archive = resolve(values.archive ?? `artifacts/dlsite-${version}.zip`);
const manifest = JSON.parse(await readFile(join(backend, "package.json")));
assert.equal(manifest.name, "gamevault-backend");
await access(join(backend, "dist/src/app.module.js"));
await access(archive);

const runtime = await mkdtemp(join(tmpdir(), "gamevault-dlsite-"));
const host = join(runtime, "host");
const plugins = join(runtime, "plugins");
const injected = join(host, "dist/src/modules/dlsite");
const controller = new AbortController();
const signal = controller.signal;
const deadline = setTimeout(
  () =>
    controller.abort(new Error("Host check exceeded its 300-second deadline")),
  300_000,
);
const interrupt = () => controller.abort(new Error("Host check interrupted"));
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let child;
let address;
let token;
let logs = "";
let requests = 0;
let injectedFailures = 0;
let fixture;
let closed = false;
let blockedHostDns = 0;
const username = `dlsite_${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("base64url");

// No inherited host configuration, secrets, NODE_OPTIONS or checkout .env.
const env = {
  PATH: process.env.PATH,
  HOME: runtime,
  TMPDIR: runtime,
  NODE_ENV: "production",
  DB_SYSTEM: "SQLITE",
  DB_SYNCHRONIZE: "false",
  SERVER_LOG_LEVEL: "error",
  SERVER_LOG_FILES_ENABLED: "false",
  SERVER_REGISTRATION_DISABLED: "false",
  SERVER_ONLINE_ACTIVITIES_DISABLED: "true",
  WEB_UI_ENABLED: "false",
  METADATA_IGDB_ENABLED: "false",
  AUTH_BASIC_AUTH_ENABLED: "true",
  AUTH_OAUTH2_ENABLED: "false",
  AUTH_SEED: randomBytes(32).toString("hex"),
  GAMES_INDEX_INTERVAL_IN_MINUTES: "0",
  PLUGIN_DLSITE_LOCALE: "ja_JP",
  PLUGIN_DLSITE_PRIORITY: "20",
  PLUGIN_DLSITE_REQUEST_INTERVAL_MS: "500",
};

function waitForMessage(type) {
  return new Promise((resolveMessage, reject) => {
    const worker = child;
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("exit", onExit);
      worker.off("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onMessage = (message) => {
      if (message.type !== type) return;
      cleanup();
      resolveMessage(message);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code) => onError(new Error(`Host exited early (${code})`));
    const onAbort = () => onError(signal.reason);
    worker.on("message", onMessage);
    worker.once("exit", onExit);
    worker.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

async function start(expected = 1) {
  signal.throwIfAborted();
  address = undefined;
  child = fork(
    join(import.meta.dirname, "smoke-plugin-host.mjs"),
    [
      String(expected),
      String(values.live ? 48 - requests : 0),
      values.proxy ? "proxy" : "direct",
    ],
    {
      cwd: host,
      env,
      execArgv: [],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  logs = "";
  closed = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      const combined = logs + chunk;
      try {
        fixture?.assertRedacted(combined);
      } catch (error) {
        controller.abort(error);
      }
      logs = combined.slice(-20_000);
    });
  }
  child.on("message", (message) => {
    if (message.type === "http") {
      requests++;
      console.log(`Live HTTP ${message.status} ${message.url}`);
      if (requests > 48)
        controller.abort(new Error("Exceeded 48 live HTTP requests"));
    }
    if (message.type === "injected-failure") injectedFailures++;
    if (message.type === "closed") closed = true;
    if (message.type === "blocked-host-dns") blockedHostDns++;
    if (message.type === "direct-attempt")
      controller.abort(
        new Error(
          `Host attempted direct DNS in proxy fixture: ${message.hostname}`,
        ),
      );
  });
  const ready = await waitForMessage("ready");
  address = ready.address;
  console.log(
    `Host ready: ${address}; SQLite ${ready.sqlite}; plugins=${ready.plugins}`,
  );
  const response = await fetch(`${address}/api/metadata/providers`, { signal });
  assert.equal(
    response.status,
    401,
    "Provider endpoint must require real authentication",
  );
}

async function stop() {
  if (!child) return;
  const worker = child;
  // Track only this worker's descendants; do not kill processes by name.
  const rows = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const pids = new Set([worker.pid]);
  for (let size = 0; size !== pids.size;) {
    size = pids.size;
    for (const [pid, parent] of rows) if (pids.has(parent)) pids.add(pid);
  }
  const kill = (pid, name) => {
    try {
      process.kill(pid, name);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  if (worker.exitCode === null && worker.signalCode === null) {
    const exited = new Promise((done) => worker.once("exit", done));
    worker.kill("SIGTERM");
    const timer = setTimeout(() => {
      for (const pid of pids) kill(pid, "SIGKILL");
    }, 5_000);
    await exited;
    clearTimeout(timer);
  }
  for (const pid of pids) if (pid !== worker.pid) kill(pid, "SIGKILL");
  child = undefined;
  fixture?.assertRedacted(logs);
  if (address)
    assert(
      closed && worker.exitCode === 0,
      "Host must close Nest and plugin transport cleanly",
    );
  if (address) {
    await assert.rejects(
      fetch(`${address}/api/metadata/providers`, {
        signal: AbortSignal.timeout(1_000),
      }),
      "Stopped host still accepts connections",
    );
  }
  console.log(
    "Temporary host and children stopped; localhost connection refused.",
  );
}

async function request(
  path,
  { method = "GET", body, status = 200, headers = {} } = {},
) {
  const response = await fetch(`${address}/api/${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
  });
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${await (response.status === status ? Promise.resolve("") : response.text())}`,
  );
  return response;
}
const json = async (path, options) => (await request(path, options)).json();
async function login() {
  const result = await json("auth/basic/login", {
    headers: {
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
  });
  assert.equal(typeof result.access_token, "string");
  token = result.access_token;
}
async function checkProviders(expected = 1) {
  const providers = await json("metadata/providers");
  assert.deepEqual(
    providers.filter((p) => p.slug === "dlsite"),
    expected
      ? [{ slug: "dlsite", name: "DLsite", priority: 20, enabled: true }]
      : [],
  );
}
async function until(description, read, predicate) {
  const end = Date.now() + 90_000;
  while (Date.now() < end) {
    const result = await read();
    if (predicate(result)) return result;
    await sleep(300, undefined, { signal });
  }
  throw new Error(`Timed out waiting for ${description}`);
}
const source = (game) =>
  game.provider_metadata.find((p) => p.provider_slug === "dlsite");
const names = (items) => items.map((item) => item.name).sort();
const withoutUpdateCounters = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, item) =>
      ["updated_at", "entity_version"].includes(key) ? undefined : item,
    ),
  );
function fields(metadata) {
  return {
    provider_slug: metadata.provider_slug,
    provider_data_id: metadata.provider_data_id,
    title: metadata.title,
    release_date: metadata.release_date,
    developers: names(metadata.developers),
    genres: names(metadata.genres),
    tags: names(metadata.tags),
    rating: metadata.rating,
    cover: metadata.cover?.id,
    background: metadata.background?.id,
  };
}
function checkProduct(game, id, title, date) {
  const saved = source(game);
  assert.equal(
    game.provider_metadata.filter((p) => p.provider_slug === "dlsite").length,
    1,
  );
  assert.equal(saved.provider_data_id, id);
  assert.equal(saved.title, title);
  assert.equal(saved.release_date, `${date}T00:00:00.000Z`);
  for (const key of ["developers", "genres", "tags"])
    assert(saved[key].length > 0, `Missing saved ${key}`);
  assert(saved.rating > 0 && saved.rating <= 100);
  assert(saved.description.length > 30);
  assert(saved.cover?.id && saved.background?.id);
  console.log(`Saved source: ${JSON.stringify(fields(saved))}`);
  return saved;
}
async function mediaEvidence(media) {
  assert(media.file_path.startsWith(join(runtime, "media") + sep));
  assert.equal(new URL(media.source_url).hostname, "img.dlsite.jp");
  const file = await readFile(media.file_path);
  const response = await request(`media/${media.id}`);
  const served = Buffer.from(await response.arrayBuffer());
  assert.match(response.headers.get("content-type"), /^image\//);
  if (values.proxy)
    assert.deepEqual(
      file,
      fixtureImage,
      "Persisted bytes must equal the synthetic PNG fixture",
    );
  else assert(file.length > 1_000, "Persisted image is implausibly small");
  assert.equal(
    hash(served),
    hash(file),
    "HTTP media must equal the actual saved file",
  );
  if (!values.proxy)
    assert.equal(
      file.subarray(0, 3).toString("hex"),
      "ffd8ff",
      "Expected actual JPEG bytes for these live works",
    );
  const evidence = {
    id: media.id,
    source: media.source_url,
    type: media.type,
    bytes: file.length,
    sha256: hash(file),
  };
  console.log(`Persisted image: ${JSON.stringify(evidence)}`);
  return evidence;
}
const map = (gameId, workId, status = 200) =>
  json(`games/${gameId}`, {
    method: "PUT",
    status,
    body: {
      mapping_requests: [{ provider_slug: "dlsite", provider_data_id: workId }],
    },
  });
const install = () =>
  execFileSync("unzip", ["-q", archive, "-d", plugins], { timeout: 10_000 });

async function proxyLifecycle() {
  const mediaRows = async () => {
    const ack = waitForMessage("media-rows");
    child.send({ type: "media-rows" });
    const result = await ack;
    assert.equal(result.error, undefined);
    return result.rows;
  };
  const games = await until(
    "synthetic archive scan",
    () => json("games"),
    (result) => result.data.length === 3,
  );
  const find = (prefix) =>
    games.data.find((game) => basename(game.file_path).startsWith(prefix)).id;
  const automaticId = find("03");
  const manualId = find("01");
  const ncId = find("02");
  const automatic = await until(
    "fixture automatic metadata",
    () => json(`games/${automaticId}`),
    (game) =>
      source(game)?.cover && game.metadata?.title === source(game)?.title,
  );
  const original = checkProduct(
    automatic,
    "RJ000001",
    "小さな冒険 & 空",
    "2024-02-29",
  );
  assert.equal(
    original.rating,
    96,
    "Fixture JSON supplement must supply the score",
  );
  const imageRequests = () =>
    fixture.state.requests.filter((r) => r.kind === "image").length;
  const assertImages = async (saved, id) => {
    for (const [field, name] of [
      ["cover", "cover"],
      ["background", "scene"],
    ]) {
      const media = saved[field];
      assert.equal(
        media.source_url,
        `https://img.dlsite.jp/synthetic/${id}/${name}.jpg`,
        "Persist original URL, not redirect target or proxy URL",
      );
      assert.equal(
        media.type,
        "image/png",
        "Host must detect the actual image type",
      );
      await mediaEvidence(media);
    }
  };
  await assertImages(original, "RJ000001");
  const initialMediaRows = await mediaRows();
  assert.equal(initialMediaRows.length, 2);
  assert.deepEqual(
    initialMediaRows.map((row) => row.source_url).sort(),
    [original.cover.source_url, original.background.source_url].sort(),
  );
  for (const id of [manualId, ncId])
    assert.equal(source(await json(`games/${id}`)), undefined);
  const beforeReindex = fixture.state.requests.length;
  await request("games/reindex", { method: "PUT" });
  await sleep(1_500, undefined, { signal });
  assert.equal(fixture.state.requests.length, beforeReindex);
  const candidates = await json(
    "metadata/providers/dlsite/search?query=fixture",
  );
  assert(
    candidates.some((candidate) => candidate.provider_data_id === "RJ000001"),
  );
  const beforeReuse = imageRequests();
  await map(manualId, "RJ000001");
  assert.equal(
    source(await json(`games/${manualId}`)).cover.id,
    original.cover.id,
  );
  assert.equal(
    imageRequests(),
    beforeReuse,
    "Same-ID mapping must reuse persisted media",
  );

  // Real host format validation must reject a newly downloaded invalid image.
  const beforeFailure = await json(`games/${manualId}`);
  fixture.state.mode = "invalid-image";
  await map(manualId, "RJ000002", 500);
  assert.deepEqual(await json(`games/${manualId}`), beforeFailure);
  assert.deepEqual(
    await mediaRows(),
    initialMediaRows,
    "Host format rejection must not leave a media row",
  );
  assert.equal(
    (await readdir(env.VOLUMES_MEDIA)).length,
    2,
    "Host format rejection must not leave a file",
  );
  fixture.state.mode = "healthy";
  await map(manualId, "RJ000002");
  const remapped = await json(`games/${manualId}`);
  const second = source(remapped);
  assert.notEqual(second.cover.id, original.cover.id);
  await assertImages(second, "RJ000002");
  const persistedMediaRows = await mediaRows();
  assert.equal(persistedMediaRows.length, 4);
  assert.equal((await readdir(env.VOLUMES_MEDIA)).length, 4);
  assert.deepEqual(
    persistedMediaRows.map((row) => row.source_url).sort(),
    [
      original.cover.source_url,
      original.background.source_url,
      second.cover.source_url,
      second.background.source_url,
    ].sort(),
  );
  await json(`games/${manualId}`, {
    method: "PUT",
    body: {
      user_metadata: {
        title: "Fixture user title",
        rating: 42,
        tags: ["Fixture user tag"],
      },
    },
  });
  const beforeRefresh = fixture.state.requests.length;
  const beforeImages = imageRequests();
  await map(manualId, "RJ000002");
  assert.equal(
    fixture.state.requests.length - beforeRefresh,
    3,
    "Refresh must fetch redirect, HTML and JSON",
  );
  assert.equal(imageRequests(), beforeImages);
  assert.equal(
    source(await json(`games/${manualId}`)).cover.id,
    second.cover.id,
  );
  const userOverride = await json(`games/${manualId}`);
  assert.equal(userOverride.metadata.title, "Fixture user title");
  assert.equal(userOverride.metadata.rating, 42);
  assert.deepEqual(names(userOverride.metadata.tags), ["Fixture user tag"]);

  fixture.state.mode = "images-fail";
  await map(manualId, "RJ000002");
  let refreshed = await json(`games/${manualId}`);
  assert.equal(source(refreshed).cover.id, second.cover.id);
  assert.equal(source(refreshed).background.id, second.background.id);
  await assertImages(source(refreshed), "RJ000002");
  fixture.state.mode = "metadata-fail";
  for (const id of ["RJ000002", "RJ000001"]) {
    await map(manualId, id, 500);
    assert.deepEqual(await json(`games/${manualId}`), refreshed);
  }
  fixture.state.mode = "healthy";

  // An ordinary request in the very same host process must bypass the plugin proxy.
  const connects = fixture.state.connects.length;
  const ack = waitForMessage("independent");
  child.send({ type: "independent", url: fixture.independentUrl });
  assert.equal((await ack).text, "independent host request");
  assert.equal(fixture.state.connects.length, connects);
  assert.equal(fixture.state.independent, 1);
  assert.deepEqual(
    new Set(fixture.state.requests.map((r) => r.kind)),
    new Set(["product", "info", "search", "image"]),
  );
  assert.deepEqual(fixture.state.failures, []);
  assert(fixture.state.connects.every((r) => r.authorized));

  for (const phase of ["restart", "same-version replacement"]) {
    await stop();
    if (phase === "same-version replacement") {
      await rm(join(plugins, "dlsite"), { recursive: true });
      await rm(injected, { recursive: true });
      install();
    }
    const before = fixture.state.requests.length;
    await start();
    await login();
    await checkProviders();
    assert.deepEqual(
      await mediaRows(),
      persistedMediaRows,
      "SQLite media rows must survive process restart",
    );
    for (const old of [automatic, refreshed]) {
      const current = await json(`games/${old.id}`);
      assert.deepEqual(fields(source(current)), fields(source(old)));
      assert.deepEqual(fields(current.metadata), fields(old.metadata));
      assert.deepEqual(
        withoutUpdateCounters(current.user_metadata),
        withoutUpdateCounters(old.user_metadata),
      );
      await assertImages(source(current), source(old).provider_data_id);
    }
    assert.equal(
      fixture.state.requests.length,
      before,
      "Restart must use persisted metadata/media",
    );
    await map(manualId, "RJ000002");
    const current = await json(`games/${manualId}`);
    assert.equal(
      source(current).cover.id,
      second.cover.id,
      "Reloaded source_url must allow same-ID reuse",
    );
    assert.equal(
      imageRequests(),
      beforeImages + 2,
      "Failed replacement images were requested once each; restart must not redownload",
    );
    refreshed = current;
    console.log(
      `Fixture ${phase}: DB source URLs, media IDs/bytes, user priority and same-ID reuse passed.`,
    );
  }
  await stop();
  // A new process/agent must fail closed on CONNECT denial without any direct attempt.
  fixture.state.mode = "deny";
  await start();
  await login();
  const beforeDenied = await json(`games/${manualId}`);
  const beforeDeniedRequests = fixture.state.requests.length;
  await map(manualId, "RJ000002", 500);
  assert.equal(fixture.state.requests.length, beforeDeniedRequests);
  assert.deepEqual(await json(`games/${manualId}`), beforeDenied);
  await stop();
  await rm(join(plugins, "dlsite"), { recursive: true });
  await rm(injected, { recursive: true });
  await start(0);
  await login();
  await checkProviders(0);
  await assertImages(source(await json(`games/${automaticId}`)), "RJ000001");
  console.log(
    `Local CONNECT fixture evidence: ${fixture.state.requests.length} origin requests, ${fixture.state.connects.length} tunnels; no direct DNS, no leaked auth; removal retains saved media.`,
  );
}

async function lifecycle() {
  const games = await until(
    "three scanned ZIP archives",
    () => json("games"),
    (result) => result.data.length === 3,
  );
  const find = (prefix) =>
    games.data.find((game) => basename(game.file_path).startsWith(prefix)).id;
  const automaticId = find("03");
  const manualId = find("01");
  const ncId = find("02");
  const automatic = await until(
    "automatic DLsite mapping and merge",
    () => json(`games/${automaticId}`),
    (game) => source(game)?.cover && game.metadata?.title === "東方紅輝心",
  );
  const original = checkProduct(
    automatic,
    "RJ141995",
    "東方紅輝心",
    "2014-09-23",
  );
  assert.deepEqual(names(original.developers), ["あんかけスパ"]);
  assert.deepEqual(names(original.genres), ["アクション"]);
  assert.deepEqual(
    {
      ...fields(automatic.metadata),
      provider_slug: "dlsite",
      provider_data_id: "RJ141995",
    },
    fields(original),
  );
  const autoImages = await Promise.all([
    mediaEvidence(original.cover),
    mediaEvidence(original.background),
  ]);

  const beforePolicy = requests;
  await request("games/reindex", { method: "PUT" });
  await sleep(1_500, undefined, { signal });
  for (const id of [manualId, ncId]) {
    const game = await json(`games/${id}`);
    assert(game.versions.length > 0);
    assert.equal(source(game), undefined, "NC/no-ID entry must not auto-map");
  }
  assert.equal(
    requests,
    beforePolicy,
    "NC/no-ID and fresh mapped entries must not fetch on reindex",
  );
  console.log(
    "Automatic scan, NC/no-ID policy and fresh-metadata reindex passed.",
  );

  const candidates = await json(
    `metadata/providers/dlsite/search?query=${encodeURIComponent("東方紅輝心")}`,
  );
  assert(
    candidates.some(
      (candidate) =>
        candidate.provider_data_id === "RJ141995" &&
        candidate.title === "東方紅輝心",
    ),
  );
  await map(manualId, "RJ141995");
  assert.equal(
    source(await json(`games/${manualId}`)).cover.id,
    original.cover.id,
  );
  await map(manualId, "RJ150726");
  const remapped = checkProduct(
    await json(`games/${manualId}`),
    "RJ150726",
    "もんむす・くえすと! ぱらどっくすRPG前章",
    "2015-03-14",
  );
  assert.notEqual(remapped.cover.id, original.cover.id);
  assert.notDeepEqual(names(remapped.developers), names(original.developers));
  const remapImages = await Promise.all([
    mediaEvidence(remapped.cover),
    mediaEvidence(remapped.background),
  ]);

  await json(`games/${manualId}`, {
    method: "PUT",
    body: {
      user_metadata: {
        title: "Synthetic user title",
        rating: 42,
        tags: ["User tag"],
      },
    },
  });
  const beforeRefresh = requests;
  await map(manualId, "RJ150726");
  const refreshed = await json(`games/${manualId}`);
  assert.equal(source(refreshed).id, remapped.id);
  assert.equal(
    requests - beforeRefresh,
    3,
    "Forced refresh must fetch the work redirect, page and JSON again, not use cache",
  );
  // The host's unchanged TypeORM upsert need not advance updated_at.
  assert.deepEqual(fields(source(refreshed)), fields(remapped));
  assert.equal(source(refreshed).cover.id, remapped.cover.id);
  assert.equal(refreshed.metadata.title, "Synthetic user title");
  assert.equal(refreshed.metadata.rating, 42);
  assert.deepEqual(names(refreshed.metadata.tags), ["User tag"]);
  assert.equal(source(refreshed).title, remapped.title);
  assert.notEqual(source(refreshed).rating, 42);
  assert.equal(
    source(await json(`games/${automaticId}`)).provider_data_id,
    "RJ141995",
  );
  console.log(
    "Manual keyword mapping, different-ID remap, forced refresh and user priority passed.",
  );

  // Only this phase injects transport errors; no successful response is fabricated.
  let ack = waitForMessage("failure-mode");
  child.send({ type: "failure-mode", enabled: true });
  await ack;
  for (const id of ["RJ150726", "RJ141995"]) {
    const failure = await map(manualId, id, 500);
    assert.match(
      JSON.stringify(failure),
      /network|fetch|DLsite/i,
      "Failure should explain the unavailable network",
    );
    assert.deepEqual(
      await json(`games/${manualId}`),
      refreshed,
      "Failed refresh/remap must preserve the entire saved game",
    );
    console.log(
      `Injected network failure: PUT mapping ${id} -> 500; saved source/user/merged metadata unchanged.`,
    );
  }
  assert(injectedFailures >= 2);
  ack = waitForMessage("failure-mode");
  child.send({ type: "failure-mode", enabled: false });
  await ack;

  const snapshots = [automatic, refreshed];
  for (const phase of ["restart", "same-version replacement"]) {
    await stop();
    if (phase === "same-version replacement") {
      await rm(join(plugins, "dlsite"), { recursive: true });
      await rm(injected, { recursive: true });
      install();
    }
    const before = requests;
    await start();
    await login();
    await checkProviders();
    for (const old of snapshots) {
      const current = await json(`games/${old.id}`);
      assert.deepEqual(fields(source(current)), fields(source(old)));
      assert.deepEqual(fields(current.metadata), fields(old.metadata));
      // Host cascade saves on startup can advance update counters without edits.
      assert.deepEqual(
        withoutUpdateCounters(current.user_metadata),
        withoutUpdateCounters(old.user_metadata),
      );
    }
    for (const [index, media] of [
      original.cover,
      original.background,
      remapped.cover,
      remapped.background,
    ].entries()) {
      assert.deepEqual(
        await mediaEvidence(media),
        [...autoImages, ...remapImages][index],
      );
    }
    assert.equal(
      requests,
      before,
      `${phase} should use persisted fresh metadata/media`,
    );
    console.log(
      `${phase}: one dlsite, same source IDs, user overrides and identical persisted image bytes.`,
    );
  }
  await stop();
  await rm(join(plugins, "dlsite"), { recursive: true });
  await access(injected); // The host loader leaves this copy behind on removal.
  await rm(injected, { recursive: true });
  await start(0);
  await login();
  await checkProviders(0);
  const removed = await json(`games/${automaticId}`);
  assert.deepEqual(fields(source(removed)), fields(original));
  await mediaEvidence(original.cover);
  console.log(
    "Removal: zero dlsite after deleting volume AND injected copy; saved source/media remain, no purge promised.",
  );
}

try {
  await mkdir(host);
  if (values.proxy) {
    fixture = await startProxyFixture(runtime);
    env.PLUGIN_DLSITE_PROXY_URL = fixture.httpUrl;
    env.NODE_EXTRA_CA_CERTS = fixture.ca;
    env.PLUGIN_DLSITE_REQUEST_INTERVAL_MS = "0";
  }
  for (const name of [
    "CONFIG",
    "FILES",
    "MEDIA",
    "LOGS",
    "SQLITEDB",
    "PLUGINS",
    "SAVEFILES",
  ]) {
    env[`VOLUMES_${name}`] = join(runtime, name.toLowerCase());
    await mkdir(env[`VOLUMES_${name}`]);
  }
  await cp(join(backend, "package.json"), join(host, "package.json"));
  await cp(join(backend, "dist"), join(host, "dist"), {
    recursive: true,
    filter: (path) => path !== join(backend, "dist/.local"),
  });
  await symlink(
    join(backend, "node_modules"),
    join(host, "node_modules"),
    "dir",
  );
  await assert.rejects(
    access(injected),
    { code: "ENOENT" },
    "Use a clean host build, without injected plugins",
  );
  // Prepare the host's existing asset in generated output, never tracked source.
  await cp(
    join(backend, "assets/ignored-executables.txt"),
    join(host, "dist/assets/ignored-executables.txt"),
  );
  install();
  await access(join(plugins, "dlsite/dlsite.plugin.module.js"));
  if (values.live || values.proxy) {
    await writeFile(
      join(runtime, "synthetic.txt"),
      "Synthetic integration fixture. No game executable or copyrighted game data.\n",
    );
    const filenames = values.proxy
      ? [
          "01 Manual Fixture (W_P).zip",
          "02 RJ000002 Skip (NC) (W_P).zip",
          "03 RJ000001 (W_P).zip",
        ]
      : [
          "01 Manual Example (W_P).zip",
          "02 RJ150726 Skip (NC) (W_P).zip",
          "03 RJ141995 (W_P).zip",
        ];
    for (const filename of filenames) {
      execFileSync(
        "zip",
        ["-q", join(env.VOLUMES_FILES, filename), "synthetic.txt"],
        { cwd: runtime, timeout: 10_000 },
      );
    }
  }
  await start();
  const admin = await json("auth/basic/register", {
    method: "POST",
    body: { username, password },
    status: 201,
  });
  assert.equal(admin.role, 3);
  await login();
  await checkProviders();
  if (values.live) await lifecycle();
  if (values.proxy) await proxyLifecycle();
  console.log(
    JSON.stringify(
      {
        result: values.proxy
          ? "packaged host + local proxy fixtures passed (no live DLsite)"
          : values.live
            ? "host lifecycle passed"
            : "registration passed (no live retrieval)",
        host: manifest.version,
        node: process.version,
        database: "SQLite",
        archive,
        archiveSha256: hash(await readFile(archive)),
        liveRequests: requests,
        injectedFailures,
        ...(values.proxy ? { blockedHostDns } : {}),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.stack ?? error);
  fixture?.assertRedacted(logs);
  if (logs) console.error(`Last host diagnostics:\n${logs}`);
  process.exitCode = 1;
} finally {
  try {
    await stop();
  } finally {
    clearTimeout(deadline);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    await fixture?.close();
    await rm(runtime, { recursive: true, force: true });
    console.log(
      "Disposable runtime, SQLite, admin, synthetic archives and media removed.",
    );
  }
}
