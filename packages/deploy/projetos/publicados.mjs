// Registro "Publicado no PROD" do módulo Projetos (job projetos do producao.yml, depois que a tag prod-publicado anda).
// Para cada código de etapa PRJ-<n>.<m> citado nos commits publicados (intervalo entre a tag anterior e o HEAD) e no título ou
// corpo dos PRs desses merges: grava cr40f_publicadoprod na etapa (chave alternativa cr40f_codigo) e cria uma atualização do
// Agente na linha do tempo, presa ao projeto e à etapa. Best-effort: nunca sai com erro; avisos vão para o GITHUB_STEP_SUMMARY.
// Idempotente: etapa que já tem atualização "Publicado no PROD" com o mesmo commit não ganha outra.
//
//   node packages/deploy/projetos/publicados.mjs --base <sha da tag anterior> --head <sha publicado>
//   (DV_ENVIRONMENT_URL, DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET do environment prod-front; GITHUB_TOKEN opcional)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const PROD_HOST = 'orgf261ae8e.crm2.dynamics.com'
export const PROD_ORG_ID = '9e4ef53e-8bfc-f011-89f6-6045bd3ad1ec'
export const AUTOR_AGENTE = 100000002
export const MARCA = 'Publicado no PROD'

const CODIGO = /\bPRJ-(\d+)\.(\d+)\b/gi

/** Códigos de etapa (PRJ-n.m) do texto, normalizados e sem repetição, na ordem em que aparecem. "PRJ-12" sem etapa não conta. */
export function extrairCodigos(texto) {
  const vistos = new Set()
  for (const m of String(texto ?? '').matchAll(CODIGO)) vistos.add(`PRJ-${Number(m[1])}.${Number(m[2])}`)
  return [...vistos]
}

/** Número do PR pelo assunto do commit: merge ("Merge pull request #12 from ...") ou squash ("feat: x (#12)"). */
export function prDoAssunto(assunto) {
  const m = /^Merge pull request #(\d+)\b/.exec(assunto) ?? /\(#(\d+)\)\s*$/.exec(assunto)
  return m ? Number(m[1]) : null
}

/**
 * PR de cada commit do intervalo. `commits`: [{ sha, assunto }]; `membros`: { <sha do merge>: [shas trazidos por ele] }.
 * O merge mais interno ganha (o PR da feature na develop vence o PR develop → main que também traz o commit).
 */
export function atribuirPrs(commits, membros = {}) {
  const pr = new Map()
  for (const c of commits) {
    const n = prDoAssunto(c.assunto)
    if (n != null) pr.set(c.sha, n)
  }
  const merges = Object.entries(membros).filter(([sha]) => pr.has(sha)).sort((a, b) => a[1].length - b[1].length)
  for (const [sha, lista] of merges) for (const membro of lista) if (!pr.has(membro)) pr.set(membro, pr.get(sha))
  return pr
}

/**
 * Códigos encontrados com os PRs que os citam. `commits`: [{ sha, mensagem, pr }]; `prs`: { <n>: { titulo, corpo } }.
 * Retorna [{ codigo, prs: [n] }] ordenado pelo código.
 */
export function codigosPublicados(commits, prs = {}) {
  const porCodigo = new Map()
  const anotar = (codigo, n) => {
    if (!porCodigo.has(codigo)) porCodigo.set(codigo, new Set())
    if (n != null) porCodigo.get(codigo).add(Number(n))
  }
  for (const c of commits) for (const codigo of extrairCodigos(c.mensagem)) anotar(codigo, c.pr)
  for (const [n, p] of Object.entries(prs)) for (const codigo of extrairCodigos(`${p.titulo ?? ''}\n${p.corpo ?? ''}`)) anotar(codigo, n)
  const ordem = (a) => a.split(/[-.]/).slice(1).map(Number)
  return [...porCodigo]
    .map(([codigo, lista]) => ({ codigo, prs: [...lista].sort((a, b) => a - b) }))
    .sort((a, b) => { const [x, y] = [ordem(a.codigo), ordem(b.codigo)]; return x[0] - y[0] || x[1] - y[1] })
}

/** dd/mm/aaaa HH:mm em America/Sao_Paulo. */
export function dataHoraSp(data) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

export const shaCurto = (sha) => String(sha).slice(0, 7)

