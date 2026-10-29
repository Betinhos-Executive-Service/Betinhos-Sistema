import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";

// Superfície dos módulos compartilhados: cada módulo precisa continuar exportando os mesmos
// nomes no mesmo caminho. Mover ou remover export é mudança de propósito (a limpeza do passo 7
// tirou os reexports da refatoração por funcionalidade).
// Para atualizar de propósito: UPDATE_SNAPSHOT=1 npm test
const SNAPSHOT = new URL("./characterization/module-exports.json", import.meta.url);
const DIRS = ["src/lib", "src/app", "src/data", "src/shared"];

// Leitura estática (inclui tipos); nem todo módulo é importável no Node.
// `export * from` é seguido até o arquivo de destino: o caminho antigo de um módulo movido
// precisa oferecer os mesmos nomes, não importa como reexporta.
function exportNames(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/^export\s+\*\s+from\s+["']([^"']+)["']/gm)) {
    for (const name of exportNames(join(dirname(file), match[1]))) names.add(name);
  }
  return [...names].sort();
}

function currentExports() {
  const result: Record<string, string[]> = {};
  for (const dir of DIRS) {
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts")).sort()) {
      result[`${dir}/${file}`] = exportNames(`${dir}/${file}`);
    }
  }
  return result;
}

test("modulos de src/lib, src/app, src/data e src/shared mantem os exports caracterizados", () => {
  const actual = currentExports();
  if (process.env.UPDATE_SNAPSHOT === "1") writeFileSync(SNAPSHOT, `${JSON.stringify(actual, null, 2)}\n`);
  assert.deepEqual(actual, JSON.parse(readFileSync(SNAPSHOT, "utf8")));
});
