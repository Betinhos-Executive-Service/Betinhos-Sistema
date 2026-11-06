import { useCallback, useRef, useState, type CSSProperties } from "react";
import { ActionBar, ActionButton } from "../components/common/ActionButton";
import postoCombustivel from "../assets/images/posto-combustivel.png";
import { ConvitePosto } from "../components/gastos/ConvitePosto";
import { DespesaDetalheDialog, STATUS_BADGE } from "../components/gastos/DespesaDetalheDialog";
import { GraficoMedias } from "../components/gastos/GastosCharts";
import { SystemIcon } from "../components/icons/SystemIcon";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { formatDiaMes, isMockGastosCartao } from "../lib/gastosCartao";
import { METAS_GASTOS, PERIODOS, ehPendente, formatBRL, plural, semaforo, type DespesaRelatorio, type PeriodoId, type RelatorioModelo, type Semaforo } from "../lib/gastosRelatorio";

export type GastosRelatorioLoadStatus = "loading" | "ready" | "error";

type GastosRelatorioScreenProps = {
  modelo: RelatorioModelo | null;
  periodoId: PeriodoId;
  loadStatus: GastosRelatorioLoadStatus;
  /** Gastos do cartão que o motorista ainda precisa completar. */
  pendentesCartao: number;
  /** Ids dos gastos do cartão que ainda faltam completar: tocar neles abre o formulário de completar. */
  idsCompletar: ReadonlySet<string>;
  onCompletarGasto: (id: string) => void;
  onPeriodo: (id: PeriodoId) => void;
  onBack: () => void;
  onReload: () => void;
  onCompletar: () => void;
  onAttach: () => void;
  onPrecoPostos: () => void;
};

export function GastosRelatorioScreen({ modelo, periodoId, loadStatus, pendentesCartao, idsCompletar, onCompletarGasto, onPeriodo, onBack, onReload, onCompletar, onAttach, onPrecoPostos }: GastosRelatorioScreenProps) {
  const carregando = loadStatus === "loading" && !modelo;
  const erro = loadStatus === "error" && !modelo;
  // Ficam aqui (fora do Relatorio, que remonta a cada período) para a aba do gráfico e o filtro sobreviverem à troca de período.
  const [grafico, setGrafico] = useState<Grafico>("litro");
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
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
        <ConvitePosto />
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
          <Relatorio key={periodoId} onPrecoPostos={onPrecoPostos} modelo={modelo} grafico={grafico} onGrafico={setGrafico} filtro={filtro} onFiltro={setFiltro} idsCompletar={idsCompletar} onCompletarGasto={onCompletarGasto} />
        ) : null}
        {modelo?.quantidade ? null : <button type="button" className="termo-text-button gr-preco-postos" onClick={onPrecoPostos}>Ver postos perto de mim</button>}
      </section>
      <ActionBar className="finalize-actions gr-actions">
        {pendentesCartao > 0 ? <ActionButton variant="secondary" label={`Completar (${pendentesCartao})`} onClick={onCompletar} /> : null}
        <ActionButton className="finalize-primary" variant="primary" label="Anexar despesa" onClick={onAttach} />
      </ActionBar>
    </AppShell>
  );
}

type Cartao = RelatorioModelo["cartoes"][number];
type Destaque = "litro" | "refeicao";

/** Médias de maior peso: sempre no topo, lado a lado, com o semáforo contra a política da empresa. */
const DESTAQUES: { id: Destaque; titulo: string; vazio: string; meta: string }[] = [
  { id: "litro", titulo: "Preço por litro", vazio: "Sem abastecimento com litros", meta: `Meta ${formatBRL(METAS_GASTOS.litro.meta)}/L` },
  { id: "refeicao", titulo: "Refeição média", vazio: "Sem almoço ou jantar", meta: `Meta ${formatBRL(METAS_GASTOS.refeicao.meta)}` }
];
const SEMAFORO_ROTULO: Record<Semaforo, string> = { verde: "Dentro da meta", amarelo: "Pouco acima", vermelho: "Acima da meta" };

const DECIMAL_2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GRAFICOS: Record<Destaque, { aba: string; rotulo: string; vazio: string; curto: (valor: number) => string; longo: (valor: number) => string }> = {
  litro: { aba: "R$/L", rotulo: "Preço médio por litro", vazio: "Nenhum abastecimento com litros nos últimos meses.", curto: (valor) => DECIMAL_2.format(valor), longo: (valor) => `${formatBRL(valor)} por litro` },
  refeicao: { aba: "Refeição", rotulo: "Refeição média", vazio: "Nenhum almoço ou jantar nos últimos meses.", curto: (valor) => String(Math.round(valor)), longo: formatBRL }
};
type Grafico = Destaque;
const ABAS = Object.keys(GRAFICOS) as Grafico[];
type Filtro = "pendentes" | "todas";

