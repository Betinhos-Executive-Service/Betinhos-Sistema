import { useIdioma } from "../i18n";
import { hora } from "../formato";
import { Check } from "../icones";
import { linhaDoTempo, type Passo } from "../portal";
import type { Cfg, Dados } from "../tipos";
import type { Tela } from "./CardMotorista";
import { Sino } from "./Sino";

const CHAVA: Record<string, string> = { confirmada: "tl.confirmada", definicao: "tl.definicao", definido: "tl.definido", aguardando: "agendado.titulo", embarque: "tl.embarque", a_caminho: "tl.a_caminho", no_local: "tl.no_local", em_viagem: "passo.em_viagem", chegada: "tl.chegada" };

interface Props { dados: Dados | null; cfg: Cfg; chegada: number | null; abrirTela: (q: Exclude<Tela, null>) => void }

// Card "Sua viagem": 6 etapas com endereço e horário próprios. Atual em dourado, feitas em verde, futuras em cinza; o sino mora na etapa atual.
export function LinhaDoTempo({ dados, cfg, chegada, abrirTela }: Props) {
  const { t, id } = useIdioma();
  if (!dados) return null;
  const rotulo = (p: Passo) => p.chave === "parada" ? t("etapa.parada", { n: p.n }) : t(CHAVA[p.chave]);
  return (
    <section className="card c-viagem" id="viagem" aria-labelledby="viagem-titulo">
      <h2 id="viagem-titulo">{t("card.viagem")}</h2>
      <ol className="linha" id="paradas">
        {linhaDoTempo(dados, chegada).map((p, i) => (
          <li key={p.chave + i} className={"etapa " + p.estado} data-passo={p.chave} aria-current={p.estado === "atual" ? "step" : undefined}>
            <span className="ponto" aria-hidden="true">{p.estado === "feita" ? <Check /> : null}</span>
            <div className="etapa-corpo">
              <div className="etapa-linha"><b>{rotulo(p)}</b>{p.hora ? <time>{hora(id, p.hora)}</time> : null}</div>
              {p.endereco ? <p className="etapa-end">{p.endereco}</p> : null}
              {p.sino && cfg.vapid ? <Sino vapid={cfg.vapid} nomeMotorista={dados.motorista?.nome} abrirTela={abrirTela} /> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
