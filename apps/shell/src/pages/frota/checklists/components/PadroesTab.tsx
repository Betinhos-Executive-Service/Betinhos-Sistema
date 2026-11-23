import { useId, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Button, EmptyState, SegmentedControl, StatusBadge, Surface, type StatusTone } from "@betinhos/ui";
import { Car, ChevronRight, CircleAlert, CircleCheck, ClipboardCheck, Eye, RefreshCw, TriangleAlert, Users } from "lucide-react";
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
import { BrandLoader } from "../../../../app/BrandLoader";

// Aba "Padrões": contagens por quem entregou, por veículo e da frota. Cada linha abre os checklists que formam o número.

type Abrir = { podeAbrir: (id: string) => boolean; onAbrir: (id: string) => void };
type Linha = Abrir & { aberta: string; alternar: (chave: string) => void; porId: Map<string, ChecklistGestao> };

const formatDay = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const tomPercentual = (percentual: number): StatusTone => (percentual >= 50 ? "danger" : percentual > 0 ? "warning" : "neutral");
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
      <Surface eyebrow="Checklists enviados" title="Padrões" action={
        <SegmentedControl aria-label="Período" size="compact" value={String(periodo)} options={PERIODOS_PADROES.map((dias) => ({ value: String(dias), label: `${dias} dias` }))}
          onChange={(dias) => trocarPeriodo(Number(dias) as PeriodoPadroes)} />
      }>
        {resumo ? <p className="bt-field__hint padroes-resumo" aria-live="polite">{resumo}</p> : null}
        {padroes?.destaques.length ? (
          <div className="padroes-destaques">
            <span className="bt-surface__eyebrow">Destaques</span>
            <div role="list">
              {padroes.destaques.map((destaque, index) => (
                <PadraoLinha key={destaque.chave} chave={`des-${destaque.chave}`} className="is-destaque" index={index} ids={destaque.checklistIds} foco={normalizarRotulo(destaque.item)} {...linha}>
                  <TriangleAlert size={16}/>
                  <span className="padroes-item">{destaque.texto}</span>
                </PadraoLinha>
              ))}
            </div>
          </div>
        ) : null}
      </Surface>

      {loading && !checklists ? (
        <Surface>
          <BrandLoader variant="inline" size="md" label="Carregando padrões" text="Carregando padrões…" />
        </Surface>
      ) : null}

      {failed && !checklists && !loading ? (
        <Surface>
          <EmptyState tone="danger" icon={<CircleAlert size={32} />} title="Não foi possível carregar os padrões"
            action={<Button variant="secondary" size="compact" icon={<RefreshCw size={14} />} onClick={onRetry}>Tentar de novo</Button>}>
            Confira a conexão e tente de novo.
          </EmptyState>
        </Surface>
      ) : null}

      {padroes && !padroes.total ? (
        <Surface>
          <EmptyState icon={<ClipboardCheck size={32} />} title={`Nenhum checklist enviado nos últimos ${periodo} dias`}>
            Escolha um período maior ou volte depois das próximas vistorias.
          </EmptyState>
        </Surface>
      ) : null}

      {padroes && padroes.total ? (
        <>
          <Surface eyebrow="Checklists de troca" title="Por quem entregou" action={<span className="bt-field__hint">Só quem entregou {MIN_TROCAS_ENTREGADOR} carros ou mais no período</span>}>
            {padroes.porEntregador.length ? (
              <div role="list">
                {padroes.porEntregador.map((item, index) => (
                  <PadraoLinha key={item.chave} chave={`ent-${item.chave}`} className="is-entregador" index={index} ids={item.checklistIds} {...linha}>
                    <EntregadorCelulas linha={item} />
                  </PadraoLinha>
                ))}
              </div>
            ) : (
              <EmptyState compact icon={<Users size={24} />} title={`Ninguém com ${MIN_TROCAS_ENTREGADOR} trocas ou mais`}>
                Para não marcar ninguém por um caso isolado, a tabela só mostra quem entregou pelo menos {MIN_TROCAS_ENTREGADOR} carros no período.
              </EmptyState>
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
          </Surface>

          <Surface eyebrow="Frota própria" title="Por veículo" action={<span className="bt-field__hint">Mesmo item Não OK em {RECORRENCIA_MINIMO} dos últimos {RECORRENCIA_JANELA} checklists</span>}>
            {padroes.porVeiculo.length ? (
              <div role="list">
                {padroes.porVeiculo.map((item, index) => (
                  <PadraoLinha key={`${item.veiculoId}-${item.item}`} chave={`vei-${item.veiculoId}-${normalizarRotulo(item.item)}`} className="is-veiculo" index={index} ids={item.checklistIds} foco={normalizarRotulo(item.item)} {...linha}>
                    <span className="frota-cell"><strong>{item.placa || "Veículo"}</strong><small>Último Não OK em {formatDay(item.ultimaEm)}</small></span>
                    <span className="padroes-item">{item.item} — {item.problemas.join(", ")} ({item.ocorrencias} de {item.janela})</span>
                    <span><StatusBadge tone="danger">Recorrente</StatusBadge></span>
                  </PadraoLinha>
                ))}
              </div>
            ) : (
              <EmptyState compact icon={<Car size={24} />} title="Nenhum item recorrente">
                Aparece aqui quando o mesmo item fica Não OK em {RECORRENCIA_MINIMO} dos últimos {RECORRENCIA_JANELA} checklists do carro.
              </EmptyState>
            )}
          </Surface>

          <Surface eyebrow="Item e problema" title="Problemas mais comuns da frota" action={<span className="bt-field__hint">Os {TOP_PROBLEMAS_FROTA} mais frequentes no período</span>}>
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
              <EmptyState compact icon={<CircleCheck size={24} />} title="Nenhum item Não OK no período">
                Todos os checklists enviados vieram com os itens OK.
              </EmptyState>
            )}
          </Surface>
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
      <span><StatusBadge tone={tomPercentual(linha.percentual)}>{linha.percentual}%</StatusBadge></span>
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
        <ChevronRight size={16} className="gestao-list-chevron"/>
      </button>
      {expandida ? <ChecklistsDoNumero id={painel} ids={ids} foco={foco} porId={porId} podeAbrir={podeAbrir} onAbrir={onAbrir} /> : null}
    </div>
  );
}

