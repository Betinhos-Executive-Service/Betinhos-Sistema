// Modo preview (?preview=1): o App dentro de um iframe da tela de Configuração, só com dados de exemplo.
// Não registra service worker nem push, não grava no Dataverse nem na fila offline e não lê a configuração real.
const HOSTS_LOCAIS = ["localhost", "127.0.0.1", "::1"];

export function isPreviewSearch(search: string) {
  return new URLSearchParams(search).get("preview") === "1";
}

let previewCache: boolean | null = null;

export function isPreviewMode() {
  if (typeof window === "undefined") return false;
  previewCache ??= isPreviewSearch(window.location?.search ?? "");
  return previewCache;
}

export function isLocalHostname(hostname: string) {
  return HOSTS_LOCAIS.includes(hostname);
}

/** Dados de exemplo no lugar do Dataverse: localhost (dev) ou preview em qualquer host. */
export function isMockRuntime() {
  if (typeof window === "undefined") return false;
  return isLocalHostname(window.location?.hostname ?? "") || isPreviewMode();
}

/** Quem pode mandar mensagens ao preview: a mesma origem; em localhost, também outra porta de localhost/127.0.0.1. */
export function isPreviewOriginAllowed(origin: string, ownOrigin: string) {
  if (origin === ownOrigin) return true;
  try {
    const own = new URL(ownOrigin);
    const other = new URL(origin);
    return isLocalHostname(own.hostname) && (other.hostname === "localhost" || other.hostname === "127.0.0.1") && other.protocol === own.protocol;
  } catch {
    return false;
  }
}
