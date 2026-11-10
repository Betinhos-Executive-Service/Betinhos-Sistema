import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Decide quais pecas do front o workflow Deploy publica no DEV, pelos arquivos mudados:
//  - app: new_app-motoristas-v2, quando muda algo que entra no build ou o proprio script de publicacao;
//  - sw:  new_app-motoristas-v2-sw, quando muda src/pwa/sw.js ou o script de publicacao.
// Plugins, Custom APIs, flows e schema nao passam por aqui: a BetinhosCore e a BetinhosAutomacao sao do Sistema.

const SW = /^src\/pwa\/sw\.js$/;
const PUBLICACAO = /^scripts\/push-front-dev\.ps1$/;
const BUILD = [
  /^src\//,
  /^package(-lock)?\.json$/,
  /^\.npmrc$/,
  /^scripts\/build-react-singlefile\.cjs$/,
  /^scripts\/versao-build\.cjs$/,
];

// arquivos: lista do git diff --name-only. null = sem base conhecida: publica as duas pecas.
export function mudancasDev(arquivos) {
  if (arquivos == null) return { app: true, sw: true };
  const lista = arquivos.map((a) => a.trim()).filter(Boolean);
  return {
    app: lista.some((a) => PUBLICACAO.test(a) || (!SW.test(a) && BUILD.some((r) => r.test(a)))),
    sw: lista.some((a) => PUBLICACAO.test(a) || SW.test(a)),
  };
}

// Uso: git diff --name-only A B | node scripts/mudancas-dev.mjs   -> JSON {app, sw}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(JSON.stringify(mudancasDev(readFileSync(0, "utf8").split("\n"))));
}
