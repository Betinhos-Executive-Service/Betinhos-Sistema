// Grava `track:<id>` no KV local do `wrangler dev` (.wrangler/state). Usado por semear-local e cenarios-e2e.
// Chama o bin do wrangler instalado com o próprio Node (sem `pnpm` no PATH, sem shell) e grava o JSON em pasta
// temporária do sistema, para funcionar igual em Windows, macOS e Linux.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const WRANGLER = join(dirname(createRequire(import.meta.url).resolve("wrangler/package.json")), "bin", "wrangler.js");
let dir = null;

export function gravarTrackLocal(id, dados, cwd = process.cwd()) {
  dir ??= mkdtempSync(join(tmpdir(), "kv-local-"));
  const f = join(dir, `${id}.json`);
  writeFileSync(f, JSON.stringify(dados));
  execFileSync(process.execPath, [WRANGLER, "kv", "key", "put", "--binding=TRACK_KV", "--local", `track:${id}`, "--path", f], { cwd, stdio: "pipe" });
}
