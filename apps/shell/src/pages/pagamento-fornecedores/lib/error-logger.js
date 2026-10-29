// Wrapper fino do logger compartilhado (@betinhos-executive-service/ui 1.11.0, subpath error-logger).
// Grava em new_appmotoristaslogs. Mantém o que o pacote não cobre nesta tela:
// - window sem addEventListener (testes/ambientes parciais): não instala listeners;
// - modo "direct" (web resource aberto em /WebResources/ sem Xrm): expõe GetGlobalContext com o clientUrl;
// - errorCode vindo de error.status (falhas HTTP do DataverseClient);
// - fila antiga (betinhos-pagamentos-error-log-queue-v1) migrada para a fila do pacote.
import {
  installErrorLogger,
  logAppError,
  logDataverseFailure,
  setErrorLogContext,
} from "@betinhos/ui/error-logger";
import { APP_VERSION_LABEL } from "../build-info.js";

export const ERROR_LOG_APP_NAME = "Tela Pagamento de Fornecedores";
const ERROR_LOG_SOURCE = "tela-pagamento-fornecedores";
const LEGACY_QUEUE_KEY = "betinhos-pagamentos-error-log-queue-v1";
const PACKAGE_QUEUE_KEY = `betinhos-error-log-queue-v1:${ERROR_LOG_APP_NAME}`;

const [appVersion = APP_VERSION_LABEL, builtAt = ""] =
  APP_VERSION_LABEL.split(" ");

export const migrateLegacyErrorQueue = () => {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) || "[]");
    if (Array.isArray(legacy) && legacy.length) {
      const current = JSON.parse(localStorage.getItem(PACKAGE_QUEUE_KEY) || "[]");
      localStorage.setItem(
        PACKAGE_QUEUE_KEY,
        JSON.stringify([...(Array.isArray(current) ? current : []), ...legacy].slice(-50)),
      );
    }
    localStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch {
    // Falha de log nunca pode interromper a operação principal.
  }
};

export function installPaymentErrorLogger({ clientUrl = "", contextSource = "none" } = {}) {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function")
    return () => undefined;
  if (contextSource === "direct" && clientUrl && typeof window.GetGlobalContext !== "function")
    window.GetGlobalContext = () => ({ getClientUrl: () => clientUrl });
  migrateLegacyErrorQueue();
  return installErrorLogger({ appName: ERROR_LOG_APP_NAME, appVersion, builtAt });
}

export function logError(error, context = {}) {
  return logAppError(error, {
    source: ERROR_LOG_SOURCE,
    action: context.action,
    phase: context.phase,
    component: context.component || "DataverseClient",
    errorCode: error?.status ?? error?.code,
    detailId: context.detailId,
    detailType: context.detailType,
    payload: context.payload,
  });
}

export { logDataverseFailure, setErrorLogContext };
