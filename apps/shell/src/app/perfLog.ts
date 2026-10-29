import { isLocalHost } from '@betinhos/dataverse'
import { formatBuild } from '@betinhos/ui'
import { detectDataverseRuntime, ERROR_LOG_ENTITY_SET } from '@betinhos/ui/error-logger'
import { routeFromHash } from '../nav/useHashRoute'

// Medição de desempenho no uso real: LCP, INP, CLS, tempo de abertura de cada tela e duração/tamanho/status das
// consultas ao Dataverse (Resource Timing, sem embrulhar o fetch). Lote no máximo a cada 60 s e ao esconder a aba,
// gravado em new_appmotoristaslog (severity info, source perf). Nunca grava usuário, URL nem filtros: só tabela,
// tela, duração, tamanho e status. Falha ao gravar é engolida e não vira log (sem laço).
// Não usa logAppError: o teto de 30 logs por sessão e o dedupe de 60 s são do orçamento de erros, e os lotes o esgotariam.
// "Tela pronta" é estimada pela rede (CHAIN_MS e QUIET_MS abaixo), sem gancho em cada tela. INP aqui é a pior interação da sessão (o Web Vitals usa o p98; com poucas interações é igual).

export const PERF_APP = 'Desempenho Sistema Betinhos'
export const PERF_SAMPLE_RATE = 0.2
/** `localStorage[PERF_RATE_KEY] = '1'` força a medição neste navegador (ex.: conferir no DEV). */
const PERF_RATE_KEY = 'betinhos-perf-taxa'
const PERF_SESSION_KEY = 'betinhos-perf-amostra'
const FLUSH_MS = 60_000
/** Requisição que começa até 1 s depois do fim da anterior ainda faz parte da abertura da tela. */
const CHAIN_MS = 1_000
/** Tela sem requisição nova por 3 s é dada como pronta. */
const QUIET_MS = 3_000
const MAX_REQUESTS = 200

export type PerfRequest = { t: string; tela: string; ms: number; kb: number | null; st: number | null }
export type PerfRoute = { tela: string; ms: number; consultas: number }
export type PerfVitals = { lcp?: number; inp?: number; cls?: number }
export type PerfBatch = { telas: PerfRoute[]; consultas: PerfRequest[]; vitais: PerfVitals; descartadas: number }

export type ResourceLike = { name: string; startTime: number; responseEnd: number; transferSize?: number; encodedBodySize?: number; responseStatus?: number }

