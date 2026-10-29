import { useId, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./icons";
import { FotosChecklist } from "./FotosChecklist";
import { CHECKLIST_ORIGEM } from "../domain/checklists";
import { origemLabel, PADROES_DIAS_CARREGADOS, plural, type ChecklistGestao } from "../domain/gestaoChecklists";
import {
  calcularPadroes,
  itensNaoOk,
  MIN_TROCAS_ENTREGADOR,
  normalizarRotulo,
  PERIODOS_PADROES,
  RECORRENCIA_JANELA,
  RECORRENCIA_MINIMO,
  TOP_PROBLEMAS_FROTA,
  type PadraoEntregador,
  type ParContagem,
  type PeriodoPadroes
} from "../domain/padroesChecklists";

// Aba "Padrões": contagens por quem entregou, por veículo e da frota. Cada linha abre os checklists que formam o número.

type Abrir = { podeAbrir: (id: string) => boolean; onAbrir: (id: string) => void };
type Linha = Abrir & { aberta: string; alternar: (chave: string) => void; porId: Map<string, ChecklistGestao> };

const formatDay = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const tomPercentual = (percentual: number) => (percentual >= 50 ? "is-danger" : percentual > 0 ? "is-warning" : "is-neutral");
const paresTexto = (pares: ParContagem[]) => pares.map((par) => `${par.item}: ${par.problema} (${par.quantidade})`).join(" · ") || "Nenhum item Não OK";

// `aberta` vem do pai para a linha continuar aberta ao voltar de "Abrir checklist".
export function PadroesTab({ checklists, loading, failed, periodo, onPeriodo, aberta, onAberta, onRetry, podeAbrir, onAbrir }: Abrir & {
  checklists: ChecklistGestao[] | null;
  loading: boolean;
  failed: boolean;
  periodo: PeriodoPadroes;
  onPeriodo: (periodo: PeriodoPadroes) => void;
  aberta: string;
  onAberta: (chave: string) => void;
  onRetry: () => void;
}) {
  const padroes = useMemo(() => (checklists ? calcularPadroes(checklists, periodo) : null), [checklists, periodo]);
  const porId = useMemo(() => new Map((checklists ?? []).map((item) => [item.id, item])), [checklists]);
  const linha: Linha = { aberta, alternar: (chave) => onAberta(aberta === chave ? "" : chave), porId, podeAbrir, onAbrir };
  const trocarPeriodo = (dias: PeriodoPadroes) => { onAberta(""); onPeriodo(dias); };
  const resumo = padroes
    ? `${padroes.total} ${plural(padroes.total, "checklist enviado", "checklists enviados")} desde ${formatDay(padroes.desde)} · ${padroes.trocas} ${plural(padroes.trocas, "troca", "trocas")}.${padroes.total ? " Toque numa linha para ver os checklists e as fotos." : ""}`
    : loading ? `Carregando os checklists enviados nos últimos ${PADROES_DIAS_CARREGADOS} dias…` : "";

  return (
    <div className="padroes-stack">
      <section className="gestao-card" aria-labelledby="pad-title">
        <div className="gestao-card-head">
          <div><span className="gestao-eyebrow">Checklists enviados</span><h2 id="pad-title">Padrões</h2></div>
          <div className="gestao-segmented is-three padroes-periodo" role="group" aria-label="Período" style={{ "--pos": PERIODOS_PADROES.indexOf(periodo) } as CSSProperties}>
            <span className="gestao-segmented-thumb" aria-hidden="true" />
            {PERIODOS_PADROES.map((dias) => <button key={dias} type="button" aria-pressed={periodo === dias} onClick={() => trocarPeriodo(dias)}>{dias} dias</button>)}
          </div>
        </div>
        {resumo ? <p className="gestao-hint padroes-resumo" aria-live="polite">{resumo}</p> : null}
        {padroes?.destaques.length ? (
          <div className="padroes-destaques">
            <span className="gestao-eyebrow">Destaques</span>
            <div role="list">
              {padroes.destaques.map((destaque, index) => (
                <PadraoLinha key={destaque.chave} chave={`des-${destaque.chave}`} className="is-destaque" index={index} ids={destaque.checklistIds} foco={normalizarRotulo(destaque.item)} {...linha}>
                  <Icon name="alert" size={16} />
                  <span className="padroes-item">{destaque.texto}</span>
                </PadraoLinha>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {loading && !checklists ? (
        <section className="gestao-card" aria-label="Carregando padrões">
          {[0, 1, 2].map((index) => <span key={index} className="gestao-row-skeleton" aria-hidden="true" />)}
        </section>
      ) : null}

      {failed && !checklists && !loading ? (
        <section className="gestao-card">
          <div className="gestao-empty">
            <Icon name="errorCircle" size={32} />
            <strong>Não foi possível carregar os padrões</strong>
            <p>Confira a conexão e tente de novo.</p>
            <button type="button" className="gestao-button is-secondary is-compact" onClick={onRetry}><Icon name="refresh" size={14} />Tentar de novo</button>
          </div>
        </section>
      ) : null}

      {padroes && !padroes.total ? (
        <section className="gestao-card">
          <div className="gestao-empty">
            <Icon name="clipboardCheck" size={32} />
            <strong>Nenhum checklist enviado nos últimos {periodo} dias</strong>
            <p>Escolha um período maior ou volte depois das próximas vistorias.</p>
          </div>
        </section>
      ) : null}

      {padroes && padroes.total ? (
        <>
          <section className="gestao-card" aria-labelledby="pad-ent-title">
            <div className="gestao-card-head">
              <div><span className="gestao-eyebrow">Checklists de troca</span><h2 id="pad-ent-title">Por quem entregou</h2></div>
              <span className="gestao-hint">Só quem entregou {MIN_TROCAS_ENTREGADOR} carros ou mais no período</span>
            </div>
            {padroes.porEntregador.length ? (
              <div role="list">
                {padroes.porEntregador.map((item, index) => (
                  <PadraoLinha key={item.chave} chave={`ent-${item.chave}`} className="is-entregador" index={index} ids={item.checklistIds} {...linha}>
                    <EntregadorCelulas linha={item} />
                  </PadraoLinha>
                ))}
              </div>
            ) : (
              <div className="gestao-empty">
                <Icon name="users" size={32} />
                <strong>Ninguém com {MIN_TROCAS_ENTREGADOR} trocas ou mais</strong>
                <p>Para não marcar ninguém por um caso isolado, a tabela só mostra quem entregou pelo menos {MIN_TROCAS_ENTREGADOR} carros no período.</p>
              </div>
            )}
            {padroes.naoIdentificado ? (
              <>
                <p className="padroes-sep">Sem entregador identificado pela Infleet: não é atribuído a ninguém.</p>
                <div role="list">
                  <PadraoLinha chave="ent-nao-identificado" className="is-entregador" index={0} ids={padroes.naoIdentificado.checklistIds} {...linha}>
                    <EntregadorCelulas linha={padroes.naoIdentificado} />
                  </PadraoLinha>
                </div>
              </>
            ) : null}
          </section>

          <section className="gestao-card" aria-labelledby="pad-vei-title">
            <div className="gestao-card-head">
              <div><span className="gestao-eyebrow">Frota própria</span><h2 id="pad-vei-title">Por veículo</h2></div>
              <span className="gestao-hint">Mesmo item Não OK em {RECORRENCIA_MINIMO} dos últimos {RECORRENCIA_JANELA} checklists</span>
            </div>
            {padroes.porVeiculo.length ? (
              <div role="list">
                {padroes.porVeiculo.map((item, index) => (
                  <PadraoLinha key={`${item.veiculoId}-${item.item}`} chave={`vei-${item.veiculoId}-${normalizarRotulo(item.item)}`} className="is-veiculo" index={index} ids={item.checklistIds} foco={normalizarRotulo(item.item)} {...linha}>
                    <span className="frota-cell"><strong>{item.placa || "Veículo"}</strong><small>Último Não OK em {formatDay(item.ultimaEm)}</small></span>
                    <span className="padroes-item">{item.item} — {item.problemas.join(", ")} ({item.ocorrencias} de {item.janela})</span>
                    <span><span className="gestao-badge is-danger">Recorrente</span></span>
                  </PadraoLinha>
                ))}
              </div>
            ) : (
              <div className="gestao-empty">
                <Icon name="car" size={32} />
                <strong>Nenhum item recorrente</strong>
                <p>Aparece aqui quando o mesmo item fica Não OK em {RECORRENCIA_MINIMO} dos últimos {RECORRENCIA_JANELA} checklists do carro.</p>
              </div>
            )}
          </section>

          <section className="gestao-card" aria-labelledby="pad-fro-title">
            <div className="gestao-card-head">
              <div><span className="gestao-eyebrow">Item e problema</span><h2 id="pad-fro-title">Problemas mais comuns da frota</h2></div>
              <span className="gestao-hint">Os {TOP_PROBLEMAS_FROTA} mais frequentes no período</span>
            </div>
            {padroes.problemasFrota.length ? (
              <div role="list">
                {padroes.problemasFrota.map((par, index) => (
                  <PadraoLinha key={`${par.item}-${par.problema}`} chave={`fro-${normalizarRotulo(par.item)}-${normalizarRotulo(par.problema)}`} className="is-frota" index={index} ids={par.checklistIds} foco={normalizarRotulo(par.item)} {...linha}>
                    <span className="mod-item-index" aria-hidden="true">{index + 1}</span>
                    <span className="padroes-item">{par.item} — {par.problema}</span>
                    <span className="padroes-num">{par.quantidade} {plural(par.quantidade, "checklist", "checklists")}</span>
                  </PadraoLinha>
                ))}
              </div>
            ) : (
              <div className="gestao-empty">
                <Icon name="checkCircle" size={32} />
                <strong>Nenhum item Não OK no período</strong>
                <p>Todos os checklists enviados vieram com os itens OK.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function EntregadorCelulas({ linha }: { linha: PadraoEntregador }) {
  return (
    <>
      <span className="frota-cell"><strong>{linha.nome}</strong><small>{paresTexto(linha.principais)}</small></span>
      <span className="padroes-num">{linha.trocas} {plural(linha.trocas, "troca", "trocas")}</span>
      <span className="padroes-num">{linha.comProblema} com problema</span>
      <span><span className={`gestao-badge ${tomPercentual(linha.percentual)}`}>{linha.percentual}%</span></span>
    </>
  );
}

function PadraoLinha({ chave, className, index, ids, foco, aberta, alternar, porId, podeAbrir, onAbrir, children }: Linha & {
  chave: string;
  className: string;
  index: number;
  ids: string[];
  foco?: string;
  children: ReactNode;
}) {
  const expandida = aberta === chave;
  // Id do painel por useId: a chave tem rótulos com espaço, que não servem em aria-controls.
  const painel = useId();
  return (
    <div role="listitem">
      <button type="button" className={`padroes-row ${className}`} aria-expanded={expandida} aria-controls={expandida ? painel : undefined} style={{ "--i": Math.min(index, 12) } as CSSProperties} onClick={() => alternar(chave)}>
        {children}
        <Icon name="chevronRight" size={16} className="gestao-list-chevron" />
      </button>
      {expandida ? <ChecklistsDoNumero id={painel} ids={ids} foco={foco} porId={porId} podeAbrir={podeAbrir} onAbrir={onAbrir} /> : null}
    </div>
  );
}

function ChecklistsDoNumero({ id, ids, foco, porId, podeAbrir, onAbrir }: Abrir & { id: string; ids: string[]; foco?: string; porId: Map<string, ChecklistGestao> }) {
  const lista = ids.map((chk) => porId.get(chk)).filter((item): item is ChecklistGestao => Boolean(item));
  return (
    <div id={id} className="padroes-lista">
      <span className="gestao-eyebrow">{lista.length} {plural(lista.length, "checklist", "checklists")} neste número</span>
      {lista.map((item) => {
        const problemas = itensNaoOk(item).filter((entry) => !foco || normalizarRotulo(entry.item) === foco);
        const quem = item.origem === CHECKLIST_ORIGEM.troca
          ? `Troca · recebido por ${item.motoristaNome || "motorista não informado"} · entregue por ${item.entreguePorNome || "não identificado"}`
          : `${origemLabel(item)} · ${item.motoristaNome || "motorista não informado"}`;
        return (
          <div key={item.id} className="padroes-chk">
            <div className="padroes-chk-top">
              <strong>{item.placa || "Veículo"} · {formatDay(item.concluidoEm)}</strong>
              {podeAbrir(item.id) ? <button type="button" className="gestao-button is-secondary is-compact" onClick={() => onAbrir(item.id)}><Icon name="eye" size={14} />Abrir checklist</button> : null}
            </div>
            <small>{quem}</small>
            {problemas.length ? problemas.map((entry) => (
              <span key={entry.resposta.chave} className="chk-problem">
                <span className="padroes-problema"><span className="gestao-badge is-danger">Não OK</span>{entry.item}: {entry.problemas.join(" · ")}</span>
                {entry.resposta.observacao ? <small>{entry.resposta.observacao}</small> : null}
                {entry.resposta.fotos.length ? <FotosChecklist fotos={entry.resposta.fotos} rotulo={entry.item} /> : null}
              </span>
            )) : <span className="gestao-badge is-success">Itens OK</span>}
          </div>
        );
      })}
    </div>
  );
}
