// Lê a versão que o portal publicado mostra na página (<meta name="portal-versao">, gravada pelo vite.config.ts), sem credencial.
// Qualquer falha (projeto ainda sem deploy, rede, página sem versão) devolve null: a publicação segue pela versão do repositório.
import { pathToFileURL } from 'node:url'

export function versaoDoHtml(html) {
  const m = /<meta name="portal-versao" content="(\d+\.\d+\.\d+)"/.exec(String(html))
  return m ? m[1] : null
}

export async function versaoPublicada(base, { fetch: f = fetch } = {}) {
  try {
    const r = await f(`${base.replace(/\/+$/, '')}/`, { signal: AbortSignal.timeout(15000) })
    return versaoDoHtml(await r.text())
  } catch {
    return null
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log((await versaoPublicada(process.argv[2] ?? '')) ?? '')
}
