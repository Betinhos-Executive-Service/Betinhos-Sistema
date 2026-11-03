// Web Push do PWA: decide se o botão "Ativar notificações" aparece, inscreve o aparelho e grava a
// inscrição no Dataverse. Fica desligado enquanto WEB_PUSH_PUBLIC_KEY estiver vazia (chave VAPID
// pública entregue pela fatia do emissor; ver docs/plano-web-push-pwa.md).
import { isPwaContext, PWA_SW_NAME } from "./pwaManifest.ts";

export const WEB_PUSH_PUBLIC_KEY = "";
// Provisório até a fatia de schema: conferir na metadata antes de ligar a chave. createOne (Xrm.WebApi.createRecord)
// recebe o nome lógico (singular), não o entity set; sem entrada em ENTITY_SET_TO_ENTITY_NAME o nome passa direto.
export const PUSH_SUBSCRIPTION_TABLE = "new_inscricaopushmotorista";
const DRIVER_MARK_KEY = "app-motoristas:web-push-driver";

function readMark() {
  try { return globalThis.localStorage?.getItem(DRIVER_MARK_KEY) ?? ""; } catch { return ""; }
}

function writeMark(driverId: string) {
  try { globalThis.localStorage?.setItem(DRIVER_MARK_KEY, driverId); } catch { /* sem localStorage: o botão volta a aparecer */ }
}

export type WebPushState = "off" | "unsupported" | "needs-install" | "denied" | "ready" | "enabled";

export type WebPushEnv = {
  publicKey: string;
  pwaContext: boolean;
  hasApis: boolean;
  isIos: boolean;
  standalone: boolean;
  permission: "default" | "granted" | "denied";
  subscribed: boolean;
};

export function resolveWebPushState(env: WebPushEnv): WebPushState {
  if (!env.publicKey || !env.pwaContext) return "off";
  if (env.isIos && !env.standalone) return "needs-install";
  if (!env.hasApis) return "unsupported";
  if (env.permission === "denied") return "denied";
  return env.permission === "granted" && env.subscribed ? "enabled" : "ready";
}

export function urlBase64ToUint8Array(base64: string) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function toBase64Url(buffer: ArrayBuffer | null) {
  if (!buffer) return "";
  let binary = "";
  new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type SubscriptionLike = { endpoint: string; getKey: (name: "p256dh" | "auth") => ArrayBuffer | null };

export function buildSubscriptionRecord(driverId: string, subscription: SubscriptionLike, userAgent: string) {
  return {
    new_endpoint: subscription.endpoint,
    new_chavep256dh: toBase64Url(subscription.getKey("p256dh")),
    new_chaveauth: toBase64Url(subscription.getKey("auth")),
    new_aparelho: userAgent.slice(0, 200),
    "new_Funcionario@odata.bind": `/cr40f_funcionarioses(${driverId})`
  };
}

function isIosDevice() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

async function getRegistration() {
  const scope = `${window.location.origin}/WebResources/${PWA_SW_NAME}`;
  // Sem fallback para serviceWorker.ready: se o SW não registrou, ele nunca resolve e o botão ficaria travado.
  const reg = await navigator.serviceWorker.getRegistration(scope);
  if (!reg) throw new Error("Service worker do app não registrado.");
  return reg;
}

export async function getWebPushState(driverId?: string): Promise<WebPushState> {
  const pwaContext = isPwaContext();
  const hasApis = typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let subscribed = false;
  if (WEB_PUSH_PUBLIC_KEY && pwaContext && hasApis) {
    // Só vale como inscrito se este aparelho foi gravado para este motorista (troca de motorista no mesmo aparelho
    // ou gravação que falhou depois do subscribe deixam a inscrição sem registro).
    subscribed = readMark() === (driverId ?? "")
      && await getRegistration().then((reg) => reg.pushManager.getSubscription()).then(Boolean).catch(() => false);
  }
  return resolveWebPushState({
    publicKey: WEB_PUSH_PUBLIC_KEY,
    pwaContext,
    hasApis,
    isIos: pwaContext && isIosDevice(),
    standalone: window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    permission: hasApis ? (Notification.permission as WebPushEnv["permission"]) : "default",
    subscribed
  });
}

/** Pede a permissão, inscreve o aparelho e grava a inscrição. Deve ser chamada por um toque do usuário. */
export async function enableWebPush(driverId: string, save: (record: Record<string, unknown>) => Promise<unknown>) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const reg = await getRegistration();
  const subscription = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY) }));
  await save(buildSubscriptionRecord(driverId, subscription, navigator.userAgent));
  writeMark(driverId);
  return true;
}
