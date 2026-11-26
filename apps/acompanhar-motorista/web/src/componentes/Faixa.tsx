import { useIdioma } from "../i18n";
import { diaMes, hora } from "../formato";
import type { EtaMostrado } from "../hooks/useEta";
import { aeroportoNoEmbarque, estadoViagem, fraseFase, SEGMENTOS, segmentosAcesos, tituloFase } from "../portal";
import type { Dados } from "../tipos";
import { SeletorIdioma } from "./SeletorIdioma";

interface Props { dados: Dados | null; eta: EtaMostrado; reserva: string | null; espera: number }

// Faixa marinho do topo: marca, idioma, reserva, título da fase, selo com os minutos, barra de 5 segmentos e a frase de previsão.
export function Faixa({ dados, eta, reserva, espera }: Props) {
  const { t, id, cor } = useIdioma();
  const ag = Date.parse(dados?.horarioAgendado ?? "");
  const linha = [
    reserva,
    isNaN(ag) ? null : diaMes(id, ag),
    isNaN(ag) ? null : t("faixa.saida", { h: hora(id, ag) }),
  ].filter(Boolean).join(" · ");
  const e = dados ? estadoViagem(dados) : null;
  const acesos = dados ? segmentosAcesos(dados) : 0;
  const frase = dados ? fraseFase(dados, { t, id, cor, eta, espera }) : "";
  const minutos = dados && eta.eta && (e === "a_caminho" || e === "em_viagem") ? eta.eta.minutos : null;
  return (
    <header className="faixa">
      <div className="faixa-topo">
        <div className="marca"><img className="logo-solta" src="/logo-b-128.png" alt="Betinhos Executive Service" width={40} height={40} /><div><b>BETINHOS</b><small>Executive Service</small></div></div>
        <SeletorIdioma segmentado />
      </div>
      <div className="faixa-heroi">
        {dados && aeroportoNoEmbarque(dados) && e !== "concluido" ? <p className="boasvindas" id="boasvindas">{t("boasvindas")}</p> : null}
        <p className="reserva" id="reserva" hidden={!linha}>{linha}</p>
        <div className="titulo-linha">
          <h1 id="status" aria-live="polite" className={dados ? undefined : "esqueleto"}>{dados ? tituloFase(dados, t) : t("status.localizando")}</h1>
          {minutos !== null ? <span className="selo-eta" id="eta"><b>{minutos}</b> min</span> : null}
        </div>
        <ol className="barra" id="passos" aria-label={t("card.trajeto")}>
          {SEGMENTOS.map((c, i) => <li key={c} aria-current={i === acesos - 1 && e !== "concluido" ? "step" : undefined} className={i < acesos ? (i === acesos - 1 && e !== "concluido" ? "atual" : "feita") : undefined}><i /><span>{t(c)}</span></li>)}
        </ol>
        {frase ? <p className="frase" id="frase">{frase}</p> : null}
      </div>
    </header>
  );
}
