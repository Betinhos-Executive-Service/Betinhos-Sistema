import { useState, type CSSProperties } from "react";
import { ActionBar, ActionButton } from "../components/common/ActionButton";
import { GraficoMedias, Sparkline } from "../components/gastos/GastosCharts";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { formatDiaMes, isMockGastosCartao } from "../lib/gastosCartao";
import { PERIODOS, STATUS_DESPESA, formatBRL, plural, type PeriodoId, type PontoTendencia, type RelatorioModelo } from "../lib/gastosRelatorio";

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
  // Fica aqui (fora do Relatorio, que remonta a cada período) para a aba do gráfico sobreviver à troca de período.
  const [grafico, setGrafico] = useState<Grafico>("litro");
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
          <Relatorio key={periodoId} modelo={modelo} grafico={grafico} onGrafico={setGrafico} pendentesCartao={pendentesCartao} onCompletar={onCompletar} />
        ) : null}
      </section>
      <ActionBar className="finalize-actions gr-actions">
        {pendentesCartao > 0 ? <ActionButton variant="secondary" label={`Completar (${pendentesCartao})`} onClick={onCompletar} /> : null}
        <ActionButton className="finalize-primary" variant="primary" label="Anexar despesa" onClick={onAttach} />
      </ActionBar>
    </AppShell>
  );
}

type Cartao = RelatorioModelo["cartoes"][number];

/** Médias de maior peso para o motorista: ficam sempre no topo, mesmo sem dados no período. */
const DESTAQUES: { id: "litro" | "refeicao"; titulo: string; vazio: string }[] = [
  { id: "litro", titulo: "Preço médio por litro", vazio: "Nenhum abastecimento com litros neste período" },
  { id: "refeicao", titulo: "Refeição média", vazio: "Nenhum almoço ou jantar neste período" }
];

const DECIMAL_2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GRAFICOS: Record<"litro" | "refeicao", { aba: string; rotulo: string; vazio: string; curto: (valor: number) => string; longo: (valor: number) => string }> = {
  litro: { aba: "R$/L", rotulo: "Preço médio por litro", vazio: "Nenhum abastecimento com litros nos últimos meses.", curto: (valor) => DECIMAL_2.format(valor), longo: (valor) => `${formatBRL(valor)} por litro` },
  refeicao: { aba: "Refeição", rotulo: "Refeição média", vazio: "Nenhum almoço ou jantar nos últimos meses.", curto: (valor) => String(Math.round(valor)), longo: formatBRL }
};
type Grafico = keyof typeof GRAFICOS;
const ABAS = Object.keys(GRAFICOS) as Grafico[];

/** Ordem da barra de status e cor de cada trecho (DS: green-600, slate-400, amber-700, red-700). */
const STATUS_BARRA = [
  { chave: "validado", rotulo: "Validado", cor: "#168f57" },
  { chave: "enviado", rotulo: "Enviado", cor: "#94a3b8" },
  { chave: "precisaCorrigir", rotulo: "Precisa corrigir", cor: "#b17a00" },
  { chave: "recusado", rotulo: "Recusado", cor: "#c12f45" }
] as const;

/** Posição na cascata de entrada (CSS usa `--i` para o atraso). */
const ordem = (i: number) => ({ "--i": i }) as CSSProperties;

/** Seta + percentual; subir é ruim em custo e bom em consumo (km/L). `compacto` omite o "vs ..." visível (fica para leitor de tela). */
function Variacao({ cartao, rotuloAnterior, compacto = false }: { cartao: Cartao; rotuloAnterior: string; compacto?: boolean }) {
  const { variacao } = cartao;
  if (variacao == null) return null;
  if (variacao === 0) return <span className="termo-badge gr-variacao" data-tom="neutro">{compacto ? <>= 0%<span className="gr-sr"> igual ao {rotuloAnterior}</span></> : `Igual ao ${rotuloAnterior}`}</span>;
  const subiu = variacao > 0;
  return (
    <span className="termo-badge gr-variacao" data-tom={subiu === (cartao.id === "consumo") ? "sucesso" : "atencao"}>
      <span aria-hidden="true">{subiu ? "▲" : "▼"}</span>
      <span className="gr-sr">{subiu ? "subiu" : "caiu"}</span> {Math.abs(variacao)}%{compacto ? <span className="gr-sr"> vs {rotuloAnterior}</span> : ` vs ${rotuloAnterior}`}
    </span>
  );
}

type Destaque = (typeof DESTAQUES)[number];

function CartaoDestaque({ destaque, cartao, tendencia, rotuloAnterior, i }: { destaque: Destaque; cartao?: Cartao; tendencia: PontoTendencia[]; rotuloAnterior: string; i: number }) {
  return (
    <li className="gr-kpi" data-media={destaque.id} data-vazio={cartao ? undefined : "true"} style={ordem(i)}>
      <span className="gr-media-titulo">{destaque.titulo}</span>
      <strong className="gr-kpi-valor">{cartao ? cartao.valorTexto : "Sem dados"}</strong>
      <span className="gr-media-detalhe">{cartao ? cartao.detalhe : destaque.vazio}</span>
      {cartao ? <Variacao cartao={cartao} rotuloAnterior={rotuloAnterior} /> : null}
      <Sparkline pontos={tendencia} />
    </li>
  );
}

