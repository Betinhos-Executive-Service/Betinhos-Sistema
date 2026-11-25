import { hora } from "../formato";
import { useIdioma } from "../i18n";
import { Check } from "../icones";
import type { Dados, Etapa } from "../tipos";
import { enderecoLimpo } from "../util";

const estadoEtapa = (e: Etapa) => (e.atual ? "atual" : e.visitada ? "feita" : "futura");

// Paradas da viagem. Horários: a saída mostra o agendado; o destino, a chegada prevista (some com o rastreador fora).
export function CardTrajeto({ dados, chegada, oculto }: { dados: Dados | null; chegada: number | null; oculto: boolean }) {
  const { t, id } = useIdioma();
  // Antes da saída a reserva não tem etapas: mostra só o embarque (endereço + horário agendado).
  const emb = dados?.embarque;
  const soEmbarque = !dados?.etapas?.length && !!emb;
  const lista: Etapa[] = soEmbarque ? [{ tipo: "saida", rotulo: emb!.label, lat: emb!.lat, lon: emb!.lon }] : dados?.etapas ?? [];
  const agendado = Date.parse(dados?.horarioAgendado ?? "");
  let n = 0;
  return (
    <section className="card c-trajeto" id="c-trajeto" aria-labelledby="traj-titulo" hidden={oculto || !lista.length}>
      <h2 id="traj-titulo">{t("card.trajeto")}</h2>
      <ol className="paradas" id="paradas" aria-label={t("paradas")} hidden={!lista.length}>
        {lista.map((e, i) => {
          const est = estadoEtapa(e);
          const rot = e.tipo === "parada" ? t("etapa.parada", { n: ++n }) : e.tipo === "saida" || e.tipo === "destino" ? t("etapa." + e.tipo) : t("etapa.parada", { n: "" }).trim();
          const h = lista.length > 1 || soEmbarque ? (i === 0 ? (isNaN(agendado) ? "" : hora(id, agendado)) : i === lista.length - 1 ? (chegada ? hora(id, chegada) : "") : "") : "";
          const hRot = i === 0 ? "traj.agendado" : "traj.previsto";
          return (
            <li key={i} className={"parada p-" + est} aria-current={e.atual ? "step" : undefined}>
              <span className="num" aria-hidden="true">{est === "feita" ? <Check /> : i + 1}</span>
              <div><small>{rot}</small><span>{enderecoLimpo(e.rotulo) || e.rotulo || ""}</span></div>
              {e.atual ? <span className="badge b-info">{t("etapa.agora")}</span> : null}
              {h ? <span className="p-h"><b>{h}</b><small>{t(hRot)}</small></span> : null}
              <span className="sr">{t("etapa." + est)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
