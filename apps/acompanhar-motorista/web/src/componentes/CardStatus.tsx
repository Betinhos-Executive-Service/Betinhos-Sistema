import { useLayoutEffect, useRef, useState } from "react";
import { reduzMovimento } from "../bt";
import { hora, km } from "../formato";
import { useIdioma } from "../i18n";
import { Aviso, Carregando, Check, Pino, Relogio } from "../icones";
import { esperaMin, seloStatus, textoAvisoCarro, type Selo, type TipoSelo } from "../status";
import type { EtaMostrado } from "../hooks/useEta";
import type { Cfg, Dados } from "../tipos";
import { distanciaKm } from "../util";
import { Avaliacao } from "./Avaliacao";
import { Contato } from "./Contato";

const ORDEM = ["a_caminho", "no_local", "em_viagem", "concluido"];

function Icone({ tipo }: { tipo: TipoSelo }) {
  if (tipo === "info") return <i className="ao-vivo" aria-hidden="true" />;
  return tipo === "load" ? <Carregando /> : tipo === "ok" ? <Check /> : <Aviso />;
}

// Selo de status: ao trocar, o anterior sai (cópia que some) e o novo entra, tudo em CSS.
function SeloStatus({ selo }: { selo: Selo }) {
  const ref = useRef<HTMLSpanElement>(null);
  const antes = useRef<Selo | null>(null);
  const [fantasma, setFantasma] = useState<(Selo & { left: number; top: number }) | null>(null);
  const [entra, setEntra] = useState(false);
  useLayoutEffect(() => {
    const a = antes.current;
    antes.current = selo;
    if (!a || a.tipo === "load" || (a.tipo === selo.tipo && a.texto === selo.texto) || reduzMovimento()) return;
    const el = ref.current;
    if (!el) return;
    setFantasma({ ...a, left: el.offsetLeft, top: el.offsetTop });
    setEntra(true);
  }, [selo.tipo, selo.texto]);
  return (
    <>
      <span ref={ref} className={`badge b-${selo.tipo}${entra ? " badge-entra" : ""}`} id="status" onAnimationEnd={() => setEntra(false)}><Icone tipo={selo.tipo} /><span>{selo.texto}</span></span>
      {fantasma ? <span className={`badge b-${fantasma.tipo} badge-fantasma`} aria-hidden="true" style={{ left: fantasma.left, top: fantasma.top }} onAnimationEnd={() => setFantasma(null)}><Icone tipo={fantasma.tipo} /><span>{fantasma.texto}</span></span> : null}
    </>
  );
}

// Minutos do ETA: ao mudar, o número antigo sobe e some e o novo sobe de baixo (CSS; reinicia pela chave).
function NumeroEta({ texto, esqueleto }: { texto: string | null; esqueleto: boolean }) {
  const prev = useRef<string | null>(null);
  const [anim, setAnim] = useState<{ antes: string; n: number } | null>(null);
  useLayoutEffect(() => {
    const a = prev.current;
    prev.current = texto;
    if (a !== null && texto !== null && a !== texto && !reduzMovimento()) setAnim((x) => ({ antes: a, n: (x?.n ?? 0) + 1 }));
  }, [texto]);
  return (
    <span className={"rolo" + (anim ? " rola" : "")} data-antes={anim?.antes} key={anim?.n ?? 0}>
      <strong id="eta-min" className={esqueleto ? "esqueleto" : undefined}>{texto ?? "00"}</strong>
    </span>
  );
}

function textoAgendado(d: Dados, t: ReturnType<typeof useIdioma>["t"]) {
  const ms = Date.parse(d.horarioAgendado ?? "");
  if (isNaN(ms)) return "";
  const dia = new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const h = new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return t("agendado.texto", { dia, h });
}

interface Props { dados: Dados | null; cfg: Cfg; eta: EtaMostrado; idade: number; desvio: number; agora: number; titulo: string | null }

