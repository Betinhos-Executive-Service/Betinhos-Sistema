import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Decide o caminho de uma publicação no PROD pelos arquivos que mudaram desde a última publicação:
//  - "front": só a tela do Sistema Betinhos (WebResource). Vai direto ao PROD (push-front-prod.ps1). Se der errado,
//    publicar a versão anterior resolve em minutos e nenhum dado se perde.
//  - "plugin": só o código de plugin que já existe no PROD. Copia para o PROD o assembly que o DEV já usa (decisão do Renan,
//    05/11/2026: sem TEST nem backup, como a tela). Publicar a versão anterior resolve em minutos. Registrador, step e Custom
//    API novos não entram aqui: mudam mais que o código. Tela e plugin juntos: "front-plugin", os dois caminhos rápidos.
//  - "solucoes": schema, flows, step, Custom APIs, outros WebResources (inclui o Formulário Geral, apps/formulario-geral)... Vai pelas soluções: export do DEV, ensaio no
//    TEST e PROD com aprovação (publicar.yml). Um import que quebra no meio deixa o PROD pela metade e não tem volta.
//  - "worker": só o Worker Cloudflare acompanhar-motorista (apps/acompanhar-motorista). Não passa pelo Dataverse nem pelas soluções:
//    `wrangler deploy` direto (environment prod-front, job worker do producao.yml). Publicar a versão anterior resolve em minutos.
//    Misturado com tela ou plugin mantém o caminho deles e o Worker publica em paralelo (campo `worker`); misturado com o que vai pelas
//    soluções, o Worker também publica (é independente), mas o caminho segue sendo "solucoes".
//  - "portal": só o portal do cliente (apps/portal-cliente): Worker `portal-cliente` + Pages `portal-cliente` (cliente.betinhos.com.br), `wrangler deploy`
//    direto (job portal do producao.yml). Mesma regra do Worker: misturado com outro caminho, o portal publica em paralelo (campo `portal`).
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

// Worker acompanhar-motorista (wrangler, fora do Dataverse). Teste, documentação, scripts locais e os testes do front não mudam o que
// roda no Worker: o que sobra (src, web, public, wrangler.jsonc, package.json) publica.
export const WORKER = /^apps\/acompanhar-motorista\//
export const WORKER_NEUTRO = [
  /^apps\/acompanhar-motorista\/(tests|docs|scripts)\//,
  /^apps\/acompanhar-motorista\/web\/src\/(testes\/|teste-setup\.ts$)/,
  /^apps\/acompanhar-motorista\/\.dev\.vars\.exemplo$/,
  /^apps\/acompanhar-motorista\/\.gitignore$/,
  /\.md$/,
]

// Portal do cliente (apps/portal-cliente): Worker + front em Pages, fora do Dataverse. Teste, scripts de teste, documentação e
// config de teste não mudam o que roda: o resto (src, worker, pages, public, wrangler.jsonc, package.json, scripts de publicação) publica.
export const PORTAL = /^apps\/portal-cliente\//
export const PORTAL_NEUTRO = [
  /\.test\.[^/]+$/,
  /^apps\/portal-cliente\/(src\/test-setup\.ts|worker\/fakeDataverse\.ts|tsconfig[^/]*\.json)$/,
  /\.md$/,
]