export function textoAtualizacao({ agora, sha, prs = [] }) {
  const pr = prs.length ? `, PR ${prs.map((n) => `#${n}`).join(', ')}` : ''
  return `${MARCA} em ${dataHoraSp(agora)} (America/Sao_Paulo), commit ${shaCurto(sha)}${pr}`
}

export const jaRegistrado = (textos, sha) => textos.some((t) => String(t ?? '').startsWith(MARCA) && String(t).includes(`commit ${shaCurto(sha)}`))

/** Web API mínima sobre fetch. Respostas de erro viram exceção com o status, exceto 404 em `get` (null). */
export function criarApi({ fetch: f = fetch, baseUrl, token }) {
  const api = `${baseUrl.replace(/\/+$/, '')}/api/data/v9.2`
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }
  const pedir = async (metodo, caminho, corpo) => {
    const r = await f(`${api}/${caminho}`, { method: metodo, headers: metodo === 'PATCH' ? { ...headers, 'If-Match': '*' } : headers, body: corpo ? JSON.stringify(corpo) : undefined })
    if (metodo === 'GET' && r.status === 404) return null
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '')
      const erro = new Error(`${metodo} ${caminho.split('?')[0]}: HTTP ${r.status} ${detalhe.slice(0, 300)}`)
      erro.status = r.status
      throw erro
    }
    return r.status === 204 ? null : r.json()
  }
  return { get: (c) => pedir('GET', c), patch: (c, b) => pedir('PATCH', c, b), post: (c, b) => pedir('POST', c, b) }
}

const aspas = (v) => String(v).replace(/'/g, "''")

/**
 * Grava cada código. Retorna { tabelasAusentes, gravados, jaRegistrados, naoEncontrados, falhas } (listas de códigos; falhas com motivo).
 */
export async function gravarPublicacoes({ api, codigos, sha, agora = new Date() }) {
  const r = { tabelasAusentes: [], gravados: [], jaRegistrados: [], naoEncontrados: [], falhas: [] }
  if (!codigos.length) return r
  const sets = {}
  for (const tabela of ['cr40f_projeto', 'cr40f_projetoetapa', 'cr40f_projetoatualizacao']) {
    const def = await api.get(`EntityDefinitions(LogicalName='${tabela}')?$select=EntitySetName`)
    if (!def?.EntitySetName) r.tabelasAusentes.push(tabela)
    else sets[tabela] = def.EntitySetName
  }
  if (r.tabelasAusentes.length) return r
  for (const { codigo, prs } of codigos) {
    try {
      const etapa = await api.get(`${sets.cr40f_projetoetapa}(cr40f_codigo='${aspas(codigo)}')?$select=cr40f_projetoetapaid,_cr40f_projeto_value`)
      if (!etapa) { r.naoEncontrados.push(codigo); continue }
      const id = etapa.cr40f_projetoetapaid
      const existentes = await api.get(`${sets.cr40f_projetoatualizacao}?$select=cr40f_texto&$filter=_cr40f_etapa_value eq ${id} and cr40f_autor eq ${AUTOR_AGENTE}`)
      if (jaRegistrado((existentes?.value ?? []).map((a) => a.cr40f_texto), sha)) { r.jaRegistrados.push(codigo); continue }
      await api.patch(`${sets.cr40f_projetoetapa}(${id})`, { cr40f_publicadoprod: agora.toISOString() })
      const texto = textoAtualizacao({ agora, sha, prs })
      await api.post(sets.cr40f_projetoatualizacao, {
        cr40f_name: `${MARCA} - ${codigo}`, cr40f_data: agora.toISOString(), cr40f_autor: AUTOR_AGENTE, cr40f_texto: texto, cr40f_eprova: false,
        'cr40f_Projeto@odata.bind': `/${sets.cr40f_projeto}(${etapa._cr40f_projeto_value})`,
        'cr40f_Etapa@odata.bind': `/${sets.cr40f_projetoetapa}(${id})`,
      })
      r.gravados.push(codigo)
    } catch (erro) {
      r.falhas.push({ codigo, motivo: erro.message })
    }
  }
  return r
}

export function resumoMarkdown({ codigos, resultado, avisos = [] }) {
  const linhas = ['## Projetos: Publicado no PROD', '']
  const lista = (xs) => (xs.length ? xs.join(', ') : 'nenhum')
  linhas.push(`- Códigos achados: ${lista(codigos.map((c) => c.codigo))}`)
  if (resultado) {
    if (resultado.tabelasAusentes.length) linhas.push(`- Aviso: tabelas ausentes no PROD (schema ainda não importado): ${resultado.tabelasAusentes.join(', ')}. Nada gravado.`)
    linhas.push(`- Gravados: ${lista(resultado.gravados)}`)
    if (resultado.jaRegistrados.length) linhas.push(`- Já registrados neste commit: ${lista(resultado.jaRegistrados)}`)
    if (resultado.naoEncontrados.length) linhas.push(`- Aviso: não encontrados no PROD: ${lista(resultado.naoEncontrados)}`)
    for (const f of resultado.falhas) linhas.push(`- Aviso: ${f.codigo} falhou: ${f.motivo}`)
  }
  for (const a of avisos) linhas.push(`- Aviso: ${a}`)
  return `${linhas.join('\n')}\n`
}

// --- execução no job -------------------------------------------------------------------------------------------------------

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

function commitsDoIntervalo(base, head) {
  const bruto = git('log', '--format=%H%x1f%P%x1f%s%x1f%B%x1e', `${base}..${head}`)
  const commits = bruto.split('\x1e').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [sha, pais, assunto, mensagem] = x.split('\x1f')
    return { sha, pais: pais.split(' ').filter(Boolean), assunto, mensagem }
  })
  const membros = {}
  for (const c of commits) if (c.pais.length > 1 && prDoAssunto(c.assunto) != null) {
    membros[c.sha] = git('rev-list', `${c.pais[0]}..${c.pais[1]}`).split('\n').filter(Boolean)
  }
  const pr = atribuirPrs(commits, membros)
  return commits.map((c) => ({ ...c, pr: pr.get(c.sha) ?? null }))
}

