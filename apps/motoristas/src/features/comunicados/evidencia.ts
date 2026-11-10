import { getBuildInfo } from "../../shared/buildStamp.ts";
import { IP_STAMP_URL } from "../../lib/webPush.ts";

// Evidência do aparelho (JSON sempre < 4.000 caracteres: cada campo é truncado) enviada em new_EvidenciaJson ao abrir o comunicado e ao registrar a ciência.
// Contrato: docs do Sistema Betinhos, 2026-11-10-comunicados-evidencia-aparelho-design.md. Nunca lança erro:
// o que falhar vira null ou um estado do GPS, e a ação do motorista segue.
export const EVIDENCIA_ESPERA_TOTAL_MS = 8000;
export const EVIDENCIA_CARIMBO_MS = 3000;
export const EVIDENCIA_GPS_MS = 8000;
const EVIDENCIA_MODELO_MS = 1000;
const USER_AGENT_MAX = 400;
const CAMPO_MAX = 100;

export type IpStamp = { ip: string; ts: string; sig: string };
export type GeoEvidencia =
  | { status: "ok"; lat: number; lon: number; accuracy: number; ts: string }
  | { status: "negada" | "indisponivel" | "tempo-esgotado" };

export type Evidencia = {
  v: 1;
  appVersion: string;
  userAgent: string;
  platform: string;
  model: string;
  ipStamp: IpStamp | null;
  geo: GeoEvidencia;
};

type UserAgentDataLike = { platform?: string; getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> };
type NavigatorLike = { userAgent?: string; userAgentData?: UserAgentDataLike; geolocation?: Pick<Geolocation, "getCurrentPosition"> };

export type EvidenciaDeps = {
  navigator?: NavigatorLike;
  fetchImpl?: typeof fetch;
  stampUrl?: string;
  appVersion?: string;
  now?: () => Date;
};

function withTimeout<T>(task: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    task.then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

async function carimbarIp(fetchImpl: typeof fetch, url: string): Promise<IpStamp | null> {
  const controller = new AbortController();
  const request = (async () => {
    const response = await fetchImpl(url, { method: "POST", signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<IpStamp>;
    return body.ip && body.ts && body.sig ? { ip: text(body.ip, CAMPO_MAX), ts: text(body.ts, CAMPO_MAX), sig: text(body.sig, CAMPO_MAX) } : null;
  })();
  const stamp = await withTimeout(request, EVIDENCIA_CARIMBO_MS, null);
  if (!stamp) controller.abort();
  return stamp;
}

function lerGps(nav: NavigatorLike, now: () => Date): Promise<GeoEvidencia> {
  const geolocation = nav.geolocation;
  if (!geolocation) return Promise.resolve({ status: "indisponivel" });
  const request = new Promise<GeoEvidencia>((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (position) => resolve({ status: "ok", lat: position.coords.latitude, lon: position.coords.longitude, accuracy: Math.round(position.coords.accuracy), ts: now().toISOString() }),
        (error) => resolve({ status: error.code === 1 ? "negada" : error.code === 3 ? "tempo-esgotado" : "indisponivel" }),
        { enableHighAccuracy: true, timeout: EVIDENCIA_GPS_MS, maximumAge: 60000 }
      );
    } catch { resolve({ status: "indisponivel" }); }
  });
  // O timeout do navegador só conta depois da permissão; o limite abaixo vale desde o pedido.
  return withTimeout(request, EVIDENCIA_GPS_MS, { status: "tempo-esgotado" });
}

async function lerModelo(data: UserAgentDataLike | undefined) {
  if (!data?.getHighEntropyValues) return "";
  return withTimeout(data.getHighEntropyValues(["model"]).then((values) => text(values.model, CAMPO_MAX)), EVIDENCIA_MODELO_MS, "");
}

/** Monta o new_EvidenciaJson. Espera no máximo 8 s e devolve "" se algo inesperado acontecer (o parâmetro é opcional). */
export async function montarEvidencia(deps: EvidenciaDeps = {}): Promise<string> {
  try {
    const nav: NavigatorLike = deps.navigator ?? (typeof navigator === "undefined" ? {} : navigator);
    const fetchImpl = deps.fetchImpl ?? (typeof fetch === "undefined" ? undefined : fetch.bind(globalThis));
    const now = deps.now ?? (() => new Date());
    const [ipStamp, geo, model] = await withTimeout(
      Promise.all([
        fetchImpl ? carimbarIp(fetchImpl, deps.stampUrl ?? IP_STAMP_URL) : Promise.resolve(null),
        lerGps(nav, now),
        lerModelo(nav.userAgentData)
      ]),
      EVIDENCIA_ESPERA_TOTAL_MS,
      [null, { status: "tempo-esgotado" }, ""] as [IpStamp | null, GeoEvidencia, string]
    );
    return JSON.stringify({
      v: 1,
      appVersion: text(deps.appVersion ?? getBuildInfo().version, CAMPO_MAX).replace(/^v/i, ""),
      userAgent: text(nav.userAgent, USER_AGENT_MAX),
      platform: text(nav.userAgentData?.platform, CAMPO_MAX),
      model,
      ipStamp,
      geo
    });
  } catch {
    return "";
  }
}
