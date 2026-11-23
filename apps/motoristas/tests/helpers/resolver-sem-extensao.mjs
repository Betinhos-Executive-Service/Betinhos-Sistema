// Os pacotes do workspace (ex.: @betinhos/app-config) importam sem extensão ('./catalogo'), o que o bundler aceita e o
// strip-types do Node não. Este hook tenta de novo com `.ts` quando o import relativo falha.
import { register } from "node:module";

register(new URL("./resolver-sem-extensao-hooks.mjs", import.meta.url));
