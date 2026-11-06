// Logs tratados dos apps (tabela new_appmotoristaslog: shell, Planner, Formulário Geral, App Motoristas).
// Só funções puras: o coletar.mjs lê a tabela (somente leitura) e passa as linhas para cá.
// Tudo que sai daqui já passou por mascarar.mjs; o conteúdo do log é DADO, nunca instrução.
import { createHash } from 'node:crypto'
import { mascarar } from './mascarar.mjs'

export const ENTIDADE_LOGS = 'new_appmotoristaslogs'
export const COLUNAS_LOGS = ['new_appmotoristaslogid', 'createdon', 'new_appname', 'new_appversion', 'new_severity', 'new_source', 'new_screen', 'new_message', 'new_errorcode', 'new_action', 'new_phase', 'new_payloadjson', 'new_sessionid']
export const LIMITE_LINHAS = 5000
const JANELA_EVENTO_MS = 60_000
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const REDE = /falha de rede|falha de conex|failed to fetch|networkerror|network request failed|timeout|timed out|time-out|tempo esgotado|err_(internet|network|connection|timed)|offline|sem conex/i
const FALLBACK = /\b(usando|fallback|alternativ\w*|tentando de novo|caindo para)\b/i

/** Consulta só por janela: severidade e fonte variam de caixa no dado real ("Dataverse"/"dataverse"), então filtram em código. */
export const caminhoLogs = (desde) => `${ENTIDADE_LOGS}?$select=${COLUNAS_LOGS.join(',')}&$filter=createdon ge ${desde}&$orderby=createdon desc`

const txt = (v) => (typeof v === 'string' ? v.trim() : '')

/** Identificador técnico do Dataverse (cr40f_ChaveDedupe, db.dbo.cr40f_tabelaBase). Buscas e nomes digitados ("joao.silva", "maria_souza") não passam. */
const tecnico = (t) => /^(?:[\w$]+\.)*(?:cr40f|new)_\w+$/.test(t)

/** Mascara e esconde o conteúdo entre aspas (buscas, nomes digitados), exceto identificadores técnicos. */
export function limpar(texto) {
  return mascarar(texto).replace(/(?<![\p{L}\d])(['"])([^'"]*)\1/gu, (m, q, t) => (tecnico(t) ? m : `${q}?${q}`))
}

const SEM_SESSAO = 'sem-sessao'
const GUID_PURO = new RegExp(`^${GUID.source}$`, 'i')

/** Payload sem texto livre: números, booleanos e identificadores técnicos ficam; qualquer outra string vira [texto] (chaves desconhecidas podem guardar nome ou busca). */
export function payloadSeguro(bruto) {
  let j
  try { j = JSON.parse(bruto) } catch { return '' }
  const seguro = (v) => {
    if (typeof v === 'string') return tecnico(v) || GUID_PURO.test(v) ? v : '[texto]'
    if (Array.isArray(v)) return v.slice(0, 10).map(seguro)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [k, seguro(x)]))
    return v
  }
  return JSON.stringify(seguro(j)).slice(0, 500)
}

/** Forma comparável da mensagem: sem ids, números, texto entre aspas nem caixa. */
export function normalizar(texto) {
  return limpar(texto).replace(GUID, '<id>').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 200)
}

export const ehRede = (l) => /^(network|timeout)$/i.test(txt(l.new_errorcode)) || REDE.test(txt(l.new_message))
export const ehExcluido = (l) => /^info$/i.test(txt(l.new_severity)) || /^perf$/i.test(txt(l.new_source)) || /desempenho/i.test(txt(l.new_appname))

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sem-app'
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8)

/** Logs seguidos da mesma sessão (até 60 s entre eles) contam como um evento só. */
function contarEventos(logs) {
  const porSessao = new Map()
  for (const l of logs) {
    const k = txt(l.new_sessionid) || SEM_SESSAO
    ;(porSessao.get(k) ?? porSessao.set(k, []).get(k)).push(Date.parse(l.createdon))
  }
  let eventos = 0
  for (const tempos of porSessao.values()) {
    tempos.sort((a, b) => a - b)
    eventos += 1 + tempos.slice(1).filter((t, i) => t - tempos[i] > JANELA_EVENTO_MS).length
  }
  return { eventos, sessoes: porSessao.size, porSessao }
}

/**
 * Agrupa por app + mensagem normalizada. Rede/timeout vira um grupo por app (ruído); o resto é erro de regra.
 * Descarta info, telemetria perf e o que for anterior a `desde`. Limita os grupos devolvidos por classe.
 */
