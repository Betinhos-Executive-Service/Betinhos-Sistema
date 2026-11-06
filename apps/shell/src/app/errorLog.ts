import type { FetchFailure } from '@betinhos/dataverse'
import { formatBuild } from '@betinhos/ui'
import { installErrorLogger, logDataverseFailure } from '@betinhos/ui/error-logger'

/** Parâmetros do hash que carregam o que a pessoa digitou ou filtrou (busca `q`, filtros `f`): nunca vão para o log. */
const PARAMS_PRIVADOS = new Set(['q', 'f'])

/** Rota do hash sem busca nem filtros (`#/geral?view=x&q=nome&f=abc` vira `geral?view=x`); o resto da query fica como está. */
export function telaDoHash(hash: string) {
  const caminho = hash.replace(/^#\/?/, '')
  const corte = caminho.indexOf('?')
  const rota = corte < 0 ? caminho : caminho.slice(0, corte)
  const query = corte < 0 ? '' : caminho.slice(corte + 1)
  const mantidos = query.split('&').filter((par) => par && !PARAMS_PRIVADOS.has(par.split('=')[0]!))
  return (mantidos.length ? `${rota}?${mantidos.join('&')}` : rota) || 'inicio'
}

// Logger compartilhado do Design System: erros de front vão para new_appmotoristaslog (usuário, tela, versão, mensagem).
// Fora do Dataverse (pnpm dev, modo mock) não grava nada.
export function instalarLogDeErros() {
  installErrorLogger({
    appName: 'Sistema Betinhos',
    appVersion: `v${__APP_VERSION__}`,
    builtAt: formatBuild(__APP_VERSION__, __BUILD_DATE__).split(' · ')[1],
    getScreen: () => telaDoHash(location.hash),
  })
}

/**
 * Com a aba oculta ou a página saindo, o navegador cancela as chamadas em voo como `TypeError` ("Failed to fetch"/"Load failed"),
 * não como `AbortError`. Nos logs do PROD de 04–05/11/2026 as 36 falhas de rede estavam com `visibilityState = hidden` e `isOffline = false`.
 */
let paginaSaindo = false
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { paginaSaindo = true })
  window.addEventListener('pageshow', () => { paginaSaindo = false })
}
const semAtencao = () => paginaSaindo || document.visibilityState === 'hidden'

/**
 * Falha final de chamada à Web API; ignora a própria tabela de log (dados e metadata) para não registrar em laço
 * e a falha de rede (sem status) de página oculta ou saindo, que é cancelamento do navegador. Erro HTTP sempre é registrado.
 */
export function logFalhaDataverse(failure: FetchFailure) {
  if (/new_appmotoristaslog/i.test(failure.path)) return
  if (failure.status === undefined && semAtencao()) return
  void logDataverseFailure(failure)
}
