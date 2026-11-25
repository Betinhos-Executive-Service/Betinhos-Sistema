import { useIdioma } from "../i18n";
import { diaMes, hora } from "../formato";
import type { EtaMostrado } from "../hooks/useEta";
import { aeroportoNoEmbarque, estadoViagem, fraseFase, SEGMENTOS, segmentosAcesos, tituloFase } from "../portal";
import type { Dados } from "../tipos";
import { Compartilhar } from "../icones";
import { useCompartilhar } from "./CardCompartilhar";
import { SeletorIdioma } from "./SeletorIdioma";

interface Props { dados: Dados | null; eta: EtaMostrado; reserva: string | null; espera: number }

const Marca = () => <div className="marca"><img className="logo-solta" src="/logo-b-128.png" alt="Betinhos Executive Service" width={40} height={40} /><div><b>BETINHOS</b><small>Executive Service</small></div></div>;

// Celular: faixa marinho com marca, idioma e o herói da fase. Desktop: faixa fina com marca, reserva, idioma e compartilhar (o herói vira card no corpo).
export function Faixa({ desktop = false, ...p }: Props & { desktop?: boolean }) {
  if (!desktop) return (
    <header className="faixa">
      <div className="faixa-topo"><Marca /><SeletorIdioma segmentado /></div>
      <Heroi {...p} />
    </header>
  );
  return (
    <header className="faixa fina">
      <div className="faixa-topo">
        <Marca />
        <div className="cab-lado">
          <span className="reserva" id="reserva" hidden={!p.reserva}>{p.reserva}</span>
          <SeletorIdioma />
          <BotaoCompartilhar />
        </div>
      </div>
    </header>
  );
}

function BotaoCompartilhar() {
  const { t } = useIdioma();
  const { copiado, compartilhar } = useCompartilhar();
  return <>
    <button type="button" className={"qd" + (copiado ? " copiado" : "")} id="compartilhar" aria-label={t("compartilhar")} onClick={compartilhar}><Compartilhar /></button>
    <span className="sr" id="copiado" role="status">{copiado ? t("copiado") : ""}</span>
  </>;
}

// Herói da fase: título, selo com os minutos, barra de 5 segmentos e a frase de previsão.
export function Heroi({ dados, eta, reserva, espera, desktop = false }: Props & { desktop?: boolean }) {
  const { t, id, cor } = useIdioma();
  const ag = Date.parse(dados?.horarioAgendado ?? "");
  const linha = [
    desktop ? null : reserva,
    isNaN(ag) ? null : diaMes(id, ag),
    isNaN(ag) ? null : t("faixa.saida", { h: hora(id, ag) }),
  ].filter(Boolean).join(" · ");
  const e = dados ? estadoViagem(dados) : null;
  const acesos = dados ? segmentosAcesos(dados) : 0;
  const frase = dados ? fraseFase(dados, { t, id, cor, eta, espera }) : "";
  const minutos = dados && eta.eta && (e === "a_caminho" || e === "em_viagem") ? eta.eta.minutos : null;
  return (
    <div className={desktop ? "card faixa-heroi heroi-card" : "faixa-heroi"}>
      {dados && aeroportoNoEmbarque(dados) && e !== "concluido" ? <p className="boasvindas" id="boasvindas">{t("boasvindas")}</p> : null}
      <p className="reserva" id={desktop ? "agenda" : "reserva"} hidden={!linha}>{linha}</p>
      <div className="titulo-linha">
        <h1 id="status" aria-live="polite" className={dados ? undefined : "esqueleto"}>{dados ? tituloFase(dados, t) : t("status.localizando")}</h1>
        {minutos !== null ? <span className="selo-eta" id="eta"><b>{minutos}</b> min</span> : null}
      </div>
      <ol className="barra" id="passos" aria-label={t("card.trajeto")}>
        {SEGMENTOS.map((c, i) => <li key={c} aria-current={i === acesos - 1 && e !== "concluido" ? "step" : undefined} className={i < acesos ? (i === acesos - 1 && e !== "concluido" ? "atual" : "feita") : undefined}><i /><span>{t(c)}</span></li>)}
      </ol>
      {frase ? <p className="frase" id="frase">{frase}</p> : null}
    </div>
  );
}
