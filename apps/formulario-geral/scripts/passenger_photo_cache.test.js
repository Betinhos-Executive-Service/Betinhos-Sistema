const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").replace(/\r\n/g, "\n");

function extract(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} nao encontrada`);
  const end = app.indexOf("\n  }\n", start);
  return new Function(`${app.slice(start, end + 4)}; return ${name};`)();
}

const cacheKey = extract("passengerPhotoCacheKey");
const evictionKeys = extract("passengerPhotoEvictionKeys");

// Chave: URL + modifiedon; foto trocada (modifiedon novo) gera chave nova.
assert.equal(cacheKey("https://x/a.jpg", "2026-10-01T10:00:00Z"), "https://x/a.jpg|2026-10-01T10:00:00Z");
assert.notEqual(cacheKey("https://x/a.jpg", "2026-10-01T10:00:00Z"), cacheKey("https://x/a.jpg", "2026-10-02T10:00:00Z"));
assert.equal(cacheKey("https://x/a.jpg", undefined), "https://x/a.jpg|");
assert.equal(cacheKey("", "2026"), "");

// Remoção: dentro dos limites, nada sai.
assert.deepEqual(evictionKeys([{ key: "a", savedAt: 1, bytes: 10 }], 2, 100), []);
// Excesso de entradas: sai a mais antiga.
assert.deepEqual(
  evictionKeys([{ key: "b", savedAt: 2, bytes: 1 }, { key: "a", savedAt: 1, bytes: 1 }, { key: "c", savedAt: 3, bytes: 1 }], 2, 100),
  ["a"]
);
// Excesso de bytes: remove das mais antigas até caber.
assert.deepEqual(
  evictionKeys([{ key: "a", savedAt: 1, bytes: 60 }, { key: "b", savedAt: 2, bytes: 30 }, { key: "c", savedAt: 3, bytes: 30 }], 10, 50),
  ["a", "b"]
);
assert.deepEqual(evictionKeys([], 1, 1), []);
console.log("passenger_photo_cache ok");
