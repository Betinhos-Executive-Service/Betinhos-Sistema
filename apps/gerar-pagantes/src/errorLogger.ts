// Wrapper fino sobre o logger compartilhado (@betinhos-executive-service/ui 1.11.0, subpath error-logger).
// O pacote grava em new_appmotoristaslog com usuário, e-mail, versão e tela; aqui ficam só os padrões desta tela.
import { formatBuild } from '@betinhos-executive-service/ui'
import {
  installErrorLogger,
  logAppError as logSharedAppError,
  type ErrorLogDetails
} from '@betinhos-executive-service/ui/error-logger'

export const appName = 'Tela Gerar Pagantes'
export const appScreen = 'Gerar Pagantes'

export type ErrorLogContext = ErrorLogDetails

/** Registra o erro na tabela de logs. Nunca rejeita; em modo mock não grava nada. */
export async function logAppError(error: unknown, context: ErrorLogContext = {}): Promise<void> {
  await logSharedAppError(error, { source: 'Web Resource', ...context })
}

/** Instala os listeners globais (window.error, unhandledrejection, falha de recurso) com a versão de build exibida no BuildBadge. */
export function installGlobalErrorLogging(): () => void {
  return installErrorLogger({
    appName,
    appVersion: `v${__APP_VERSION__}`,
    builtAt: formatBuild(__APP_VERSION__, __APP_BUILD_ISO__).split(' · ')[1] || __APP_DATE__,
    getScreen: () => appScreen
  })
}
