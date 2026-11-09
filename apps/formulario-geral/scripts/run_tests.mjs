// Roda todos os testes do app (scripts/*.test.js e *.test.mjs), um processo por arquivo.
// Cada teste é um script com asserts: falha = código de saída diferente de zero.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const testes = readdirSync(scriptsDir).filter((nome) => /\.test\.(js|mjs)$/u.test(nome)).sort();
const falhas = [];

for (const nome of testes) {
  const resultado = spawnSync(process.execPath, [join(scriptsDir, nome)], { cwd: join(scriptsDir, ".."), encoding: "utf8" });
  if (resultado.status === 0) {
    console.log(`ok   ${nome}`);
  } else {
    falhas.push(nome);
    console.error(`FAIL ${nome}\n${resultado.stdout}${resultado.stderr}`);
  }
}

console.log(`${testes.length - falhas.length}/${testes.length} testes ok`);
if (falhas.length) process.exit(1);
