import { ActionBar, ActionButton } from "../components/common/ActionButton";
import { GraficoEvolucao } from "../components/gastos/GastosCharts";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { formatDiaMes, isMockGastosCartao } from "../lib/gastosCartao";
import { PERIODOS, STATUS_DESPESA, formatBRL, type PeriodoId, type RelatorioModelo } from "../lib/gastosRelatorio";

export type GastosRelatorioLoadStatus = "loading" | "ready" | "error";

type GastosRelatorioScreenProps = {
  modelo: RelatorioModelo | null;
  periodoId: PeriodoId;
  loadStatus: GastosRelatorioLoadStatus;
  /** Gastos do cartão que o motorista ainda precisa completar. */
  pendentesCartao: number;
  onPeriodo: (id: PeriodoId) => void;
  onBack: () => void;
  onReload: () => void;
  onCompletar: () => void;
  onAttach: () => void;
};

const STATUS_BADGE: Record<number, { rotulo: string; tom: string }> = {
  [STATUS_DESPESA.enviado]: { rotulo: "Enviado", tom: "neutro" },
  [STATUS_DESPESA.validado]: { rotulo: "Validado", tom: "sucesso" },
  [STATUS_DESPESA.precisaCorrigir]: { rotulo: "Precisa corrigir", tom: "atencao" },
  [STATUS_DESPESA.recusado]: { rotulo: "Recusado", tom: "erro" }
};

export function GastosRelatorioScreen({ modelo, periodoId, loadStatus, pendentesCartao, onPeriodo, onBack, onReload, onCompletar, onAttach }: GastosRelatorioScreenProps) {
  const carregando = loadStatus === "loading" && !modelo;
  const erro = loadStatus === "error" && !modelo;
  return (
    <AppShell screenLabel="GastosRelatorio">
      <ServicesMenu
        title="Gastos"
        eyebrow={isMockGastosCartao() ? "Financeiro · Mock local" : "Financeiro"}
        homeLabel="Voltar"
        homeIcon="arrowLeft"
        onHome={onBack}
        onRefresh={onReload}
      />
      <section className="termo-screen gr-screen" aria-label="Relatório de gastos">
        <div className="gr-periodos" role="group" aria-label="Período">
          {PERIODOS.map((periodo) => (
            <button key={periodo.id} type="button" className="gr-chip" aria-pressed={periodo.id === periodoId} onClick={() => onPeriodo(periodo.id)}>{periodo.rotulo}</button>
          ))}
        </div>
        {carregando ? (
          <div className="gr-skeleton" role="status" aria-busy="true" aria-label="Carregando relatório de gastos"><span /><span /><span /></div>
        ) : erro ? (
          <div className="termo-alert" data-tone="erro" role="alert">
            <p>Não foi possível carregar o relatório de gastos.</p>
            <button type="button" className="termo-text-button" onClick={onReload}>Tentar de novo</button>
          </div>
        ) : modelo && modelo.quantidade === 0 ? (
          <p className="termo-empty">Nenhum gasto neste período. Para lançar um gasto, toque em Anexar despesa.</p>
        ) : modelo ? (
          <Relatorio modelo={modelo} pendentesCartao={pendentesCartao} onCompletar={onCompletar} />
        ) : null}
      </section>
      <ActionBar className="finalize-actions gr-actions">
        {pendentesCartao > 0 ? <ActionButton variant="secondary" label={`Completar (${pendentesCartao})`} onClick={onCompletar} /> : null}
        <ActionButton className="finalize-primary" variant="primary" label="Anexar despesa" onClick={onAttach} />
      </ActionBar>
    </AppShell>
  );
}

/** Médias de maior peso para o motorista: ficam sempre no topo, mesmo sem dados no período. */
const DESTAQUES: { id: RelatorioModelo["cartoes"][number]["id"]; titulo: string; vazio: string }[] = [
  { id: "litro", titulo: "Preço médio por litro", vazio: "Nenhum abastecimento com litros neste período" },
  { id: "refeicao", titulo: "Refeição média", vazio: "Nenhum almoço ou jantar neste período" }
];

