import { resolve } from "node:path";
import ts from "typescript";
import { defineConfig } from "vitest/config";

const backend = process.env.GAMEVAULT_BACKEND;
if (!backend) throw new Error("Use npm run test:provider -- --backend PATH");
const host = resolve(backend);
process.env.VOLUMES_CONFIG = resolve("artifacts/test-runtime/config");
process.env.SERVER_LOG_FILES_ENABLED = "false";

export default defineConfig({
  plugins: [
    {
      name: "host-decorator-metadata",
      enforce: "pre",
      transform(code, id) {
        if (!/\/(plugin|test-provider)\/.*\.ts$/.test(id)) return;
        const result = ts.transpileModule(code, {
          fileName: id,
          compilerOptions: {
            target: ts.ScriptTarget.ES2023,
            module: ts.ModuleKind.ESNext,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            sourceMap: true,
            inlineSources: true,
          },
        });
        return { code: result.outputText, map: result.sourceMapText };
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: /^\.\.\/\.\.\/\.\.\/src\/(.*)\.js$/,
        replacement: `${host}/dist/src/$1.js`,
      },
      { find: "./core/index.js", replacement: resolve("src/index.ts") },
      {
        find: /^@nestjs\/common$/,
        replacement: `${host}/node_modules/@nestjs/common/index.js`,
      },
      {
        find: /^@nestjs\/testing$/,
        replacement: `${host}/node_modules/@nestjs/testing/index.js`,
      },
      {
        find: /^reflect-metadata$/,
        replacement: `${host}/node_modules/reflect-metadata/Reflect.js`,
      },
    ],
  },
  test: {
    include: ["test-provider/**/*.spec.ts"],
    setupFiles: ["test-provider/host-setup.ts"],
    server: { deps: { external: [new RegExp(`${host}/dist/`)] } },
    coverage: {
      provider: "v8",
      include: ["plugin/**/*.ts"],
      reportsDirectory: "coverage/provider",
      reporter: ["text", "json-summary", "html"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
