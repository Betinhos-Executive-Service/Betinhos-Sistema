// Exporta os registros do Dataverse para uma pasta (um .ndjson.gz por tabela + manifesto.json), para o backup externo.
// Cada registro vem com os valores formatados (nome do lookup, rótulo da choice) e o manifesto leva os nomes de exibição
// da tabela e das colunas, para planilhas.mjs montar as planilhas do time.
// Login da conta de serviço por client credentials (DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET, DV_ENVIRONMENT_URL).
//
//   node exportar-dataverse.mjs <pasta-saida>
//
// Tabelas: todas as personalizadas (cr40f_, new_ e demais), menos as virtuais, mais as padrão de BACKUP_TABELAS_EXTRA
// (vírgula; padrão account,contact). Nunca exporta cr40f_segredo (segredos não saem do Dataverse) nem o que estiver em
// BACKUP_TABELAS_EXCLUIR. Falha numa tabela não para as outras: fica no manifesto e o processo sai com código 1.
// Não imprime registros, só nomes de tabela e contagens.
import { once } from 'node:events'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createGzip } from 'node:zlib'

export const SEMPRE_EXCLUIR = ['cr40f_segredo']
const EXTRA_PADRAO = ['account', 'contact']
const API = 'api/data/v9.2'

const rotulo = (label) => label?.UserLocalizedLabel?.Label || label?.LocalizedLabels?.[0]?.Label || undefined
const lista = (texto) => (texto ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

// Recebe EntityDefinitions e devolve [{ logico, conjunto, nome, chave }] na ordem de nome.
export function escolherTabelas(definicoes, { extra = EXTRA_PADRAO, excluir = [] } = {}) {
  const fora = new Set([...SEMPRE_EXCLUIR, ...excluir])
  const dentro = new Set(extra)
  return definicoes
    .filter((d) => d.EntitySetName && !fora.has(d.LogicalName))
    .filter((d) => d.TableType !== 'Virtual')
    .filter((d) => d.IsCustomEntity === true || dentro.has(d.LogicalName))
    .map((d) => ({ logico: d.LogicalName, conjunto: d.EntitySetName, nome: rotulo(d.DisplayName) ?? d.LogicalName, chave: d.PrimaryIdAttribute }))
    .sort((a, b) => a.logico.localeCompare(b.logico))
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

// GET com repetição em 429/5xx/rede (Retry-After quando vier).
export async function obter(url, cabecalhos, { fetchFn = fetch, tentativas = 6 } = {}) {
  for (let t = 1; ; t++) {
    let resposta
    try {
      resposta = await fetchFn(url, { headers: cabecalhos })
    } catch (erro) {
      if (t >= tentativas) throw erro
      await espera(2000 * t)
      continue
    }
    if (resposta.ok) return resposta.json()
    const repetir = resposta.status === 429 || resposta.status >= 500
    if (!repetir || t >= tentativas) {
      const corpo = await resposta.text().catch(() => '')
      throw new Error(`HTTP ${resposta.status}: ${corpo.slice(0, 300)}`)
    }
    const depois = Number(resposta.headers?.get?.('retry-after'))
    await espera(Number.isFinite(depois) && depois > 0 ? depois * 1000 : 2000 * t)
  }
}

async function token({ tenant, cliente, segredo, recurso }) {
  const resposta = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cliente, client_secret: segredo, grant_type: 'client_credentials', scope: `${recurso}/.default` }),
  })
  const corpo = await resposta.json()
  if (!resposta.ok) throw new Error(`Login da conta de serviço recusado: ${corpo.error_description ?? corpo.error}`)
  return corpo.access_token
}

// Pagina uma tabela inteira e escreve uma linha JSON por registro. Devolve a contagem.
export async function exportarTabela(base, conjunto, cabecalhos, arquivo, opcoes = {}) {
  const gzip = createGzip()
  const saida = createWriteStream(arquivo)
  gzip.pipe(saida)
  let total = 0
  let url = `${base}/${API}/${conjunto}`
  try {
    while (url) {
      const pagina = await obter(url, cabecalhos, opcoes)
      for (const registro of pagina.value ?? []) {
        if (!gzip.write(`${JSON.stringify(registro)}\n`)) await once(gzip, 'drain')
        total++
      }
      url = pagina['@odata.nextLink']
    }
  } finally {
    gzip.end()
    await once(saida, 'close')
  }
  return total
}

