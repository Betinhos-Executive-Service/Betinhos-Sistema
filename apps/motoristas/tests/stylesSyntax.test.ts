import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Um "}" perdido (ex.: em resolução de merge) faz o esbuild só avisar e engolir as regras seguintes.
function findUnbalancedBrace(css: string) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const withoutStrings = withoutComments.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (text) => text.replace(/[^\n]/g, " "));
  const open: number[] = [];
  const lines = withoutStrings.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const char of lines[index]) {
      if (char === "{") open.push(index + 1);
      if (char === "}") {
        if (!open.length) return `"}" sem abertura na linha ${index + 1}`;
        open.pop();
      }
    }
  }
  return open.length ? `"{" sem fechamento aberto na linha ${open[open.length - 1]}` : "";
}

for (const file of ["src/styles.css", "src/features/comunicados/comunicados.css"]) {
  test(`${file} tem chaves balanceadas`, () => {
    assert.equal(findUnbalancedBrace(readFileSync(file, "utf8")), "");
  });
}
