import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Decide o caminho de uma publicação no PROD pelos arquivos que mudaram desde a última publicação:
//  - "front": só a tela do Sistema Betinhos (WebResource). Vai direto ao PROD (push-front-prod.ps1). Se der errado,
//    publicar a versão anterior resolve em minutos e nenhum dado se perde.
//  - "solucoes": schema, flows, plugins, Custom APIs, outros WebResources... Vai pelas soluções: export do DEV, ensaio no
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
  /^packages\/deploy\/(push-dev|push-front-prod|push-plugins-dev|chunk-cleanup)\.ps1$/,
  /^packages\/deploy\/(bump-version|caminho-publicacao|mudancas-dev|scan-secrets|dv-token|dev-restart)(\.test)?\.mjs$/,
  /^packages\/deploy\/flows\/backup\//,
  /^packages\/deploy\/package\.json$/,
  /(^|\/)[^/]+\.md$/,
  /^\.gitignore$/,
  /^\.env\.example$/,
]

export function caminhoDoArquivo(arquivo) {
  if (FRONT.some((r) => r.test(arquivo))) return 'front'
  if (NEUTRO.some((r) => r.test(arquivo))) return 'nada'
  return 'solucoes'
}

const PESO = { nada: 0, front: 1, solucoes: 2 }

// arquivos: lista do git diff --name-only (com os nomes antigos de renomeações). null = sem base conhecida → soluções.
export function caminhoDaPublicacao(arquivos) {
  if (arquivos == null) return { caminho: 'solucoes', motivo: 'sem publicação anterior registrada (tag prod-publicado)' }
  let caminho = 'nada'
  const porCaminho = { front: [], solucoes: [] }
  for (const arquivo of arquivos.map((a) => a.trim()).filter(Boolean)) {
    const c = caminhoDoArquivo(arquivo)
    if (c !== 'nada') porCaminho[c].push(arquivo)
    if (PESO[c] > PESO[caminho]) caminho = c
  }
  const motivo =
    caminho === 'solucoes'
      ? `fora da tela: ${porCaminho.solucoes.slice(0, 10).join(', ')}${porCaminho.solucoes.length > 10 ? ` (+${porCaminho.solucoes.length - 10})` : ''}`
      : caminho === 'front'
        ? `só a tela: ${porCaminho.front.length} arquivo(s)`
        : 'nenhum arquivo que mude o PROD'
  return { caminho, motivo }
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
