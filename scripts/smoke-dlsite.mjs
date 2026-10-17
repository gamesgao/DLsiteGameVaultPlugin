import assert from "node:assert/strict";
import { DlsiteClient } from "../dist/index.js";

async function main() {
  let requests = 0;
  const deadline = AbortSignal.timeout(90_000);
  const warnings = [];
  const client = new DlsiteClient({
    retries: 0,
    timeoutMs: 10_000,
    onWarning: (warning) => {
      warnings.push(warning);
      console.error(`Supplement ${warning.id}: ${warning.error.message}`);
    },
    fetch: async (input, init) => {
      assert(++requests <= 16, "Live smoke exceeded its 16-request budget");
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any([init.signal, deadline]),
      });
      console.log(`HTTP ${response.status} ${new URL(String(input)).pathname}`);
      return response;
    },
  });

  const expected = [
    {
      id: "RJ150726",
      title: "もんむす・くえすと! ぱらどっくすRPG前章",
      type: "RPG",
    },
    { id: "RJ141995", title: "東方紅輝心", type: "ACN" },
  ];
  let cover;
  for (const game of expected) {
    const product = await client.getProduct(game.id);
    assert.equal(product.id, game.id);
    assert.equal(product.title, game.title);
    assert(
      product.workTypes?.some((type) => type.code === game.type),
      `${game.id}: missing game type`,
    );
    assert(
      product.score > 0 && product.score <= 100,
      `${game.id}: missing real rating`,
    );
    assert.match(product.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new URL(product.coverUrl).hostname, "img.dlsite.jp");
    cover ??= product.coverUrl;
    const before = requests;
    assert.deepEqual(await client.search(game.id), [
      { id: product.id, title: product.title, url: product.url },
    ]);
    assert.equal(
      requests,
      before,
      "Exact-ID search should reuse the product cache",
    );
    console.log(
      JSON.stringify({
        id: product.id,
        title: product.title,
        url: product.url,
        workTypes: product.workTypes,
        releaseDate: product.releaseDate,
        score: product.score,
        coverHost: new URL(product.coverUrl).hostname,
      }),
    );
  }

  const candidates = await client.search("東方紅輝心");
  assert(
    candidates.some(
      (candidate) =>
        candidate.id === "RJ141995" && candidate.title === "東方紅輝心",
    ),
    "Title search did not return the independently verified game",
  );
  assert.equal(new Set(candidates.map(({ id }) => id)).size, candidates.length);
  console.log(
    `Title search: ${candidates.length} unique candidates; RJ141995 verified`,
  );

  const artwork = await client.getImage(cover);
  assert.match(artwork.contentType, /^image\//);
  assert(artwork.data.byteLength > 0, "Empty cover response");
  console.log(
    `Cover: ${artwork.contentType}, ${artwork.data.byteLength} bytes (not saved)`,
  );
  assert.equal(warnings.length, 0, "Supplementary live requests failed");
  console.log(
    `DLsite smoke passed: 2 public games, title search, cover; ${requests} HTTP requests`,
  );
}

main().catch((error) => {
  console.error(`DLsite smoke FAILED: ${error.stack ?? error}`);
  process.exitCode = 1;
});