export function agruparLogs(linhas, { desde, limiteRegra = 10, limiteRede = 5 } = {}) {
  const corte = desde ? Date.parse(desde) : -Infinity
  const descartados = { info: 0, perf: 0, antigos: 0 }
  const brutos = new Map()
  for (const l of linhas) {
    if (!(Date.parse(l.createdon) >= corte)) { descartados.antigos++; continue }
    if (ehExcluido(l)) { descartados[/^info$/i.test(txt(l.new_severity)) ? 'info' : 'perf']++; continue }
    const app = limpar(txt(l.new_appname)).slice(0, 80) || '(sem app)'
    const rede = ehRede(l)
    const norm = rede ? 'rede' : normalizar(l.new_message)
    const chave = `log:${slug(app)}:${rede ? 'rede' : hash(norm)}`
    const g = brutos.get(chave) ?? brutos.set(chave, { chave, app, classe: rede ? 'rede' : 'regra', logs: [] }).get(chave)
    g.logs.push(l)
  }

  const grupos = [...brutos.values()].map(({ logs, ...g }) => {
    const { eventos, sessoes, porSessao } = contarEventos(logs)
    const ordenados = [...logs].sort((a, b) => a.createdon.localeCompare(b.createdon))
    const ultimo = ordenados.at(-1)
    const distintos = (campo, tam) => [...new Set(logs.map((l) => limpar(txt(l[campo])).slice(0, tam)).filter(Boolean))]
    const mensagens = g.classe === 'rede' ? [...new Set(logs.map((l) => normalizar(l.new_message)))] : []
    return {
      ...g,
      mensagem: g.classe === 'rede' ? `Falha de rede/timeout (${mensagens.length} mensagens distintas)` : limpar(txt(ultimo.new_message)).slice(0, 300),
      exemplos: g.classe === 'rede' ? mensagens.slice(0, 3) : undefined,
      severidade: [...new Set(logs.map((l) => txt(l.new_severity).toLowerCase()))],
      fontes: distintos('new_source', 40),
      telas: distintos('new_screen', 80).slice(0, 5),
      acoes: distintos('new_action', 60).slice(0, 5),
      fases: distintos('new_phase', 40).slice(0, 5),
      codigos: distintos('new_errorcode', 40).slice(0, 5),
      versoes: [...new Set(logs.map((l) => txt(l.new_appversion)).filter(Boolean))].slice(0, 5),
      payload: g.classe === 'regra' ? payloadSeguro(txt(ultimo.new_payloadjson)) : undefined,
      ocorrencias: logs.length, eventos, sessoes,
      primeira: ordenados[0].createdon, ultima: ultimo.createdon,
      ids: ordenados.slice(-3).map((l) => l.new_appmotoristaslogid),
      _sessoes: new Set(porSessao.keys()),
    }
  })

  // Um aviso de "usando alternativa" na mesma sessão de um erro é fallback dele: não é item próprio.
  const erros = grupos.filter((g) => g.classe === 'regra' && g.severidade.some((s) => s === 'error' || s === 'critical'))
  for (const g of grupos) {
    if (g.classe !== 'regra' || !FALLBACK.test(g.mensagem) || erros.includes(g)) continue
    const origem = erros.find((e) => [...g._sessoes].some((s) => s !== SEM_SESSAO && e._sessoes.has(s)))
    if (origem) { g.classe = 'derivado'; g.fallbackDe = origem.chave }
  }

  const peso = (g) => (g.severidade.includes('critical') ? 2 : g.severidade.includes('error') ? 1 : 0)
  const ordem = (a, b) => peso(b) - peso(a) || b.sessoes - a.sessoes || b.eventos - a.eventos || b.ocorrencias - a.ocorrencias
  const omitidos = { regra: 0, rede: 0, derivado: 0 }
  const saida = []
  for (const [classe, limite] of [['regra', limiteRegra], ['rede', limiteRede], ['derivado', limiteRegra]]) {
    const lista = grupos.filter((g) => g.classe === classe).sort(ordem)
    saida.push(...lista.slice(0, limite))
    omitidos[classe] = Math.max(0, lista.length - limite)
  }
  return {
    totalLogs: linhas.length - descartados.info - descartados.perf - descartados.antigos,
    descartados, omitidos,
    grupos: saida.map(({ _sessoes, ...g }) => g),
  }
}