async function prsDoGithub(numeros, avisos) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo) { avisos.push('sem GITHUB_TOKEN: códigos lidos só das mensagens de commit'); return {} }
  const prs = {}
  for (const n of numeros.slice(0, 200)) {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/pulls/${n}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'producao-projetos' } })
      if (!r.ok) { avisos.push(`PR #${n}: HTTP ${r.status}`); continue }
      const p = await r.json()
      prs[n] = { titulo: p.title, corpo: p.body }
    } catch (erro) {
      avisos.push(`PR #${n}: ${erro.message}`)
    }
  }
  return prs
}

async function tokenProd(avisos) {
  const faltando = ['DV_ENVIRONMENT_URL', 'DV_TENANT_ID', 'DV_CLIENT_ID', 'DV_CLIENT_SECRET'].filter((n) => !process.env[n])
  if (faltando.length) { avisos.push(`variáveis ausentes: ${faltando.join(', ')}`); return null }
  const baseUrl = process.env.DV_ENVIRONMENT_URL.replace(/\/+$/, '')
  if (new URL(baseUrl).host.toLowerCase() !== PROD_HOST) { avisos.push(`DV_ENVIRONMENT_URL não é o PROD (${PROD_HOST}); nada gravado`); return null }
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DV_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.DV_CLIENT_ID, client_secret: process.env.DV_CLIENT_SECRET, scope: `${baseUrl}/.default` }),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok || !corpo.access_token) { avisos.push(`falha ao obter token do PROD: HTTP ${r.status} ${corpo.error ?? ''}`); return null }
  return { baseUrl, token: corpo.access_token }
}

async function main(args) {
  const valor = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
  const base = valor('--base')
  const head = valor('--head') ?? process.env.GITHUB_SHA
  const avisos = []
  let codigos = []
  let resultado = null
  try {
    if (!base || !/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head ?? '')) {
      avisos.push('sem publicação anterior (tag prod-publicado) ou commit inválido: nada a registrar')
    } else {
      const commits = commitsDoIntervalo(base, head)
      const numeros = [...new Set(commits.map((c) => c.pr).filter((n) => n != null))]
      codigos = codigosPublicados(commits, await prsDoGithub(numeros, avisos))
      if (codigos.length) {
        const sessao = await tokenProd(avisos)
        if (sessao) {
          const api = criarApi(sessao)
          const who = await api.get('WhoAmI')
          if (who?.OrganizationId !== PROD_ORG_ID) avisos.push('a API não respondeu pela organização PROD; nada gravado')
          else resultado = await gravarPublicacoes({ api, codigos, sha: head })
        }
      }
    }
  } catch (erro) {
    avisos.push(`erro inesperado: ${erro.message}`)
  }
  const md = resumoMarkdown({ codigos, resultado, avisos })
  console.log(md)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2))
}
