import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { FRONT } from './caminho-publicacao.mjs'

// Decide o que o workflow Deploy publica no DEV pelos arquivos que mudaram no push da develop:
//  - tela: o build do Sistema Betinhos (pnpm push), quando muda algo que entra nele ou o próprio script de publicação;
//  - plugins: cada plugin cujo código, registrador ou script de publicação mudou (push-<nome>-plugin.ps1).
// Teste de plugin (Cr40f.<Nome>.Plugin.Tests) não republica: o assembly publicado não muda.
// Flows têm decisão própria (flows-dev.mjs, pela tag flows-dev-publicado); flow novo, schema e sitemap:* continuam à mão:
// usam az login e conexões do usuário. Por aqui, arquivo de flow não publica nada.

export const TELA = [...FRONT, /^packages\/deploy\/(push-dev\.ps1|bump-version\.mjs)$/]

const PLUGIN = [
  /^packages\/plugins\/Cr40f\.([A-Za-z]+)\.Plugin\//,
  /^packages\/plugins\/tools\/Cr40f\.([A-Za-z]+)\.Registrar\//,
  /^packages\/plugins\/scripts\/push-([a-z]+)-plugin\.ps1$/,
]

export function pluginDoArquivo(arquivo) {
  for (const r of PLUGIN) {
    const m = r.exec(arquivo)
    if (m) return m[1].toLowerCase()
  }
  return null
}

// arquivos: lista do git diff --name-only. null = sem base (primeiro push, before inexistente): publica a tela e nenhum plugin.
export function mudancasDev(arquivos) {
  if (arquivos == null) return { tela: true, plugins: [] }
  const lista = arquivos.map((a) => a.trim()).filter(Boolean)
  const plugins = new Set()
  for (const a of lista) {
    const p = pluginDoArquivo(a)
    if (p) plugins.add(p)
  }
  return { tela: lista.some((a) => TELA.some((r) => r.test(a))), plugins: [...plugins].sort() }
}

// Uso: git diff --name-only A B | node mudancas-dev.mjs            → JSON {tela, plugins}
//      git diff --name-only A B | node mudancas-dev.mjs --github   → linhas tela=... e plugins=a,b (para $GITHUB_OUTPUT)
//      node mudancas-dev.mjs --sem-base [--github]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const r = mudancasDev(args.includes('--sem-base') ? null : readFileSync(0, 'utf8').split('\n'))
  console.log(args.includes('--github') ? `tela=${r.tela}\nplugins=${r.plugins.join(',')}` : JSON.stringify(r))
}