// Não mudam nada no PROD. Os apps cadastro-passageiro e backups são Workers da Cloudflare (wrangler), fora do Dataverse.
export const NEUTRO = [
  /^docs\//,
  /^legacy\//,
  /^\.claude\//,
  /^\.github\//,
  /^scripts\//,
  /^apps\/cadastro-passageiro\//,
  /^apps\/backups\//,
  // App Motoristas: teste, documentação, skills e scripts de QA não mudam o PROD. O resto do app (build e service worker) vai pelas
  // soluções: o HTML e o service worker estão na BetinhosMotoristas.
  /^apps\/motoristas\/(tests|docs|\.claude|scripts\/qa)\//,
  // Publicação no DEV dos web resources avulsos do app; os próprios arquivos (apps/motoristas/webresources) vão pelas soluções.
  /^apps\/motoristas\/scripts\/push-webresources-dev\.ps1$/,
  /^apps\/motoristas\/.+\.md$/,
  /^apps\/gerar-pagantes\/.+\.test\.[^/]+$/,
  // Formulário Geral: o que vai ao WebResource muda o PROD (soluções); teste, fixture, documentação e a pasta docs/ não.
  /^apps\/formulario-geral\/(docs\/.+|.+\.(test|fixtures)\.[^/]+|.+\.md)$/,
  /^packages\/deploy\/solucoes\//,
  // Backup externo (job r2 do backup-prod.yml): só lê o PROD.
  /^packages\/deploy\/backup\//,
  // Registro "Publicado no PROD" do módulo Projetos (job projetos do producao.yml): só grava dados, não muda o que é publicado.
  /^packages\/deploy\/projetos\//,
  // Corte dos acessos (plano 4): roda no job acessos (acessos-corte.yml) do Deploy e da Produção, depois da publicação;
  // quem-le e prova são só leitura/DEV. O motor e os perfis (aplicar-perfis.ps1, perfis.gerado.json) seguem pelas soluções.
  /^packages\/deploy\/acessos\/(corte\.json|(corte|corte-regras|corte-estado|corte-unidade|corte-ci|relatorio-corte|dv|quem-le|prova)(\.test)?\.mjs)$/,
  /^packages\/deploy\/(push-dev|push-webresources-dev|push-formulario-dev|push-front-prod|push-plugins-dev|push-plugins-prod|exportar-plugins-dev|pendentes-dev|push-flows-dev|chunk-cleanup)\.ps1$/,
  /^packages\/plugins\/(Cr40f\.[A-Za-z]+\.Plugin|Betinhos\.(DriverRecordSharing|ExpenseUpload))\.Tests\//,
  // Betinhos.ExpenseUpload: congelado, não é publicado por nenhum caminho.
  /^packages\/plugins\/Betinhos\.ExpenseUpload\//,
  /^packages\/deploy\/(bump-version|caminho-publicacao|hotfix-tela|mudancas-dev|flows-dev|migrations-dev|migrations-ci|scan-secrets|dv-token|dev-restart)(\.test)?\.mjs$/,
  /^packages\/deploy\/flows\/backup\//,
  /^packages\/deploy\/package\.json$/,
  /(^|\/)[^/]+\.md$/,
  /^\.gitignore$/,
  /^\.env\.example$/,
]

export function caminhoDoArquivo(arquivo) {
  if (PORTAL.test(arquivo)) return PORTAL_NEUTRO.some((r) => r.test(arquivo)) ? 'nada' : 'portal'
  if (WORKER.test(arquivo)) return WORKER_NEUTRO.some((r) => r.test(arquivo)) ? 'nada' : 'worker'
  if (FRONT.some((r) => r.test(arquivo))) return 'front'
  if (PLUGIN.test(arquivo)) return 'plugin'
  if (NEUTRO.some((r) => r.test(arquivo))) return 'nada'
  return 'solucoes'
}

// arquivos: lista do git diff --name-only (com os nomes antigos de renomeações). null = sem base conhecida → soluções.
export function caminhoDaPublicacao(arquivos) {
  if (arquivos == null) return { caminho: 'solucoes', motivo: 'sem publicação anterior registrada (tag prod-publicado)', plugins: [], worker: true, portal: true }
  const porCaminho = { front: [], plugin: [], worker: [], portal: [], solucoes: [] }
  for (const arquivo of arquivos.map((a) => a.trim()).filter(Boolean)) {
    const c = caminhoDoArquivo(arquivo)
    if (c !== 'nada') porCaminho[c].push(arquivo)
  }
  const worker = porCaminho.worker.length > 0
  const portal = porCaminho.portal.length > 0
  if (porCaminho.solucoes.length) {
    const lista = porCaminho.solucoes
    return { caminho: 'solucoes', motivo: `fora da tela e do código de plugin: ${lista.slice(0, 10).join(', ')}${lista.length > 10 ? ` (+${lista.length - 10})` : ''}`, plugins: [], worker, portal }
  }
  const plugins = [...new Set(porCaminho.plugin.map((a) => nomePlugin(PLUGIN.exec(a))))].sort()
  const front = porCaminho.front.length
  if (front && plugins.length) return { caminho: 'front-plugin', motivo: `tela (${front} arquivo(s)) e plugins: ${plugins.join(', ')}`, plugins, worker, portal }
  if (plugins.length) return { caminho: 'plugin', motivo: `só código de plugin: ${plugins.join(', ')}`, plugins, worker, portal }
  if (front) return { caminho: 'front', motivo: `só a tela: ${front} arquivo(s)`, plugins, worker, portal }
  if (worker) return { caminho: 'worker', motivo: `só o Worker acompanhar-motorista: ${porCaminho.worker.length} arquivo(s)`, plugins, worker, portal }
  if (portal) return { caminho: 'portal', motivo: `só o portal do cliente: ${porCaminho.portal.length} arquivo(s)`, plugins, worker, portal }
  return { caminho: 'nada', motivo: 'nenhum arquivo que mude o PROD', plugins, worker, portal }
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
