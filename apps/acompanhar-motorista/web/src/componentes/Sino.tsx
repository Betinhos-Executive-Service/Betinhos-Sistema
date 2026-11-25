import { useEffect, useRef, useState } from "react";
import { useIdioma } from "../i18n";
import { Sino as IconeSino } from "../icones";
import { useToast } from "./Toast";

function chaveVapid(b64: string) {
  let s = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const enviar = (metodo: string, corpo: unknown) => fetch(location.pathname + "/avisos", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

// Aviso por notificação (Web Push). O botão só aparece quando o navegador suporta (ou, no iPhone fora da tela de início, para explicar como instalar).
// `emDefinicao`: sem motorista ainda, o mesmo toque liga o aviso "Seu motorista é X" e os de chegada.
export function Sino({ vapid, nomeMotorista, emDefinicao = false, abrirTela }: { vapid: string; nomeMotorista?: string; emDefinicao?: boolean; abrirTela: (q: "negado" | "iphone") => void }) {
  const { t, id } = useIdioma();
  const toast = useToast();
  const [visivel, setVisivel] = useState(false);
  const [inscrita, setInscrita] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [iphoneSemApp, setIphoneSemApp] = useState(false);
  const reg = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let vivo = true;
    const iphone = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      if (iphone && (navigator as any).standalone !== true) { setIphoneSemApp(true); setVisivel(true); }
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: location.pathname })
      .then((r) => { reg.current = r; return r.pushManager.getSubscription(); })
      .then((sub) => { if (vivo) { setInscrita(!!sub); setVisivel(true); } })
      .catch(() => { if (vivo) setVisivel(false); });
    return () => { vivo = false; };
  }, []);

  async function inscrever() {
    // requestPermission direto no toque: o Safari só pergunta dentro do gesto do usuário.
    const p = await Notification.requestPermission();
    if (p === "denied") throw new Error("negado");
    if (p !== "granted") return; // pergunta dispensada: fica como estava
    const sub = await reg.current!.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid(vapid) });
    const j = sub.toJSON();
    const r = await enviar("POST", { endpoint: j.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, idioma: id });
    if (!r.ok) { sub.unsubscribe(); throw new Error(String(r.status)); }
    setInscrita(true);
    toast(emDefinicao ? t("sino.ligadoEmDefinicao") : nomeMotorista ? t("sino.ligado", { motorista: nomeMotorista.split(" ")[0] }) : t("sino.ligadoSemNome"));
  }
  async function cancelar() {
    const sub = await reg.current!.pushManager.getSubscription();
    // Mesmo com o Worker fora, o aparelho deixa de receber: o Viagem remove a inscrição no primeiro 410.
    if (sub) { await enviar("DELETE", { endpoint: sub.endpoint }).catch(() => null); await sub.unsubscribe(); }
    setInscrita(false);
    toast(t("sino.desligado"));
  }
  async function clique() {
    if (iphoneSemApp) { abrirTela("iphone"); return; }
    if (!reg.current) return;
    if (!inscrita && Notification.permission === "denied") { abrirTela("negado"); return; }
    setOcupado(true); // desabilitado, novos toques não disparam até terminar
    try { await (inscrita ? cancelar() : inscrever()); }
    catch (e) { if (e instanceof Error && e.message === "negado") abrirTela("negado"); else toast(t("sino.erro")); }
    setOcupado(false);
  }
  return (
    <div className="sino" id="sino-area" hidden={!visivel}>
      <button type="button" className="btn btn-secundario" id="sino" aria-pressed={inscrita} disabled={ocupado} onClick={clique}>
        <IconeSino /><span id="sino-txt">{t(inscrita ? "sino.ativo" : emDefinicao ? "sino.ativarEmDefinicao" : "sino.ativar")}</span>
      </button>
    </div>
  );
}
