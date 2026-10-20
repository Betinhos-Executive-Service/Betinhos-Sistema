import type { FetchFailure } from '@betinhos/dataverse'
import { formatBuild } from '@betinhos/ui'
import { installErrorLogger, logDataverseFailure } from '@betinhos/ui/error-logger'

// Logger compartilhado do Design System: erros de front vão para new_appmotoristaslog (usuário, tela, versão, mensagem).
// Fora do Dataverse (pnpm dev, modo mock) não grava nada.
export function instalarLogDeErros() {
  installErrorLogger({
    appName: 'Sistema Betinhos',
    appVersion: `v${__APP_VERSION__}`,
    builtAt: formatBuild(__APP_VERSION__, __BUILD_DATE__).split(' · ')[1],
    getScreen: () => location.hash.replace(/^#\/?/, '') || 'inicio',
  })
}

/** Falha final de chamada à Web API; ignora a própria tabela de log para não registrar em laço. */
export function logFalhaDataverse(failure: FetchFailure) {
  if (/new_appmotoristaslogs/i.test(failure.path)) return
  void logDataverseFailure(failure)
}
