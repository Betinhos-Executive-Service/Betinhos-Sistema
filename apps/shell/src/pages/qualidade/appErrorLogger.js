// Wrapper fino sobre o logger compartilhado @betinhos/ui/error-logger, que o shell já instala
// (app/errorLog.ts: new_appmotoristaslog com usuário, tela e versão). Aqui fica só o que a tela antiga
// tinha a mais: não registrar duas vezes o mesmo erro (ex.: falha do Dataverse já registrada no request
// e relançada para o catch da tela) e a aba interna (dashboard, agenda...) na tela do log.
import { logAppError, logDataverseFailure } from "@betinhos/ui/error-logger";

const reportedErrors = new WeakSet();
// Só desta tela: o contexto global do logger é do shell (getScreen lê o hash).
let currentScreen = "";

function alreadyReported(error) {
  if (!error || typeof error !== "object") return false;
  if (reportedErrors.has(error)) return true;
  reportedErrors.add(error);
  return false;
}

export function reportAppError(error, context = {}) {
  if (alreadyReported(error)) return;
  void logAppError(error, { ...context, screen: `qualidade/${context.screen || currentScreen}` });
}

/** Falha final de chamada Dataverse (HTTP com erro ou rede). `error` é o que será relançado à tela. */
export function reportDataverseFailure(error, failure) {
  if (alreadyReported(error)) return;
  void logDataverseFailure(failure);
}

export function setErrorScreen(screen) {
  currentScreen = String(screen || "");
}
