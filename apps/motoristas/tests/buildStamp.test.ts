import assert from "node:assert/strict";
import test from "node:test";
import { formatBuildStamp } from "../src/lib/buildStamp.ts";

test("carimbo de versão segue o padrão v0.0.0 · dd/mm/aaaa HH:mm", () => {
  assert.equal(formatBuildStamp({ version: "2.1.706", builtAtLabel: "18/10/2026, 19:49" }), "v2.1.706 · 18/10/2026 19:49");
});

test("carimbo sem build gravado mostra só a versão ou 'local'", () => {
  assert.equal(formatBuildStamp({ version: "v2.1.706" }), "v2.1.706");
  assert.equal(formatBuildStamp({}), "local");
});
