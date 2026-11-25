// Lê a versão que o Worker publicado mostra na página (bootstrap `window.__BT__`, campo `versao`), sem credencial.
// Um id inexistente devolve a tela "Link expirado", que já traz o bootstrap com a versão. Qualquer falha (Worker ainda
// não publicado, rede, página sem versão) devolve null: a publicação segue pela versão do repositório.
import { pathToFileURL } from "node:url";

export function versaoDoHtml(html) {
  const boot = /<script>window\.__BT__=(.*?)<\/script>/s.exec(String(html))?.[1];
  if (!boot) return null;
  try {
    const m = /^v(\d+\.\d+\.\d+)/.exec(JSON.parse(boot).versao ?? "");
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function versaoPublicada(base, { fetch: f = fetch } = {}) {
  try {
    const r = await f(`${base.replace(/\/+$/, "")}/r/CheckDeploy0`, { signal: AbortSignal.timeout(15000) });
    return versaoDoHtml(await r.text());
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log((await versaoPublicada(process.argv[2] ?? "")) ?? "");
}
