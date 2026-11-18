// Incrementa o PATCH do package.json e grava src/version.mjs com data/hora de Brasília.
import { readFileSync, writeFileSync } from "node:fs";

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);
pkg.version = `${maj}.${min}.${pat + 1}`;
writeFileSync(pkgUrl, JSON.stringify(pkg, null, 2) + "\n");

const quando = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date()).replace(",", "");
writeFileSync(new URL("../src/version.mjs", import.meta.url),
  `// Gerado por scripts/bump-version.mjs. Não editar à mão.\nexport const VERSAO = "v${pkg.version} · ${quando}";\n`);
console.log(`Versão v${pkg.version} · ${quando}`);