function CartaoMedia({ cartao }: { cartao: RelatorioModelo["cartoes"][number] }) {
  return (
    <li className="gr-media" data-media={cartao.id}>
      <span className="gr-media-titulo">{cartao.titulo}</span>
      <strong className="gr-media-valor">{cartao.valorTexto}</strong>
      <span className="gr-media-detalhe">{cartao.detalhe}</span>
      {cartao.variacaoTexto ? <span className="gr-media-variacao">{cartao.variacaoTexto}</span> : null}
    </li>
  );
}

function Relatorio({ modelo, pendentesCartao, onCompletar }: { modelo: RelatorioModelo; pendentesCartao: number; onCompletar: () => void }) {
  const { status } = modelo;
  const outrasMedias = modelo.cartoes.filter((cartao) => !DESTAQUES.some((destaque) => destaque.id === cartao.id));
  const contagens = [
    { rotulo: "Enviado", valor: status.enviado }, { rotulo: "Validado", valor: status.validado },
    { rotulo: "Precisa corrigir", valor: status.precisaCorrigir }, { rotulo: "Recusado", valor: status.recusado }
  ];
  return (
    <div className="gr-conteudo">
      <section className="gr-bloco" aria-labelledby="gr-medias">
        <h2 className="termo-section-title" id="gr-medias">Suas médias</h2>
        <ul className="gr-medias gr-destaques">
          {DESTAQUES.map((destaque) => {
            const cartao = modelo.cartoes.find((item) => item.id === destaque.id);
            return cartao ? <CartaoMedia key={cartao.id} cartao={cartao} /> : (
              <li key={destaque.id} className="gr-media" data-media={destaque.id} data-vazio="true">
                <span className="gr-media-titulo">{destaque.titulo}</span>
                <strong className="gr-media-valor">Sem dados</strong>
                <span className="gr-media-detalhe">{destaque.vazio}</span>
              </li>
            );
          })}
        </ul>
        {outrasMedias.length ? (
          <>
            <h3 className="gr-subtitulo" id="gr-outras-medias">Outras médias</h3>
            <ul className="gr-medias gr-secundarias" aria-labelledby="gr-outras-medias">
              {outrasMedias.map((cartao) => <CartaoMedia key={cartao.id} cartao={cartao} />)}
            </ul>
          </>
        ) : null}
      </section>

      {modelo.insights.length ? (
        <section className="gr-bloco" aria-labelledby="gr-insights">
          <h2 className="termo-section-title" id="gr-insights">Para você</h2>
          <ul className="gr-insights">
            {modelo.insights.map((texto) => <li key={texto}>{texto}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="gr-bloco" aria-labelledby="gr-status">
        <h2 className="termo-section-title" id="gr-status">Status dos envios</h2>
        <ul className="gr-status">
          {contagens.map((item) => (
            <li key={item.rotulo}><strong>{item.valor}</strong><span>{item.rotulo}</span></li>
          ))}
        </ul>
        {status.precisaCorrigir > 0 && pendentesCartao > 0 ? (
          <button type="button" className="termo-text-button gr-atalho" onClick={onCompletar}>Ver pendentes do cartão</button>
        ) : null}
      </section>

      <section className="gr-bloco" aria-labelledby="gr-evolucao">
        <h2 className="termo-section-title" id="gr-evolucao">{modelo.evolucao.tipo === "semana" ? "Evolução por semana" : "Evolução por mês"}</h2>
        <GraficoEvolucao barras={modelo.evolucao.barras} tipo={modelo.evolucao.tipo} />
      </section>

      <section className="gr-bloco" aria-labelledby="gr-ultimas">
        <h2 className="termo-section-title" id="gr-ultimas">Últimas despesas</h2>
        <ul className="gr-lista">
          {modelo.ultimas.map((item) => {
            const badge = STATUS_BADGE[item.status];
            return (
              <li key={item.id} className="gr-linha">
                <span className="gr-linha-main">
                  <strong>{item.categoria}</strong>
                  <span>{item.estabelecimento || "Sem estabelecimento"}</span>
                  <small>{formatDiaMes(item.data)}</small>
                </span>
                <span className="gr-linha-side">
                  <strong>{formatBRL(item.valor)}</strong>
                  {badge ? <span className="termo-badge" data-tone={badge.tom}>{badge.rotulo}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