export function CardStatus({ dados: d, cfg, eta, idade, desvio, agora, titulo }: Props) {
  const { t, id, cor } = useIdioma();
  const carregou = d !== null;
  const concluido = d?.fase === "concluido";
  const simples = d?.modo === "simples", agendado = d?.fase === "agendado";
  const semPassos = simples || agendado;
  const fase = d?.fase ?? "a_caminho";
  const ordem = ORDEM.indexOf(fase);
  const selo: Selo = !d ? { tipo: "load", texto: t("status.localizando") } : seloStatus(d, t, idade);
  const noLocal = !!d && !concluido && d.fase === "no_local" && !!d.posicao;
  const e = eta.eta;
  const etaVisivel = carregou ? !!e && !concluido : cfg.completo;
  const m = d?.marcos ?? {};
  const resumo = concluido ? (() => {
    const saiu = m.saiuEmbarqueEm, fim = m.concluidoEm;
    const dist = d!.percorrido && d!.percorrido.length > 1 ? distanciaKm(d!.percorrido) : 0;
    return [
      ["saida", saiu ? hora(id, saiu) : ""],
      ["chegada", fim ? hora(id, fim) : ""],
      ["duracao", saiu && fim ? Math.max(1, Math.round((new Date(fim).getTime() - new Date(saiu).getTime()) / 60000)) + " min" : ""],
      ["distancia", dist >= 0.1 ? (dist < 10 ? dist.toFixed(1) : String(Math.round(dist))).replace(".", id === "en" ? "." : ",") + " km" : ""],
    ] as [string, string][];
  })() : [];
  const espera = noLocal ? esperaMin(d!, desvio, agora) : 0;
  const endereco = d?.posicao?.endereco ?? "";
  const textoEta = e ? (e.faixa ? e.faixa[0] + "–" + e.faixa[1] : String(e.minutos)) : null;
  const fimTxt = m.concluidoEm;
  return (
    <section className={"card painel c-status" + (noLocal ? " chegou" : "")} aria-live="polite" aria-busy={!carregou} id="painel">
      <h1 className="titulo sr" id="titulo">{titulo ?? t("h1")}</h1>
      <div className="linha" id="linha-status" hidden={concluido || semPassos}><SeloStatus selo={selo} /></div>
      <div className="aviso" id="aviso" role="status" hidden={!noLocal}>
        <Check />
        <div>
          <strong id="aviso-titulo">{noLocal ? t("aviso.chegou") : ""}</strong>
          <span id="aviso-texto">{noLocal ? textoAvisoCarro(d!, t, cor) : ""}</span>
          <em className="espera" id="aviso-espera" hidden={!(espera >= 1)}>{espera >= 1 ? t("aviso.espera", { n: espera }) : ""}</em>
        </div>
      </div>
      <div className="eta" id="eta" hidden={!etaVisivel}>
        <div className="eta-num">
          <span className="eta-rotulo" id="eta-rotulo">{t(e?.faixa ? "eta.cerca" : d?.fase === "em_viagem" ? "eta.destino" : "eta.chega")}</span>
          <span className="eta-val"><NumeroEta texto={etaVisivel ? textoEta : null} esqueleto={!carregou} /> <span className="eta-un">min</span></span>
        </div>
        <div className="eta-lado">
          <span className={"eta-sub" + (carregou ? "" : " esqueleto")} id="eta-sub">
            {e && eta.chegada ? t("eta.as", { h: hora(id, eta.chegada) }) + (typeof e.km === "number" ? " · " + km(id, e.km) : "") : "às 00:00 · 0,0 km"}
          </span>
          <span className="badge b-warn" id="eta-aviso" hidden={!e || e.transito}>{t("eta.semTransito")}</span>
        </div>
      </div>
      <ol className="passos" id="passos" aria-label={t("passos")} hidden={concluido || semPassos}>
        {ORDEM.map((p, i) => {
          const atual = i === ordem && fase !== "concluido";
          const classe = ["passo", i < ordem || (fase === "concluido" && i <= ordem) ? "feita" : "", atual ? "atual" : "", atual && d?.chegando ? "chegando" : ""].filter(Boolean).join(" ");
          return (
            <li key={p} className={classe} data-passo={p} aria-current={atual ? "step" : undefined}>
              <i /><span>{t(i === 0 && fase === "a_caminho" && d?.chegando ? "passo.chegando" : "passo." + p)}</span>
            </li>
          );
        })}
      </ol>
      <div className="concluido" id="concluido" role="status" hidden={!concluido}>
        <div className="c-topo">
          <div className="icone"><Check /></div>
          <div><h2>{t("concluido.titulo")}</h2><p id="concluido-txt">{fimTxt ? t("concluido.chegada", { h: hora(id, fimTxt) }) : t("concluido.obrigado")}</p></div>
        </div>
        <dl className="resumo" id="resumo" hidden={!resumo.some((r) => r[1])}>
          {resumo.map(([k, v]) => <div key={k} id={"ri-" + k} hidden={!v}><dt>{t("resumo." + k)}</dt><dd id={"r-" + k}>{v}</dd></div>)}
          {!resumo.length ? ["saida", "chegada", "duracao", "distancia"].map((k) => <div key={k} id={"ri-" + k} hidden><dt>{t("resumo." + k)}</dt><dd id={"r-" + k} /></div>) : null}
        </dl>
      </div>
      <div className="agendado" id="agendado" role="status" hidden={!agendado}>
        <div className="icone"><Relogio /></div>
        <div><h2>{t("agendado.titulo")}</h2><p id="agendado-txt">{d && agendado ? textoAgendado(d, t) : ""}</p></div>
      </div>
      <Avaliacao visivel={concluido} avaliado={!!d?.avaliado} />
      <p className="local" id="local" hidden={concluido || !endereco}><Pino /><span><b className="local-rot">{t("local.agoraEm")}</b> <span id="endereco">{endereco}</span></span></p>
      <Contato cfg={cfg} hidden={carregou && !concluido} />
    </section>
  );
}