/** Posição na cascata de entrada (CSS usa `--i` para o atraso). */
const ordem = (i: number) => ({ "--i": i }) as CSSProperties;

/** Seta + percentual; subir é ruim (custo). `compacto` omite o "vs ..." visível (fica para leitor de tela). */
function Variacao({ cartao, rotuloAnterior, compacto = false }: { cartao: Cartao; rotuloAnterior: string; compacto?: boolean }) {
  const { variacao } = cartao;
  if (variacao == null) return null;
  if (variacao === 0) return <span className="termo-badge gr-variacao" data-tone="neutro">{compacto ? <>= 0%<span className="gr-sr"> igual ao {rotuloAnterior}</span></> : `Igual ao ${rotuloAnterior}`}</span>;
  const subiu = variacao > 0;
  return (
    <span className="termo-badge gr-variacao" data-tone={subiu ? "atencao" : "sucesso"}>
      <span aria-hidden="true">{subiu ? "▲" : "▼"}</span>
      <span className="gr-sr">{subiu ? "subiu" : "caiu"}</span> {Math.abs(variacao)}%{compacto ? <span className="gr-sr"> vs {rotuloAnterior}</span> : ` vs ${rotuloAnterior}`}
    </span>
  );
}

/** Comparação com o período anterior em texto discreto (a cor do cartão já é o semáforo). */
function VariacaoTexto({ variacao, rotuloAnterior }: { variacao: number | null; rotuloAnterior: string }) {
  if (variacao == null) return <span className="gr-kpi-comparacao">Sem base no {rotuloAnterior}</span>;
  if (variacao === 0) return <span className="gr-kpi-comparacao">Igual ao {rotuloAnterior}</span>;
  return (
    <span className="gr-kpi-comparacao">
      <span aria-hidden="true">{variacao > 0 ? "▲" : "▼"}</span><span className="gr-sr">{variacao > 0 ? "subiu" : "caiu"}</span> {Math.abs(variacao)}% vs {rotuloAnterior}
    </span>
  );
}

