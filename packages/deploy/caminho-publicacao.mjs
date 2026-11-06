import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Decide o caminho de uma publicação no PROD pelos arquivos que mudaram desde a última publicação:
//  - "front": só a tela do Sistema Betinhos (WebResource). Vai direto ao PROD (push-front-prod.ps1). Se der errado,
//    publicar a versão anterior resolve em minutos e nenhum dado se perde.
//  - "plugin": só o código de plugin que já existe no PROD. Copia para o PROD o assembly que o DEV já usa (decisão do Renan,
//    05/11/2026: sem TEST nem backup, como a tela). Publicar a versão anterior resolve em minutos. Registrador, step e Custom
//    API novos não entram aqui: mudam mais que o código. Tela e plugin juntos: "front-plugin", os dois caminhos rápidos.
//  - "solucoes": schema, flows, step, Custom APIs, outros WebResources... Vai pelas soluções: export do DEV, ensaio no
//    TEST e PROD com aprovação (publicar.yml). Um import que quebra no meio deixa o PROD pela metade e não tem volta.
//  - "nada": só documentação, CI, skills e scripts de publicação; o PROD não muda.
// Arquivo que não está em nenhuma lista vai pelas soluções: na dúvida, o caminho mais seguro.

// Entram no build da tela (apps/shell/package.json: @betinhos/dataverse é workspace; o lock decide as dependências).
export const FRONT = [
  /^apps\/shell\//,
  /^packages\/dataverse\//,
  /^pnpm-lock\.yaml$/,
  /^packages\/deploy\/inline-webresource\.mjs$/,
  /^packages\/deploy\/loader\.template\.html$/,
]

// Pasta de código de um plugin que o Deploy publica: Cr40f.<Nome>.Plugin, ou o assembly Betinhos.DriverRecordSharing (herdado do
// app Motoristas; nome curto driverrecordsharing). Betinhos.ExpenseUpload está congelado: compila e testa no CI, mas não é
// publicado por aqui. Nome curto = o que vira argumento de push-<nome>-plugin.ps1 e a chave PLUGIN_SNK_<NOME>.
export const PLUGIN_PASTA = String.raw`Cr40f\.([A-Za-z]+)\.Plugin|Betinhos\.(DriverRecordSharing)`
export const nomePlugin = (m) => (m[1] ?? m[2]).toLowerCase()
const PLUGIN = new RegExp(`^packages/plugins/(?:${PLUGIN_PASTA})/`)

// Não mudam nada no PROD. Os apps portal-cliente e cadastro-passageiro são Workers da Cloudflare (wrangler), fora do Dataverse.
export const NEUTRO = [
  /^docs\//,
  /^legacy\//,
  /^\.claude\//,
  /^\.github\//,
  /^scripts\//,
  /^apps\/portal-cliente\//,
  /^apps\/cadastro-passageiro\//,
  /^packages\/deploy\/solucoes\//,
  /^packages\/deploy\/(push-dev|push-front-prod|push-plugins-dev|push-plugins-prod|exportar-plugins-dev|pendentes-dev|push-flows-dev|chunk-cleanup)\.ps1$/,
  /^packages\/plugins\/(Cr40f\.[A-Za-z]+\.Plugin|Betinhos\.(DriverRecordSharing|ExpenseUpload))\.Tests\//,
  // Betinhos.ExpenseUpload: congelado, não é publicado por nenhum caminho.
  /^packages\/plugins\/Betinhos\.ExpenseUpload\//,
  /^packages\/deploy\/(bump-version|caminho-publicacao|mudancas-dev|flows-dev|scan-secrets|dv-token|dev-restart)(\.test)?\.mjs$/,
  /^packages\/deploy\/flows\/backup\//,
  /^packages\/deploy\/package\.json$/,
  /(^|\/)[^/]+\.md$/,
  /^\.gitignore$/,
  /^\.env\.example$/,
]

export function caminhoDoArquivo(arquivo) {
  if (FRONT.some((r) => r.test(arquivo))) return 'front'
  if (PLUGIN.test(arquivo)) return 'plugin'
  if (NEUTRO.some((r) => r.test(arquivo))) return 'nada'
  return 'solucoes'
}

// arquivos: lista do git diff --name-only (com os nomes antigos de renomeações). null = sem base conhecida → soluções.
export function caminhoDaPublicacao(arquivos) {
  if (arquivos == null) return { caminho: 'solucoes', motivo: 'sem publicação anterior registrada (tag prod-publicado)', plugins: [] }
  const porCaminho = { front: [], plugin: [], solucoes: [] }
  for (const arquivo of arquivos.map((a) => a.trim()).filter(Boolean)) {
    const c = caminhoDoArquivo(arquivo)
    if (c !== 'nada') porCaminho[c].push(arquivo)
  }
  if (porCaminho.solucoes.length) {
    const lista = porCaminho.solucoes
    return { caminho: 'solucoes', motivo: `fora da tela e do código de plugin: ${lista.slice(0, 10).join(', ')}${lista.length > 10 ? ` (+${lista.length - 10})` : ''}`, plugins: [] }
  }
  const plugins = [...new Set(porCaminho.plugin.map((a) => nomePlugin(PLUGIN.exec(a))))].sort()
  const front = porCaminho.front.length
  if (front && plugins.length) return { caminho: 'front-plugin', motivo: `tela (${front} arquivo(s)) e plugins: ${plugins.join(', ')}`, plugins }
  if (plugins.length) return { caminho: 'plugin', motivo: `só código de plugin: ${plugins.join(', ')}`, plugins }
  if (front) return { caminho: 'front', motivo: `só a tela: ${front} arquivo(s)`, plugins }
  return { caminho: 'nada', motivo: 'nenhum arquivo que mude o PROD', plugins }
}

// Uso: git diff --name-only A B | node caminho-publicacao.mjs          → imprime JSON {caminho, motivo}
//      node caminho-publicacao.mjs --sem-base                           → soluções (primeira publicação)
//      git diff --name-only A B | node caminho-publicacao.mjs --front   → lista só os arquivos da tela (trava do DEV)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const arquivos = args.includes('--sem-base') ? null : readFileSync(0, 'utf8').split('\n')
  if (args.includes('--front')) {
    for (const a of arquivos ?? []) if (a.trim() && caminhoDoArquivo(a.trim()) === 'front') console.log(a.trim())
  } else {
    console.log(JSON.stringify(caminhoDaPublicacao(arquivos)))
  }
}
