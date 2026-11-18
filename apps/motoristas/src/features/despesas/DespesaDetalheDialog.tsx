import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { BrandLoader } from "../../shared/ui/BrandLoader";
import { useDetalheDialog } from "./useDetalheDialog";
import { carregarArquivoComprovante, carregarDetalheDespesa, type AnexoDespesa, type ArquivoComprovante, type DespesaDetalhe } from "./despesaDetalhe";
import { formatDataHora } from "../termos/termosMulta";
import { DevolucaoPainel, GUARDA_VAZIA, MotivoDevolucao, type GuardaDevolucao } from "./DevolucaoPainel";
import { SELO_DEVOLUCAO, cancelarEmDobro, dependenciasRemotas, estadoDevolucao, guardarRascunho } from "./devolucao";
import { reportAppError } from "../../shared/appErrorLogger";
import { ANEXO_SEM_COMPROVANTE, STATUS_DESPESA, ehPendente, formatBRL, type DespesaRelatorio } from "./gastosRelatorio";

export const STATUS_BADGE: Record<number, { rotulo: string; tom: string }> = {
  [STATUS_DESPESA.enviado]: { rotulo: "Enviado", tom: "neutro" },
  [STATUS_DESPESA.validado]: { rotulo: "Validado", tom: "sucesso" },
  [STATUS_DESPESA.precisaCorrigir]: { rotulo: "Precisa corrigir", tom: "atencao" },
  [STATUS_DESPESA.recusado]: { rotulo: "Recusado", tom: "erro" }
};

const LITROS = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

type Estado<T> = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "pronto"; valor: T };

/** Um comprovante: baixa pelo flow ao montar e revoga o blob URL ao desmontar. */
function Comprovante({ anexo, indice }: { anexo: AnexoDespesa; indice: number }) {
  const [estado, setEstado] = useState<Estado<ArquivoComprovante>>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    let url = "";
    setEstado({ tipo: "carregando" });
    carregarArquivoComprovante(anexo)
      .then((arquivo) => {
        url = arquivo.url;
        if (vivo) setEstado({ tipo: "pronto", valor: arquivo });
        else URL.revokeObjectURL(url);
      })
      .catch((erro: unknown) => { if (vivo) setEstado({ tipo: "erro", mensagem: erro instanceof Error ? erro.message : "Não foi possível carregar o comprovante." }); });
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [anexo, tentativa]);

  if (estado.tipo === "carregando") return <div className="gr-comprovante"><BrandLoader variant="inline" size="md" label="Carregando comprovante" /></div>;
  if (estado.tipo === "erro") {
    return (
      <div className="gr-comprovante gr-comprovante--erro">
        <p>{estado.mensagem}</p>
        <button type="button" className="termo-text-button" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</button>
      </div>
    );
  }
  const { valor } = estado;
  if (valor.mime.startsWith("image/")) {
    return (
      <a className="gr-comprovante" href={valor.url} target="_blank" rel="noreferrer" aria-label={`Abrir comprovante ${indice + 1} em tela cheia`}>
        <img src={valor.url} alt={`Comprovante ${indice + 1}`} />
      </a>
    );
  }
  return (
    <div className="gr-comprovante gr-comprovante--arquivo">
      <p>{valor.nome}</p>
      <a className="termo-text-button" href={valor.url} target="_blank" rel="noreferrer">Abrir arquivo</a>
    </div>
  );
}

type DialogProps = {
  despesa: DespesaRelatorio;
  onClose: () => void;
  /** Id do motorista, usado ao anexar o comprovante novo de uma despesa devolvida. */
  motoristaId?: string;
  /** Devolvida reenviada: a lista troca o selo na hora, sem esperar a releitura. */
  onDevolucaoEnviada?: (id: string, explicacao: string, alteracoes?: Partial<DespesaRelatorio>) => void;
  /** "Lancei em dobro": cancelada; a lista tira a despesa na hora. */
  onDevolucaoCancelada?: (id: string) => void;
};

/**
 * Detalhe de uma despesa, em painel de quase tela cheia. Fecha no X, no Esc e tocando fora.
 * Só a despesa devolvida (Precisa corrigir) tem ações: trocar o comprovante, corrigir dados e/ou explicar, ou cancelar o lançamento em dobro. O valor nunca é editável.
 */