// Metadata das colunas para a planilha: { colunas: { logico: 'Nome de exibição' }, semFuso: ['coluna'], numericas: ['coluna'] }
// (data e hora "independente de fuso" vem com Z mas não deve virar horário de Brasília; dinheiro e número saem crus, mesmo
// com valor formatado). Falha aqui não derruba a exportação.
const NUMERICOS = new Set(['Money', 'Integer', 'BigInt', 'Decimal', 'Double'])
async function metadataColunas(base, logico, cabecalhos) {
  const atributos = `${base}/${API}/EntityDefinitions(LogicalName='${logico}')/Attributes`
  const [nomes, datas] = await Promise.all([
    obter(`${atributos}?$select=LogicalName,DisplayName,AttributeType`, cabecalhos).catch(() => ({})),
    obter(`${atributos}/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=LogicalName,DateTimeBehavior`, cabecalhos).catch(() => ({})),
  ])
  return {
    colunas: Object.fromEntries((nomes.value ?? []).map((a) => [a.LogicalName, rotulo(a.DisplayName)]).filter(([, v]) => v)),
    semFuso: (datas.value ?? []).filter((a) => a.DateTimeBehavior?.Value === 'TimeZoneIndependent').map((a) => a.LogicalName),
    numericas: (nomes.value ?? []).filter((a) => NUMERICOS.has(a.AttributeType)).map((a) => a.LogicalName),
  }
}

async function principal(pasta) {
  const base = (process.env.DV_ENVIRONMENT_URL ?? '').replace(/\/+$/, '')
  const faltam = ['DV_ENVIRONMENT_URL', 'DV_TENANT_ID', 'DV_CLIENT_ID', 'DV_CLIENT_SECRET'].filter((n) => !process.env[n])
  if (!pasta || faltam.length) {
    console.error(faltam.length ? `Faltam variáveis: ${faltam.join(', ')}` : 'uso: node exportar-dataverse.mjs <pasta-saida>')
    process.exit(2)
  }
  const acesso = await token({ tenant: process.env.DV_TENANT_ID, cliente: process.env.DV_CLIENT_ID, segredo: process.env.DV_CLIENT_SECRET, recurso: base })
  // A página de 5000 vem do Prefer; o nextLink já carrega o restante.
  const cabecalhos = {
    Authorization: `Bearer ${acesso}`,
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Prefer: 'odata.maxpagesize=5000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  }
  const definicoes = await obter(`${base}/${API}/EntityDefinitions?$select=LogicalName,EntitySetName,IsCustomEntity,TableType,DisplayName,PrimaryIdAttribute`, cabecalhos)
  const extra = process.env.BACKUP_TABELAS_EXTRA === undefined ? EXTRA_PADRAO : lista(process.env.BACKUP_TABELAS_EXTRA)
  const tabelas = escolherTabelas(definicoes.value ?? [], { extra, excluir: lista(process.env.BACKUP_TABELAS_EXCLUIR) })

  mkdirSync(join(pasta, 'tabelas'), { recursive: true })
  const manifesto = { ambiente: base, inicio: new Date().toISOString(), tabelas: [], falhas: [] }
  for (const { logico, conjunto, nome, chave } of tabelas) {
    const inicio = Date.now()
    try {
      const registros = await exportarTabela(base, conjunto, cabecalhos, join(pasta, 'tabelas', `${logico}.ndjson.gz`))
      const { colunas, semFuso, numericas } = registros ? await metadataColunas(base, logico, cabecalhos) : {}
      manifesto.tabelas.push({ tabela: logico, conjunto, nome, chave, registros, colunas, semFuso, numericas })
      console.log(`${logico}: ${registros} registros (${((Date.now() - inicio) / 1000).toFixed(1)} s)`)
    } catch (erro) {
      manifesto.falhas.push({ tabela: logico, erro: String(erro.message ?? erro).slice(0, 300) })
      console.log(`::warning::${logico}: falhou (${String(erro.message ?? erro).slice(0, 200)})`)
    }
  }
  manifesto.fim = new Date().toISOString()
  manifesto.totalRegistros = manifesto.tabelas.reduce((s, t) => s + t.registros, 0)
  writeFileSync(join(pasta, 'manifesto.json'), `${JSON.stringify(manifesto, null, 2)}\n`)
  console.log(`Total: ${manifesto.tabelas.length} tabelas, ${manifesto.totalRegistros} registros, ${manifesto.falhas.length} falhas.`)
  if (manifesto.falhas.length) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await principal(process.argv[2])
}