/** Só o nome da tabela/ação da Web API (`.../v9.2/cr40f_reservas(…)?$filter=…` → `cr40f_reservas`); fora da Web API, null. */
export function dataverseTable(url: string) {
  const match = /\/api\/data\/v\d+(?:\.\d+)?\/([^?#/(]+)/i.exec(url)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

type OpenRoute = { tela: string; start: number; ready: number; consultas: number }

const slowest = <T extends { ms: number }>(list: T[]) => list.reduce<T | undefined>((max, item) => (max && max.ms >= item.ms ? max : item), undefined)

/** Agregador puro (sem DOM): recebe rotas, recursos e vitais e entrega lotes. Tempos em ms de performance.now(). */
export function createPerfCollector() {
  const telas: PerfRoute[] = []
  let consultas: PerfRequest[] = []
  let descartadas = 0
  let vitais: PerfVitals = {}
  // Tela aberta (ainda medindo); `last` e `previous` dão a tela de requisições que terminam depois de fechada.
  let current: OpenRoute | null = null
  let last = { tela: '', start: 0 }
  let previous = ''

  // Sem quadro pintado nem requisição (alias que redireciona, aba escondida antes de pintar) não há medida: descarta.
  function close() {
    if (current && current.ready > current.start) telas.push({ tela: current.tela, ms: Math.round(current.ready - current.start), consultas: current.consultas })
    current = null
  }

  return {
    route(tela: string, start: number) {
      close()
      current = { tela, start, ready: start, consultas: 0 }
      previous = last.tela
      last = { tela, start }
    },
    /** Primeiro quadro pintado depois da troca de tela. */
    paint(at: number) {
      if (current) current.ready = Math.max(current.ready, at)
    },
    resource(entry: ResourceLike) {
      const table = dataverseTable(entry.name)
      if (table?.toLowerCase() === ERROR_LOG_ENTITY_SET) return
      if (current && entry.startTime >= current.start && entry.startTime <= current.ready + CHAIN_MS) {
        current.ready = Math.max(current.ready, entry.responseEnd)
        if (table) current.consultas += 1
      }
      if (!table) return
      if (consultas.length >= MAX_REQUESTS) { descartadas += 1; return }
      const bytes = entry.encodedBodySize || entry.transferSize
      consultas.push({
        t: table,
        tela: entry.startTime >= last.start ? last.tela : previous,
        ms: Math.round(entry.responseEnd - entry.startTime),
        kb: bytes ? Math.round(bytes / 102.4) / 10 : null,
        st: entry.responseStatus || null,
      })
    },
    /** Os observadores só chamam quando o valor muda (LCP novo, INP/CLS novo máximo); o lote leva só o pendente. */
    vital(name: keyof PerfVitals, value: number) {
      vitais[name] = name === 'cls' ? Math.round(value * 1000) / 1000 : Math.round(value)
    },
    /** Lote pendente, ou null sem novidade. `final` (aba escondida) fecha a tela aberta mesmo sem silêncio. */
    take(now: number, final = false): PerfBatch | null {
      if (current && (final || now - current.ready >= QUIET_MS)) close()
      if (!telas.length && !consultas.length && !descartadas && !Object.keys(vitais).length) return null
      const batch: PerfBatch = { telas: telas.splice(0), consultas, vitais, descartadas }
      consultas = []
      vitais = {}
      descartadas = 0
      return batch
    },
  }
}

/** Sorteio por sessão da aba (recarregar mantém a decisão); taxa forçada no localStorage vale na hora. */
export function isSampled(rate = PERF_SAMPLE_RATE, random = Math.random) {
  try {
    const forced = Number(localStorage.getItem(PERF_RATE_KEY) || NaN)
    if (Number.isFinite(forced)) return random() < forced
    const saved = sessionStorage.getItem(PERF_SESSION_KEY)
    if (saved !== null) return saved === '1'
    const sampled = random() < rate
    sessionStorage.setItem(PERF_SESSION_KEY, sampled ? '1' : '0')
    return sampled
  } catch {
    return random() < rate
  }
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/** Resumo legível para a coluna de mensagem da tela "Logs dos apps". */
export function describeBatch(batch: PerfBatch) {
  const parts: string[] = []
  if (batch.vitais.lcp !== undefined) parts.push(`LCP ${seconds(batch.vitais.lcp)}`)
  if (batch.vitais.inp !== undefined) parts.push(`INP ${batch.vitais.inp} ms`)
  if (batch.vitais.cls !== undefined) parts.push(`CLS ${batch.vitais.cls}`)
  const slowRoute = slowest(batch.telas)
  if (slowRoute) parts.push(`${batch.telas.length} tela(s), mais lenta ${slowRoute.tela || 'inicio'} ${seconds(slowRoute.ms)}`)
  const slowRequest = slowest(batch.consultas)
  if (slowRequest) parts.push(`${batch.consultas.length} consulta(s), mais lenta ${slowRequest.t} ${seconds(slowRequest.ms)}`)
  return parts.join(' · ') || 'Lote de desempenho'
}

function currentScreen() {
  return routeFromHash(location.hash) || 'inicio'
}

/** Grava o lote direto na Web API (fora do client com reportingFetch): falha não gera log de erro. */
function send(batch: PerfBatch, session: string) {
  const message = describeBatch(batch)
  if (isLocalHost()) {
    console.info('[desempenho]', message, batch)
    return
  }
  const runtime = detectDataverseRuntime()
  if (!runtime) return
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } }
  const body = JSON.stringify({
    new_name: `${PERF_APP} | info | perf | ${message}`.slice(0, 160),
    new_occurredat: new Date().toISOString(),
    new_severity: 'info',
    new_source: 'perf',
    new_action: 'perf-batch',
    new_phase: 'perf',
    new_component: 'Sistema Betinhos',
    new_screen: currentScreen().slice(0, 120),
    new_message: message,
    new_appname: PERF_APP,
    new_appversion: `v${__APP_VERSION__}`,
    new_builtat: formatBuild(__APP_VERSION__, __BUILD_DATE__).split(' · ')[1] ?? '',
    new_sessionid: session,
    new_viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    new_connectiontype: nav.connection?.effectiveType ?? '',
    new_visibilitystate: document.visibilityState,
    new_payloadjson: JSON.stringify(batch),
  })
  fetch(`${runtime.clientUrl}/api/data/v9.2/${ERROR_LOG_ENTITY_SET}`, {
    method: 'POST',
    credentials: 'include',
    keepalive: body.length < 60_000,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
    body,
  }).catch(() => undefined)
}

function observe(type: string, onEntries: (entries: PerformanceEntry[]) => void, extra: { durationThreshold?: number } = {}) {
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return
    new PerformanceObserver((list) => onEntries(list.getEntries())).observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
  } catch { /* navegador sem suporte: segue sem essa métrica */ }
}

type LayoutShift = PerformanceEntry & { value: number; hadRecentInput: boolean }
type EventTiming = PerformanceEntry & { interactionId?: number }

let installed = false

/** Liga a medição na sessão sorteada (no `pnpm dev`, sempre, só no console). Idempotente. */
export function instalarMedicaoDesempenho() {
  if (installed || !(isLocalHost() || isSampled())) return
  installed = true

  const collector = createPerfCollector()
  const session = crypto.randomUUID()
  // Abertura do app conta como a primeira tela, desde o início da navegação.
  let screen = currentScreen()
  collector.route(screen, 0)
  // Só troca de tela conta; mudar só a query do hash (aba, filtro) não.
  const onRoute = () => {
    if (currentScreen() === screen) return
    screen = currentScreen()
    collector.route(screen, performance.now())
    // rAF + setTimeout: roda logo depois do quadro pintado com a tela nova.
    requestAnimationFrame(() => setTimeout(() => collector.paint(performance.now()), 0))
  }
  window.addEventListener('hashchange', onRoute)

  observe('resource', (entries) => entries.forEach((e) => collector.resource(e as PerformanceResourceTiming)))
  observe('paint', (entries) => entries.forEach((e) => { if (e.name === 'first-contentful-paint') collector.paint(e.startTime) }))
  observe('largest-contentful-paint', (entries) => { const last = entries.at(-1); if (last) collector.vital('lcp', last.startTime) })
  let inp = 0
  observe('event', (entries) => {
    for (const e of entries as EventTiming[]) if (e.interactionId && e.duration > inp) collector.vital('inp', (inp = e.duration))
  }, { durationThreshold: 40 })
  // CLS: maior janela de deslocamentos (até 5 s, intervalos menores que 1 s), como no Web Vitals.
  let cls = 0, windowValue = 0, windowStart = 0, windowLast = 0
  observe('layout-shift', (entries) => {
    for (const e of entries as LayoutShift[]) {
      if (e.hadRecentInput) continue
      if (windowValue && (e.startTime - windowLast > 1000 || e.startTime - windowStart > 5000)) windowValue = 0
      if (!windowValue) windowStart = e.startTime
      windowValue += e.value
      windowLast = e.startTime
      if (windowValue > cls) collector.vital('cls', (cls = windowValue))
    }
  })

  const flush = (final: boolean) => {
    const batch = collector.take(performance.now(), final)
    if (batch) send(batch, session)
  }
  setInterval(() => flush(false), FLUSH_MS)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true) })
}