function CartaoDestaque({ destaque, cartao, rotuloAnterior, i }: { destaque: (typeof DESTAQUES)[number]; cartao?: Cartao; rotuloAnterior: string; i: number }) {
  const cor = cartao ? semaforo(cartao.valor, METAS_GASTOS[destaque.id]) : undefined;
  return (
    <li className="gr-kpi" data-media={destaque.id} data-semaforo={cor} data-vazio={cartao ? undefined : "true"} style={ordem(i)}>
      <span className="gr-media-titulo">{destaque.titulo}</span>
      <strong className="gr-kpi-valor">{cartao ? cartao.valorTexto : "Sem dados"}</strong>
      {cor ? <span className="gr-kpi-semaforo"><i aria-hidden="true" />{SEMAFORO_ROTULO[cor]}</span> : <span className="gr-media-detalhe">{destaque.vazio}</span>}
      <span className="gr-media-detalhe">{destaque.meta}</span>
      {cartao ? <VariacaoTexto variacao={cartao.variacao} rotuloAnterior={rotuloAnterior} /> : null}
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

type RelatorioProps = { onPrecoPostos: () => void; modelo: RelatorioModelo; grafico: Grafico; onGrafico: (id: Grafico) => void; filtro: Filtro; onFiltro: (id: Filtro) => void; idsCompletar: ReadonlySet<string>; onCompletarGasto: (id: string) => void };

function Relatorio({ onPrecoPostos, modelo, grafico, onGrafico, filtro, onFiltro, idsCompletar, onCompletarGasto }: RelatorioProps) {
  const { status, tendencia, periodo } = modelo;
  const [aberta, setAberta] = useState<DespesaRelatorio | null>(null);
  const fecharDetalhe = useCallback(() => setAberta(null), []);
  const despesasRef = useRef<HTMLElement>(null);
  const outrasMedias = modelo.cartoes.filter((cartao) => !DESTAQUES.some((destaque) => destaque.id === cartao.id));
  const pendentes = modelo.despesas.filter(ehPendente);
  const lista = filtro === "pendentes" ? pendentes : modelo.despesas;
  // Gasto do cartão a completar também tem status "Precisa corrigir"; no aviso ele é contado à parte.
  const aCompletar = pendentes.filter((item) => idsCompletar.has(item.id)).length;
  const aCorrigir = status.precisaCorrigir - aCompletar;
  const detalhePendencias = [
    aCompletar ? `${aCompletar} para completar` : "",
    aCorrigir > 0 ? `${aCorrigir} para corrigir` : "",
    status.recusado ? plural(status.recusado, "recusado", "recusados") : ""
  ].filter(Boolean).join(" · ");
  const verPendentes = () => {
    onFiltro("pendentes");
    const suave = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    despesasRef.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
  };
  const config = GRAFICOS[grafico];
  return (
    <div className="gr-conteudo">
      {pendentes.length ? (
        <button type="button" className="gr-alerta" onClick={verPendentes} style={ordem(0)}>
          <span className="gr-alerta-icone" aria-hidden="true"><SystemIcon name="warning" /></span>
          <span className="gr-alerta-texto">
            <strong>{plural(pendentes.length, "gasto precisa", "gastos precisam")} da sua atenção</strong>
            <small>{detalhePendencias}</small>
          </span>
          <span className="gr-alerta-acao">Ver<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        </button>
      ) : null}

      <section className="gr-bloco" aria-labelledby="gr-medias" style={ordem(1)}>
        <h2 className="termo-section-title" id="gr-medias">Suas médias</h2>
        <ul className="gr-kpis gr-destaques">
          {DESTAQUES.map((destaque, i) => (
            <CartaoDestaque key={destaque.id} destaque={destaque} cartao={modelo.cartoes.find((item) => item.id === destaque.id)} rotuloAnterior={periodo.rotuloAnterior} i={i + 1} />
          ))}
        </ul>
        {outrasMedias.length ? <h3 className="gr-subtitulo" id="gr-outras-medias">Outras médias</h3> : null}
        <ul className="gr-medias gr-secundarias" aria-labelledby={outrasMedias.length ? "gr-outras-medias" : undefined}>
          {outrasMedias.map((cartao, i) => <CartaoMedia key={cartao.id} cartao={cartao} rotuloAnterior={periodo.rotuloAnterior} i={i + 3} />)}
          <li className="gr-postos-item">
            <button type="button" className="gr-media gr-postos gr-preco-postos" style={ordem(outrasMedias.length + 3)} onClick={onPrecoPostos}>
              <span className="gr-media-titulo">Postos perto de mim</span>
              <span className="gr-media-detalhe">Ver preços</span>
              <img className="gr-postos-img" src={postoCombustivel} alt="" />
            </button>
          </li>
        </ul>
      </section>

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
            <p className="gr-legenda">Pontos em azul-escuro: meses do período escolhido. Toque num ponto para ver o valor.</p>
          </>
        ) : (
          <p className="gr-legenda">{config.vazio}</p>
        )}
      </section>

      <section ref={despesasRef} className="gr-bloco gr-despesas" aria-labelledby="gr-despesas" style={ordem(4)}>
        <div className="gr-bloco-cabecalho">
          <h2 className="termo-section-title" id="gr-despesas">Despesas</h2>
          <div className="gr-abas" role="group" aria-label="Despesas exibidas">
            <button type="button" className="gr-aba" aria-pressed={filtro === "pendentes"} onClick={() => onFiltro("pendentes")}>Pendentes ({pendentes.length})</button>
            <button type="button" className="gr-aba" aria-pressed={filtro === "todas"} onClick={() => onFiltro("todas")}>Todas ({modelo.despesas.length})</button>
          </div>
        </div>
        {lista.length ? (
          <ul className="gr-lista">
            {lista.map((item) => {
              const completar = idsCompletar.has(item.id);
              const badge = completar ? { rotulo: "Completar", tom: "atencao" } : STATUS_BADGE[item.status];
              return (
                <li key={item.id}>
                  <button type="button" className="gr-linha" onClick={() => (completar ? onCompletarGasto(item.id) : setAberta(item))}>
                    <span className="gr-linha-main">
                      <strong>{item.categoria}</strong>
                      <span>{item.estabelecimento || "Sem estabelecimento"}</span>
                      <small>{formatDiaMes(item.data)}</small>
                    </span>
                    <span className="gr-linha-side">
                      <strong>{formatBRL(item.valor)}</strong>
                      {badge ? <span className="termo-badge" data-tone={badge.tom}>{badge.rotulo}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="gr-vazio">
            <p className="gr-legenda">Nenhuma pendência neste período.</p>
            <button type="button" className="termo-text-button" onClick={() => onFiltro("todas")}>Ver todas</button>
          </div>
        )}
      </section>
      {aberta ? <DespesaDetalheDialog despesa={aberta} onClose={fecharDetalhe} /> : null}
    </div>
  );
}
