import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { FRONT, NEUTRO, PLUGIN_PASTA, nomePlugin } from './caminho-publicacao.mjs'

// Decide o que o workflow Deploy publica no DEV pelos arquivos que mudaram no push da develop:
//  - tela: o build do Sistema Betinhos (pnpm push), quando muda algo que entra nele ou o próprio script de publicação;
//  - webresources: a Tela Gerar Pagantes e o gerador de recibo (apps/gerar-pagantes, push-webresources-dev.ps1);
//  - formulario: o WebResource do Formulário Geral (apps/formulario-geral, push-formulario-dev.ps1); teste, fixture e documentação do app não republicam;
//  - plugins: cada plugin cujo código, registrador ou script de publicação mudou (push-<nome>-plugin.ps1);
//  - motoristas e motoristasSw: o HTML do App Motoristas (new_app-motoristas-v2) e o service worker dele (new_app-motoristas-v2-sw),
//    publicados por apps/motoristas/scripts/push-front-dev.ps1. Teste, documentação e scripts do app que não entram no build não republicam.
// Teste de plugin (<pasta>.Tests) e Betinhos.ExpenseUpload (congelado) não republicam: o assembly publicado não muda.
// Flows têm decisão própria (flows-dev.mjs, pela tag flows-dev-publicado); flow novo, schema e sitemap:* continuam à mão:
// usam az login e conexões do usuário. Por aqui, arquivo de flow não publica nada.

export const TELA = [...FRONT, /^packages\/deploy\/(push-dev\.ps1|bump-version\.mjs)$/]

// Não republica o que fica fora do bundle: neutro do PROD (teste, fixture, .md, docs/) e a infraestrutura à mão do app
// (power-platform/: plugin, connector, flows; scripts/provision-*). O script de publicação republica no DEV.
const FORA_DO_BUNDLE = /^apps\/formulario-geral\/(power-platform\/|scripts\/provision-)/
const formularioMudou = (a) => (/^apps\/formulario-geral\//.test(a) && !NEUTRO.some((r) => r.test(a)) && !FORA_DO_BUNDLE.test(a)) || a === 'packages/deploy/push-formulario-dev.ps1'

export const WEBRESOURCES = [/^apps\/gerar-pagantes\//, /^pnpm-lock\.yaml$/, /^packages\/deploy\/(push-webresources-dev\.ps1|bump-version\.mjs)$/]

// App Motoristas: o build (src/, configuração do Vite e os dois scripts de build) e o lock do workspace; o service worker é cópia
// da fonte (src/pwa/sw.js) e não depende do build. O script de publicação republica as duas peças.
const MOTORISTAS_SW = /^apps\/motoristas\/src\/pwa\/sw\.js$/
const MOTORISTAS_PUBLICACAO = /^apps\/motoristas\/scripts\/push-front-dev\.ps1$/
const MOTORISTAS_BUILD = [
  /^apps\/motoristas\/src\//,
  /^apps\/motoristas\/(package\.json|index\.html|vite\.config\.ts|tsconfig(\.node)?\.json)$/,
  /^apps\/motoristas\/scripts\/(build-react-singlefile|versao-build)\.cjs$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.npmrc$/,
]
const motoristasMudou = (a) => MOTORISTAS_PUBLICACAO.test(a) || (!MOTORISTAS_SW.test(a) && MOTORISTAS_BUILD.some((r) => r.test(a)))
const motoristasSwMudou = (a) => MOTORISTAS_PUBLICACAO.test(a) || MOTORISTAS_SW.test(a)

const PLUGIN = [
  new RegExp(`^packages/plugins/(?:${PLUGIN_PASTA})/`),
  /^packages\/plugins\/tools\/Cr40f\.([A-Za-z]+)\.Registrar\//,
  /^packages\/plugins\/scripts\/push-([a-z]+)-plugin\.ps1$/,
]

export function pluginDoArquivo(arquivo) {
  for (const r of PLUGIN) {
    const m = r.exec(arquivo)
    if (m) return nomePlugin(m)
  }
  return null
}

// arquivos: lista do git diff --name-only. null = sem base (primeiro push, before inexistente): publica a tela e nenhum plugin.
export function mudancasDev(arquivos) {
  if (arquivos == null) return { tela: true, webresources: false, formulario: false, motoristas: false, motoristasSw: false, plugins: [] }
  const lista = arquivos.map((a) => a.trim()).filter(Boolean)
  const plugins = new Set()
  for (const a of lista) {
    const p = pluginDoArquivo(a)
    if (p) plugins.add(p)
  }
  return {
    tela: lista.some((a) => TELA.some((r) => r.test(a))),
    webresources: lista.some((a) => !a.includes('.test.') && WEBRESOURCES.some((r) => r.test(a))),
    formulario: lista.some(formularioMudou),
    motoristas: lista.some(motoristasMudou),
    motoristasSw: lista.some(motoristasSwMudou),
    plugins: [...plugins].sort(),
  }
}

// Uso: git diff --name-only A B | node mudancas-dev.mjs            → JSON {tela, webresources, formulario, motoristas, motoristasSw, plugins}
//      git diff --name-only A B | node mudancas-dev.mjs --github   → linhas tela=..., webresources=..., formulario=... e plugins=a,b (para $GITHUB_OUTPUT)
//      node mudancas-dev.mjs --sem-base [--github]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const r = mudancasDev(args.includes('--sem-base') ? null : readFileSync(0, 'utf8').split('\n'))
  console.log(args.includes('--github') ? `tela=${r.tela}\nwebresources=${r.webresources}\nformulario=${r.formulario}\nmotoristas=${r.motoristas}\nmotoristas_sw=${r.motoristasSw}\nplugins=${r.plugins.join(',')}` : JSON.stringify(r))
}