function CartaoMedia({ cartao, rotuloAnterior, i }: { cartao: Cartao; rotuloAnterior: string; i: number }) {
  return (
    <li className="gr-media" data-media={cartao.id} style={ordem(i)}>
      <span className="gr-media-titulo">{cartao.titulo}</span>
      <strong className="gr-media-valor">{cartao.valorTexto}</strong>
      <span className="gr-media-detalhe">{cartao.detalhe}</span>
      <Variacao cartao={cartao} rotuloAnterior={rotuloAnterior} compacto />
    </li>
  );
}

type RelatorioProps = { modelo: RelatorioModelo; grafico: Grafico; onGrafico: (id: Grafico) => void; pendentesCartao: number; onCompletar: () => void };

function Relatorio({ modelo, grafico, onGrafico, pendentesCartao, onCompletar }: RelatorioProps) {
  const { status, tendencia, periodo } = modelo;
  const outrasMedias = modelo.cartoes.filter((cartao) => !DESTAQUES.some((destaque) => destaque.id === cartao.id));
  const totalStatus = status.enviado + status.validado + status.precisaCorrigir + status.recusado;
  const pendencias = [
    status.precisaCorrigir ? plural(status.precisaCorrigir, "gasto precisa de correção", "gastos precisam de correção") : "",
    status.recusado ? plural(status.recusado, "gasto recusado", "gastos recusados") : ""
  ].filter(Boolean);
  const config = GRAFICOS[grafico];
  return (
    <div className="gr-conteudo">
      {pendencias.length ? (
        <div className="termo-alert gr-alerta" data-tone="atencao" role="status" style={ordem(0)}>
          <p>{pendencias.join(" · ")}</p>
          {status.precisaCorrigir > 0 && pendentesCartao > 0 ? (
            <button type="button" className="termo-text-button gr-atalho" onClick={onCompletar}>Ver pendentes do cartão</button>
          ) : null}
        </div>
      ) : null}

      <section className="gr-bloco" aria-labelledby="gr-medias" style={ordem(1)}>
        <h2 className="termo-section-title" id="gr-medias">Suas médias</h2>
        <ul className="gr-kpis gr-destaques">
          {DESTAQUES.map((destaque, i) => (
            <CartaoDestaque key={destaque.id} destaque={destaque} cartao={modelo.cartoes.find((item) => item.id === destaque.id)} tendencia={tendencia[destaque.id]} rotuloAnterior={periodo.rotuloAnterior} i={i + 1} />
          ))}
        </ul>
        {outrasMedias.length ? (
          <>
            <h3 className="gr-subtitulo" id="gr-outras-medias">Outras médias</h3>
            <ul className="gr-medias gr-secundarias" aria-labelledby="gr-outras-medias">
              {outrasMedias.map((cartao, i) => <CartaoMedia key={cartao.id} cartao={cartao} rotuloAnterior={periodo.rotuloAnterior} i={i + 3} />)}
            </ul>
          </>
        ) : null}
      </section>

      {modelo.insights.length ? (
        <section className="gr-bloco" aria-labelledby="gr-insights" style={ordem(2)}>
          <h2 className="termo-section-title" id="gr-insights">Para você</h2>
          <ul className="gr-insights">
            {modelo.insights.map((texto) => <li key={texto}>{texto}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="gr-bloco gr-evolucao" aria-labelledby="gr-evolucao" style={ordem(3)}>
        <div className="gr-bloco-cabecalho">
          <h2 className="termo-section-title" id="gr-evolucao">Médias por mês</h2>
          <div className="gr-abas" role="group" aria-label="Média exibida no gráfico">
            {ABAS.map((id) => (
              <button key={id} type="button" className="gr-aba" aria-pressed={id === grafico} onClick={() => onGrafico(id)}>{GRAFICOS[id].aba}</button>
            ))}
          </div>
        </div>
        {tendencia[grafico].some((ponto) => ponto.valor != null) ? (
          <>
            <GraficoMedias key={grafico} pontos={tendencia[grafico]} curto={config.curto} longo={config.longo} rotulo={config.rotulo} />
            <p className="gr-legenda">Em azul-escuro, os meses do período escolhido.</p>
          </>
        ) : (
          <p className="gr-legenda">{config.vazio}</p>
        )}
      </section>

      <section className="gr-bloco" aria-labelledby="gr-status" style={ordem(4)}>
        <div className="gr-bloco-cabecalho">
          <h2 className="termo-section-title" id="gr-status">Status dos envios</h2>
          <span className="gr-legenda">{plural(totalStatus, "gasto", "gastos")}</span>
        </div>
        <div className="gr-status-barra" aria-hidden="true">
          {STATUS_BARRA.map((item) => (status[item.chave] ? <span key={item.chave} style={{ flexGrow: status[item.chave], background: item.cor }} /> : null))}
        </div>
        <ul className="gr-status">
          {STATUS_BARRA.map((item) => (
            <li key={item.chave} data-zero={status[item.chave] ? undefined : "true"}>
              <i style={{ background: item.cor }} aria-hidden="true" />
              <span>{item.rotulo}</span>
              <strong>{status[item.chave]}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="gr-bloco" aria-labelledby="gr-ultimas" style={ordem(5)}>
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