export function DespesaDetalheDialog({ despesa, onClose, motoristaId = "", onDevolucaoEnviada, onDevolucaoCancelada }: DialogProps) {
  const guardaRef = useRef<GuardaDevolucao>(GUARDA_VAZIA);
  const [confirmando, setConfirmando] = useState<"descartar" | "dobro" | null>(null);
  const [enviada, setEnviada] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [falhouCancelar, setFalhouCancelar] = useState(false);
  const cancelandoRef = useRef(false);
  // Durante o envio ou o cancelamento não fecha; com algo digitado ou escolhido pergunta antes de descartar.
  const tentarFechar = useCallback(() => {
    if (guardaRef.current.enviando || cancelandoRef.current) return;
    // Com uma confirmação aberta (ex.: "Cancelar este gasto?"), Esc/toque fora não a troca por outra.
    if (guardaRef.current.sujo) { setConfirmando((atual) => atual ?? "descartar"); return; }
    onClose();
  }, [onClose]);
  const fecharRef = useDetalheDialog(tentarFechar);
  const [carga, setCarga] = useState<Estado<{ detalhe: DespesaDetalhe; anexos: AnexoDespesa[] }>>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarga({ tipo: "carregando" });
    carregarDetalheDespesa(despesa.id)
      .then((valor) => { if (vivo) setCarga({ tipo: "pronto", valor }); })
      .catch(() => { if (vivo) setCarga({ tipo: "erro", mensagem: "Não foi possível carregar os detalhes deste gasto." }); });
    return () => { vivo = false; };
  }, [despesa.id, tentativa]);

  const estado = enviada ? "conferencia" : estadoDevolucao(despesa);
  const comAcoes = estado === "acao";
  const badge = estado ? SELO_DEVOLUCAO[estado] : STATUS_BADGE[despesa.status];
  const semComprovante = despesa.statusAnexo != null && ANEXO_SEM_COMPROVANTE.includes(despesa.statusAnexo);
  const detalhe = carga.tipo === "pronto" ? carga.valor.detalhe : null;
  const anexos = carga.tipo === "pronto" ? carga.valor.anexos : [];
  const proximaOrdem = Math.max(0, ...anexos.map((anexo) => anexo.ordem)) + 1;
  const campos: [string, string][] = [
    ["Data do gasto", DATA_LONGA.format(new Date(`${despesa.data}T00:00:00Z`))],
    ["Categoria", despesa.categoria],
    ["Estabelecimento", despesa.estabelecimento],
    ["Forma de pagamento", detalhe?.formaPagamento ?? ""],
    ["Cidade", detalhe?.cidade ?? ""],
    ["Veículo", detalhe?.veiculo ?? ""],
    ["Serviço", detalhe?.reserva ?? ""],
    ["Litros", despesa.litros ? `${LITROS.format(despesa.litros)} L · ${formatBRL(despesa.valor / despesa.litros)}/L` : ""],
    ["KM informado", despesa.km ? String(despesa.km) : ""],
    ["Descrição", detalhe?.observacao ?? ""],
    ["Status financeiro", detalhe?.statusFinanceiro ?? ""],
    ["Origem", detalhe?.origem ?? ""],
    ["Enviado em", detalhe?.criadoEm ? formatDataHora(detalhe.criadoEm) : ""]
  ];
  const visiveis = campos.filter(([, valor]) => valor);

  const cancelarDespesa = async () => {
    if (cancelandoRef.current) return;
    cancelandoRef.current = true;
    setCancelando(true);
    setFalhouCancelar(false);
    try {
      await cancelarEmDobro(dependenciasRemotas({ despesaId: despesa.id, nome: detalhe?.nome ?? "", motoristaId, ordem: proximaOrdem }));
      guardaRef.current.descartar();
      // Cancelada não volta a ser corrigida: o rascunho da explicação não fica no aparelho.
      guardarRascunho(despesa.id, "");
      onDevolucaoCancelada?.(despesa.id);
      onClose();
    } catch (erro) {
      setFalhouCancelar(true);
      reportAppError(erro, { severity: "warning", source: "app", action: "cancelarDespesaEmDobro", notifyUser: false });
    } finally {
      cancelandoRef.current = false;
      setCancelando(false);
    }
  };

  return createPortal(
    <div className="gr-detalhe-overlay" role="dialog" aria-modal="true" aria-labelledby="gr-detalhe-titulo" onClick={tentarFechar}>
      <div className="gr-detalhe" onClick={(event) => event.stopPropagation()}>
        <header className="gr-detalhe-topo">
          <div className="gr-detalhe-titulos">
            <h2 id="gr-detalhe-titulo">{despesa.categoria}</h2>
            <strong className="gr-detalhe-valor">{formatBRL(despesa.valor)}</strong>
          </div>
          {badge ? <span className="termo-badge" data-tone={badge.tom}>{badge.rotulo}</span> : null}
          <button ref={fecharRef} type="button" className="gr-detalhe-fechar" aria-label="Fechar" onClick={tentarFechar}><SystemIcon name="dismiss" /></button>
        </header>
        <div className="gr-detalhe-corpo">
          {estado === "acao" || estado === "gestor" ? <MotivoDevolucao despesa={despesa} /> : null}
          {estado === "gestor" ? <p className="gr-detalhe-aviso" role="status">Seu gestor está olhando este gasto. Você não precisa fazer nada agora.</p> : null}
          {estado === "conferencia" ? <p className="dv-sucesso" role="status">Enviado para nova conferência.</p> : null}
          {estado === null && ehPendente(despesa) ? (
            <p className="gr-detalhe-aviso">
              {despesa.status === STATUS_DESPESA.recusado ? "Este gasto foi recusado." : "O financeiro pediu correção neste gasto."} Fale com o financeiro para resolver.
            </p>
          ) : null}

          {/* Ações logo após o motivo: o motorista vê o que fazer sem rolar o comprovante. */}
          {comAcoes ? (
            <DevolucaoPainel
              despesa={despesa}
              nome={detalhe?.nome ?? ""}
              ordem={proximaOrdem}
              motoristaId={motoristaId}
              guardaRef={guardaRef}
              anexosProntos={carga.tipo === "pronto"}
              veiculoRotulo={detalhe?.veiculo ?? ""}
              onEnviada={(explicacao, alteracoes) => { setEnviada(true); onDevolucaoEnviada?.(despesa.id, explicacao, alteracoes); }}
              onLancouEmDobro={() => { setFalhouCancelar(false); setConfirmando("dobro"); }}
            />
          ) : null}

          <section aria-labelledby="gr-detalhe-comprovantes">
            <h3 className="gr-subtitulo" id="gr-detalhe-comprovantes">{estado === "acao" ? "Comprovante atual" : "Comprovante"}</h3>
            {carga.tipo === "carregando" ? <div className="gr-comprovante"><BrandLoader variant="inline" size="md" label="Carregando comprovante" /></div> : null}
            {carga.tipo === "pronto" && anexos.length ? (
              <div className="gr-comprovantes">{anexos.map((anexo, i) => <Comprovante key={anexo.id} anexo={anexo} indice={i} />)}</div>
            ) : null}
            {carga.tipo === "pronto" && !anexos.length ? <p className="gr-legenda">{semComprovante ? "Gasto enviado sem comprovante." : "O comprovante ainda não está disponível."}</p> : null}
          </section>

          <section aria-labelledby="gr-detalhe-dados">
            <h3 className="gr-subtitulo" id="gr-detalhe-dados">Dados do gasto</h3>
            <dl className="gr-detalhe-campos">
              {visiveis.map(([rotulo, valor]) => (
                <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>
              ))}
            </dl>
            {carga.tipo === "carregando" ? <BrandLoader variant="inline" size="sm" label="Carregando os outros dados" text="Carregando os outros dados" /> : null}
            {carga.tipo === "erro" ? (
              <div className="gr-vazio">
                <p className="gr-legenda">{carga.mensagem}</p>
                <button type="button" className="termo-text-button" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</button>
              </div>
            ) : null}
          </section>
        </div>
        {confirmando === "descartar" ? (
          <div className="dv-confirmar" role="alertdialog" aria-labelledby="dv-confirmar-titulo">
            <strong id="dv-confirmar-titulo">Descartar alterações?</strong>
            <p>A foto escolhida, os dados corrigidos e o texto novo ficam de fora.</p>
            <div className="dv-confirmar-acoes">
              <button type="button" className="dv-acao" onClick={() => setConfirmando(null)}>Continuar editando</button>
              <button type="button" className="dv-acao" onClick={() => { guardaRef.current.descartar(); onClose(); }}>Descartar</button>
            </div>
          </div>
        ) : null}
        {confirmando === "dobro" ? (
          <div className="dv-confirmar" role="alertdialog" aria-labelledby="dv-dobro-titulo">
            <strong id="dv-dobro-titulo">Cancelar este gasto?</strong>
            <p>Use só se você lançou o mesmo gasto duas vezes. Ele sai da sua lista e não vai para o financeiro.</p>
            {falhouCancelar ? <p className="dv-aviso" role="alert">Não deu para cancelar agora. Tente de novo quando o sinal melhorar.</p> : null}
            <div className="dv-confirmar-acoes">
              <button type="button" className="dv-acao" disabled={cancelando} onClick={() => setConfirmando(null)}>Voltar</button>
              <button type="button" className="dv-acao" disabled={cancelando} aria-busy={cancelando} onClick={() => { void cancelarDespesa(); }}>{cancelando ? "Cancelando…" : falhouCancelar ? "Tentar de novo" : "Cancelar gasto"}</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
