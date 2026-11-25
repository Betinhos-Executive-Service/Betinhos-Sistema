import { useCallback, useEffect, useRef, useState } from "react";
import { BT, DEBUG, INTERVALO_MS } from "../bt";
import type { Dados } from "../tipos";

// Estado da viagem: /dados por polling (15 s) e, quando o Worker oferece, WebSocket /ao-vivo. Chegou dado pelo WebSocket, o polling para;
// caiu (ou nunca abriu), o polling volta e a reconexão espera 5 s, 15 s, 60 s e depois a cada 2 min.
const WS_ESPERAS = [5000, 15000, 60000, 120000], WS_ABRIR_MS = 5000, WS_MUDO_MS = 45000, OCULTA_MS = 60000;

export interface Viagem {
  dados: Dados | null;
  ocupado: boolean;
  falhandoDesde: number;
  semResposta: boolean; // falhou e ainda não há dado nenhum
  desvio: number; // servidor - aparelho, em ms
  retomada: number; // sobe a cada volta do segundo plano: o carro salta em vez de animar posições perdidas
}

export function useViagem(): Viagem {
  const [dados, setDados] = useState<Dados | null>(null);
  const [ocupado, setOcupado] = useState(true);
  const [falhandoDesde, setFalhando] = useState(0);
  const [semResposta, setSemResposta] = useState(false);
  const [desvio, setDesvio] = useState(0);
  const [retomada, setRetomada] = useState(0);
  const dadosRef = useRef<Dados | null>(null);

  const fonteFora = useCallback(() => {
    if (!dadosRef.current) return;
    dadosRef.current = { ...dadosRef.current, fonteIndisponivel: true };
    setDados(dadosRef.current);
  }, []);

  useEffect(() => {
    let parado = false, timer: ReturnType<typeof setInterval> | null = null, ws: WebSocket | null = null, tentativas = 0;
    let reconectar: ReturnType<typeof setTimeout> | null = null, fecharOculta: ReturnType<typeof setTimeout> | undefined;
    let falhando = 0;

    function fecharAoVivo() {
      if (reconectar) clearTimeout(reconectar);
      reconectar = null;
      if (ws) { const w = ws; ws = null; try { w.close(); } catch { /* já fechado */ } }
    }
    function encerrar() { parado = true; if (timer) clearInterval(timer); timer = null; fecharAoVivo(); }

    function aplicar(d: Dados) {
      if (!d || parado) return;
      // Worker publicado com versão nova: recarrega uma vez por versão (no deploy, isolates velhos ainda servem a página antiga).
      if (d.versao && BT.versao && d.versao !== BT.versao) {
        const chave = "recarregou:" + d.versao;
        let ja: string | null = null;
        try { ja = sessionStorage.getItem(chave); sessionStorage.setItem(chave, "1"); } catch { /* sem storage: recarrega mesmo assim */ }
        if (!ja) { location.reload(); return; }
      }
      falhando = 0; setFalhando(0); setSemResposta(false);
      if (d.servidorEm) setDesvio(new Date(d.servidorEm).getTime() - Date.now());
      dadosRef.current = d; setDados(d);
      if (d.fase === "concluido") encerrar();
    }

    function atualizar() {
      if (parado) return;
      setOcupado(true);
      fetch(location.pathname + "/dados" + (DEBUG ? "?debug=1" : ""), { cache: "no-store" }).then((r) => {
        if (r.status === 404) { location.reload(); return null; }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }).then((d) => { if (d) aplicar(d); }).catch(() => {
        // Falha de rede ou do Worker: mantém tudo na tela e avisa discretamente; o relógio mostra a idade da posição.
        if (!falhando) { falhando = Date.now(); setFalhando(falhando); }
        if (!dadosRef.current) setSemResposta(true);
      }).then(() => setOcupado(false));
    }
    function iniciarPolling() { if (!timer && !parado) timer = setInterval(() => { if (!document.hidden) atualizar(); }, INTERVALO_MS); }

    function conectarAoVivo() {
      if (reconectar) clearTimeout(reconectar);
      reconectar = null;
      if (!BT.cfg.aoVivo || parado || ws || !window.WebSocket || document.hidden) return;
      let s: WebSocket, abriu = false, ultima = 0, vigia: ReturnType<typeof setInterval> | undefined;
      try { s = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + location.pathname + "/ao-vivo" + (DEBUG ? "?debug=1" : "")); } catch { return; }
      ws = s;
      const limite = setTimeout(() => { if (!abriu) s.close(); }, WS_ABRIR_MS);
      s.onopen = () => {
        abriu = true; ultima = Date.now(); tentativas = 0; clearTimeout(limite);
        vigia = setInterval(() => { if (Date.now() - ultima > WS_MUDO_MS) s.close(); }, 15000);
      };
      s.onmessage = (ev) => {
        ultima = Date.now();
        let m: any = null;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m && m.tipo === "fim") { location.reload(); return; }
        // Só um WebSocket que já entregou dados substitui o polling (um que abre e cai logo não o deixa parado).
        if (m && m.tipo === "dados") { if (timer) clearInterval(timer); timer = null; aplicar(m); }
        // Rastreador fora e o Viagem sem leitura de reserva: mantém a tela e mostra o aviso discreto, como no polling.
        if (m && m.tipo === "fonte_fora") fonteFora();
      };
      s.onclose = () => {
        clearTimeout(limite); clearInterval(vigia);
        if (ws === s) ws = null;
        iniciarPolling();
        if (parado || document.hidden || reconectar) return;
        reconectar = setTimeout(conectarAoVivo, WS_ESPERAS[Math.min(tentativas++, WS_ESPERAS.length - 1)]);
      };
    }

    // Aba oculta por mais de 60 s fecha o WebSocket (o Viagem volta ao ritmo lento). Ao voltar, as posições perdidas
    // não são animadas: o carro salta, o estado é reconciliado e o WebSocket reconecta.
    function visibilidade() {
      clearTimeout(fecharOculta);
      if (document.hidden) { fecharOculta = setTimeout(() => { if (document.hidden) fecharAoVivo(); }, OCULTA_MS); return; }
      setRetomada((n) => n + 1); atualizar(); conectarAoVivo();
    }
    document.addEventListener("visibilitychange", visibilidade);
    atualizar(); iniciarPolling(); conectarAoVivo();
    return () => {
      document.removeEventListener("visibilitychange", visibilidade);
      clearTimeout(fecharOculta); encerrar();
    };
  }, [fonteFora]);

  return { dados, ocupado, falhandoDesde, semResposta, desvio, retomada };
}
