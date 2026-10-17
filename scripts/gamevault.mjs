import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values, positionals } = parseArgs({
  options: { backend: { type: "string" } },
  allowPositionals: true,
});
const [action] = positionals;
if (
  !values.backend ||
  !["build", "typecheck", "test", "coverage"].includes(action)
) {
  throw new Error(
    "Usage: node scripts/gamevault.mjs build|typecheck|test|coverage --backend /path/to/gamevault-backend",
  );
}
const root = resolve(import.meta.dirname, "..");
const backend = resolve(values.backend);
const hostPackage = JSON.parse(
  await readFile(join(backend, "package.json"), "utf8"),
);
if (hostPackage.name !== "gamevault-backend") {
  throw new Error("--backend must point to a GameVault backend checkout.");
}
const run = (command, args, cwd = root, env = process.env) =>
  execFileSync(command, args, { cwd, env, stdio: "inherit" });

const stage = join(backend, ".local/plugins/dlsite");
await mkdir(stage, { recursive: true });
for (const file of await readdir(join(root, "plugin"))) {
  if (file.endsWith(".ts"))
    await cp(join(root, "plugin", file), join(stage, file));
}
run("npm", ["run", "build"]);
const core = join(stage, "core");
await mkdir(core, { recursive: true });
for (const file of await readdir(join(root, "dist"))) {
  if (file.endsWith(".d.ts"))
    await cp(join(root, "dist", file), join(core, file));
}
const bundled = await build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(core, "index.js"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: false,
  legalComments: "eof",
  metafile: true,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
if (action === "typecheck") {
  run("pnpm", ["exec", "tsc", "--noEmit"], backend);
} else {
  run("pnpm", ["build"], backend);
  const compiled = join(backend, "dist/.local/plugins/dlsite");
  await cp(core, join(compiled, "core"), { recursive: true });
  if (action === "test" || action === "coverage") {
    run(
      "npm",
      [
        "exec",
        "--",
        "vitest",
        "run",
        "--config",
        "vitest.provider.config.ts",
        ...(action === "coverage" ? ["--coverage"] : []),
      ],
      root,
      { ...process.env, GAMEVAULT_BACKEND: backend },
    );
  } else {
    const artifacts = join(root, "artifacts");
    const output = join(artifacts, "dlsite");
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    await cp(compiled, output, { recursive: true });
    for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
      await cp(join(root, file), join(output, file));
    }
    await cp(join(root, "docs/provider.md"), join(output, "README.md"));
    for (const file of ["client.md", "verification.md"]) {
      await cp(join(root, "docs", file), join(output, file));
    }
    await writeFile(
      join(output, "package.json"),
      JSON.stringify(
        {
          name: "gamevault-dlsite-plugin",
          version: "0.1.0",
          type: "module",
          private: true,
        },
        null,
        2,
      ) + "\n",
    );
    // Include the licenses of every bundled private dependency, not host code.
    {
      const dependencies = new Set();
      for (const input of Object.keys(bundled.metafile.inputs)) {
        const match = input.match(/.*node_modules\/(?:@[^/]+\/)?[^/]+/);
        if (match) dependencies.add(match[0]);
      }
      for (const dependency of dependencies) {
        const directory = resolve(root, dependency);
        const manifest = JSON.parse(
          await readFile(join(directory, "package.json"), "utf8"),
        );
        const destination = join(
          output,
          "licenses",
          `${manifest.name}@${manifest.version}`,
        );
        await mkdir(destination, { recursive: true });
        await cp(
          join(directory, "package.json"),
          join(destination, "package.json"),
        );
        const licenses = (await readdir(directory)).filter((file) =>
          /^(license|copying)/i.test(file),
        );
        if (!licenses.length) {
          if (manifest.name !== "boolbase" || manifest.version !== "1.0.0")
            throw new Error(
              `Missing bundled dependency license: ${manifest.name}`,
            );
          await cp(
            join(root, "THIRD_PARTY_NOTICES.md"),
            join(destination, "LICENSE"),
          );
        }
        for (const file of licenses) {
          await cp(join(directory, file), join(destination, file));
        }
      }
    }
    const archive = join(artifacts, "dlsite-0.1.0.zip");
    await rm(archive, { force: true });
    run("zip", ["-qr", archive, "dlsite"], artifacts);
    console.log(
      `Plugin directory: ${output}\nPlugin archive: ${archive}\nHost: ${hostPackage.version}`,
    );
  }
}
