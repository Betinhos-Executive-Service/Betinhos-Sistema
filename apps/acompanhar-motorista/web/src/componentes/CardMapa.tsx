import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BT, DEBUG, reduzMovimento } from "../bt";
import { useIdioma } from "../i18n";
import { Ampliar, Centro, Fechar } from "../icones";
import { MapaViagem } from "../mapa/MapaViagem";
import type { Vivo } from "../status";
import type { Dados } from "../tipos";

const EASE = [0.23, 1, 0.32, 1] as const;
const desktop = () => matchMedia("(min-width: 900px)").matches;

interface Props {
  dados: Dados | null;
  retomada: number;
  vivo: Vivo;
  oculto?: boolean;
  aoMostrarCard: () => void;
  aoMapaPronto: (pronto: boolean) => void;
  aoDiagnostico: (texto: string) => void;
}

// Mapa único: a miniatura e a tela cheia são o mesmo MapLibre (resize), e a morfose card -> tela cheia é um layout animation do motion.
export function CardMapa({ dados, retomada, vivo, aoMostrarCard, aoMapaPronto, aoDiagnostico }: Props) {
  const { t } = useIdioma();
  const caixa = useRef<HTMLDivElement>(null);
  const alvo = useRef<HTMLDivElement>(null);
  const cartao = useRef<HTMLElement>(null);
  const reduzir = useRef<HTMLButtonElement>(null);
  const centrarRef = useRef<HTMLButtonElement>(null);
  const ctrl = useRef<MapaViagem | null>(null);
  const dadosRef = useRef(dados);
  dadosRef.current = dados;
  const cb = useRef({ aoMostrarCard, aoDiagnostico });
  cb.current = { aoMostrarCard, aoDiagnostico };
  const textos = useRef({ t });
  textos.current = { t };
  const [seguindo, setSeguindo] = useState(true);
  const [ampliado, setAmpliado] = useState(false);
  const memoria = useRef<{ rolagem: number; foco: Element | null }>({ rolagem: 0, foco: null });
  const pulsos = useRef({ de: dados, n: 0 });
  if (pulsos.current.de !== dados) { pulsos.current.de = dados; pulsos.current.n++; }

  // Cria o mapa (biblioteca em chunk separado) uma vez; dados que chegaram antes entram quando ele fica pronto.
  useEffect(() => {
    let vivoEfeito = true;
    MapaViagem.criar({
      container: alvo.current!, caixa: caixa.current!, tomtom: BT.cfg.tomtom, desktop: desktop(), debug: DEBUG, reduzMovimento: reduzMovimento(),
      corRota: getComputedStyle(document.documentElement).getPropertyValue("--bt-color-action").trim(),
      rotuloVeiculo: textos.current.t("veiculo"), rotuloEtapa: (n) => textos.current.t("etapa", { n }),
      aoMexer: () => setSeguindo(false), aoSeguir: setSeguindo,
      aoMostrarCard: () => cb.current.aoMostrarCard(), aoDiagnostico: (x) => cb.current.aoDiagnostico(x),
    }, dadosRef.current).then((m) => {
      if (!vivoEfeito) { m.destruir(); return; }
      ctrl.current = m;
      // Os dados que chegaram enquanto a biblioteca baixava (o efeito de [dados] ainda não tinha mapa) entram agora.
      if (dadosRef.current) m.atualizar(dadosRef.current);
      aoMapaPronto(true);
    }).catch(() => { /* sem biblioteca: o painel segue funcionando e o card final aparece pelo plano B */ });
    return () => { vivoEfeito = false; ctrl.current?.destruir(); ctrl.current = null; aoMapaPronto(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (dados) ctrl.current?.atualizar(dados); }, [dados]);
  useEffect(() => { if (retomada) ctrl.current?.marcarSalto(); }, [retomada]);
  useEffect(() => { ctrl.current?.traduzir(t("veiculo"), (n) => t("etapa", { n })); }, [t]);

  const ampliar = useCallback((sim: boolean) => {
    // A entrada em cascata usa transform no card do mapa, o que prenderia o position:fixed da tela cheia ao card.
    cartao.current?.getAnimations().forEach((a) => a.finish());
    setAmpliado((atual) => {
      if (atual === sim) return atual;
      if (sim) memoria.current = { rolagem: window.scrollY, foco: document.activeElement };
      return sim;
    });
  }, []);

  // Efeitos do estado ampliado: trava a rolagem, leva o foco ao botão de fechar e devolve rolagem e foco ao reduzir.
  const primeira = useRef(true);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("sem-rolagem", ampliado);
    if (primeira.current) { primeira.current = false; return; }
    if (ampliado) reduzir.current?.focus();
    else {
      window.scrollTo(0, memoria.current.rolagem);
      (memoria.current.foco as HTMLElement | null)?.focus?.({ preventScroll: true });
    }
    ctrl.current?.redimensionar();
    requestAnimationFrame(() => ctrl.current?.redimensionar());
  }, [ampliado]);
  useEffect(() => () => document.documentElement.classList.remove("sem-rolagem"), []);

  useEffect(() => {
    if (!ampliado) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { ampliar(false); return; }
      if (e.key !== "Tab") return;
      const itens = [reduzir.current!]; if (seguindo === false) itens.push(centrarRef.current!);
      const i = itens.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      itens[(i + (e.shiftKey ? itens.length - 1 : 1)) % itens.length].focus();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [ampliado, seguindo, ampliar]);

  const raio = ampliado ? (desktop() ? 14 : 0) : 10;
  const transicao = reduzMovimento() ? { duration: 0 } : { duration: ampliado ? 0.35 : 0.25, ease: EASE };
  const dialogo = ampliado ? { role: "dialog", "aria-modal": true, "aria-label": t("mapa") } : {};
  return (
    <section className="card c-mapa" id="c-mapa" aria-labelledby="mapa-titulo" ref={cartao}>
      <h2 id="mapa-titulo">{t("card.mapa")}</h2>
      <div className="mapa-moldura">
        <motion.div layout className={"mapa-caixa" + (ampliado ? " ampliado" : "")} id="mapa-caixa" ref={caixa} style={{ borderRadius: raio }} transition={transicao}
          onLayoutAnimationComplete={() => ctrl.current?.redimensionar()} {...dialogo}>
          <div id="mapa" ref={alvo} role="region" aria-label={t("mapa")} />
          <button type="button" ref={centrarRef} className="qd btn-centro" id="centrar" aria-label={t("centrar")} data-oculto={seguindo ? "1" : "0"}
            onClick={() => { ctrl.current?.centrar(); setSeguindo(true); }}><Centro /></button>
          <button type="button" className="btn btn-secundario mapa-btn" id="ampliar" hidden={ampliado} onClick={() => ampliar(true)}><Ampliar /><span>{t("mapa.ampliar")}</span></button>
          <button type="button" ref={reduzir} className="btn btn-primario mapa-btn" id="reduzir" aria-label={t("mapa.fechar")} hidden={!ampliado} onClick={() => ampliar(false)}><Fechar /></button>
        </motion.div>
      </div>
      <AnimatePresence>
        {ampliado ? <motion.div key="fundo" className="mapa-fundo" id="mapa-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={reduzMovimento() ? { duration: 0 } : { duration: ampliado ? 0.35 : 0.25, ease: EASE }} onClick={() => ampliar(false)} /> : null}
      </AnimatePresence>
      <p key={pulsos.current.n} className={"vivo pulso" + (vivo.velha ? " velha" : "")} id="vivo" hidden={vivo.oculto}>
        <span id="atualizado">{vivo.texto}</span>
        <span className={"conexao" + (vivo.conexao === "off" ? " off" : "")} id="conexao" role="status" hidden={vivo.conexao === ""}>
          {vivo.conexao === "off" ? t("conexao.off") : vivo.conexao === "rastreador" ? t("conexao.rastreador") : vivo.conexao === "reconectando" ? t("conexao.reconectando") : ""}
        </span>
      </p>
    </section>
  );
}