function ChecklistsDoNumero({ id, ids, foco, porId, podeAbrir, onAbrir }: Abrir & { id: string; ids: string[]; foco?: string; porId: Map<string, ChecklistGestao> }) {
  const lista = ids.map((chk) => porId.get(chk)).filter((item): item is ChecklistGestao => Boolean(item));
  return (
    <div id={id} className="padroes-lista">
      <span className="bt-surface__eyebrow">{lista.length} {plural(lista.length, "checklist", "checklists")} neste número</span>
      {lista.map((item) => {
        const problemas = itensNaoOk(item).filter((entry) => !foco || normalizarRotulo(entry.item) === foco);
        const quem = item.origem === CHECKLIST_ORIGEM.troca
          ? `Troca · recebido por ${item.motoristaNome || "motorista não informado"} · entregue por ${item.entreguePorNome || "não identificado"}`
          : `${origemLabel(item)} · ${item.motoristaNome || "motorista não informado"}`;
        return (
          <div key={item.id} className="padroes-chk">
            <div className="padroes-chk-top">
              <strong>{item.placa || "Veículo"} · {formatDay(item.concluidoEm)}</strong>
              {podeAbrir(item.id) ? <Button variant="secondary" size="compact" icon={<Eye size={14} />} onClick={() => onAbrir(item.id)}>Abrir checklist</Button> : null}
            </div>
            <small>{quem}</small>
            {problemas.length ? problemas.map((entry) => (
              <span key={entry.resposta.chave} className="chk-problem">
                <span className="padroes-problema"><StatusBadge tone="danger">Não OK</StatusBadge>{entry.item}: {entry.problemas.join(" · ")}</span>
                {entry.resposta.observacao ? <small>{entry.resposta.observacao}</small> : null}
                {entry.resposta.fotos.length ? <FotosChecklist fotos={entry.resposta.fotos} rotulo={entry.item} /> : null}
              </span>
            )) : <StatusBadge tone="success">Itens OK</StatusBadge>}
          </div>
        );
      })}
    </div>
  );
}
