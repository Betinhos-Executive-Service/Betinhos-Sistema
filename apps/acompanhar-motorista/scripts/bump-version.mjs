// Versão de build (não é versão Git): incrementa o PATCH e grava `src/version.mjs` com data/hora de Brasília, que a
// página mostra como `vX.Y.Z · dd/mm/aaaa HH:mm`. O CI não commita (a main só recebe a develop por PR): a base é a maior
// entre a versão do package.json e a que o Worker de destino mostra no ar (`--publicada <url base do Worker>`), então a
// versão nunca retrocede. Sem `--publicada` (ou com o Worker fora do ar), sobe a partir do package.json.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { nextVersion } from "../../../packages/deploy/bump-version.mjs";
import { versaoPublicada } from "./versao-publicada.mjs";

export function textoVersao(versao, data = new Date()) {
  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(data).replace(",", "");
  return `v${versao} · ${quando}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--publicada");
  const publicada = i > 0 ? await versaoPublicada(process.argv[i + 1] ?? "") : null;
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));
  pkg.version = nextVersion(pkg.version, publicada);
  writeFileSync(pkgUrl, JSON.stringify(pkg, null, 2) + "\n");
  const texto = textoVersao(pkg.version);
  writeFileSync(new URL("../src/version.mjs", import.meta.url),
    `// Gerado por scripts/bump-version.mjs. Não editar à mão.\nexport const VERSAO = "${texto}";\n`);
  console.log(`Versão ${texto}${publicada ? ` (no ar: v${publicada})` : ""}`);
}
