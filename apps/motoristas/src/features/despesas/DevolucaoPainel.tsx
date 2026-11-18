import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ImagemOuPdf } from "../fotos/ImagemOuPdf";
import { acceptDaGaleria, provaCaptura, type SessaoProva } from "../fotos/provaCaptura";
import { reportAppError } from "../../shared/appErrorLogger";
import { SelectField, TextInputField } from "../../shared/ui/FormFields";
import { getDriverContext } from "../../data/dataverse/cliente";
import { loadMaintenanceRequestVehiclesRemote, type MaintenanceRequestVehicleOption } from "../manutencao/remoto";
import {
  MIN_EXPLICACAO, MOTIVO_PADRAO, alteracoesParaLista, camposAlterados, dependenciasRemotas, edicaoInicial, enviarDevolucao, guardarRascunho, lerRascunho,
  motivoParaMotorista, validarEdicao, validarEnvio,
  type EdicaoDespesa, type FotoNova, type ProgressoEnvio
} from "./devolucao";
import { DEFAULT_EXPENSE_REFERENCE_DATA } from "./expenses.defaults";
import { findExpenseCategory, getExpenseCategoryRules } from "./expenses.reference";
import type { ExpenseReferenceData } from "./expenses.types";
import { loadExpenseReferenceDataRemote } from "./remoto";
import { isMockGastosCartao } from "./gastosCartao";
import { MOCK_VEICULO, type DespesaRelatorio } from "./gastosRelatorio";

/** O que o painel de detalhe precisa saber para fechar com segurança: há algo digitado/escolhido e se está enviando. */
export type GuardaDevolucao = { sujo: boolean; enviando: boolean; descartar: () => void };

const SAIDA_MS = 120;
/** Estado do guarda quando não há painel de devolução ativo. */
export const GUARDA_VAZIA: GuardaDevolucao = { sujo: false, enviando: false, descartar: () => {} };

/** Motivo da devolução em destaque, no topo do detalhe. Passou de 3 linhas: recolhe e oferece "Ver mais". */
export function MotivoDevolucao({ despesa }: { despesa: Pick<DespesaRelatorio, "motivoDevolucao" | "iaMotivos"> }) {
  const texto = motivoParaMotorista(despesa) || MOTIVO_PADRAO;
  const ref = useRef<HTMLParagraphElement>(null);
  const [aberto, setAberto] = useState(false);
  const [longo, setLongo] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || aberto) return;
    const medir = () => setLongo(el.scrollHeight > el.clientHeight + 1);
    medir();
    const obs = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    obs?.observe(el);
    return () => obs?.disconnect();
  }, [texto, aberto]);
  return (
    <section className="dv-motivo" role="note" aria-labelledby="dv-motivo-titulo">
      <h3 id="dv-motivo-titulo">Por que voltou</h3>
      <p id="dv-motivo-texto" ref={ref} data-recolhido={!aberto}>{texto}</p>
      {longo || aberto ? (
        <button type="button" className="dv-motivo-mais" aria-expanded={aberto} aria-controls="dv-motivo-texto" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Ver menos" : "Ver mais"}
        </button>
      ) : null}
    </section>
  );
}

/** Categorias, formas de pagamento e veículos para corrigir o lançamento. Sem sinal, fica `null` e o painel segue só com foto e explicação. */
function useDadosCorrecao() {
  const [dados, setDados] = useState<{ referenceData: ExpenseReferenceData; veiculos: MaintenanceRequestVehicleOption[] } | null>(null);
  useEffect(() => {
    let vivo = true;
    const mock = isMockGastosCartao();
    const veiculos = mock
      ? Promise.resolve([{ id: MOCK_VEICULO, label: "ABC-1D23 · Spin", isCurrent: true }])
      : getDriverContext().then((motorista) => loadMaintenanceRequestVehiclesRemote(motorista)).catch(() => []);
    Promise.all([mock ? Promise.resolve(DEFAULT_EXPENSE_REFERENCE_DATA) : loadExpenseReferenceDataRemote(), veiculos])
      .then(([referenceData, lista]) => { if (vivo && referenceData.categories.length && referenceData.paymentMethods.length) setDados({ referenceData, veiculos: lista }); })
      .catch(() => { /* sem os dados de referência não dá para corrigir; foto e explicação seguem */ });
    return () => { vivo = false; };
  }, []);
  return dados;
}

type PainelProps = {
  despesa: DespesaRelatorio;
  nome: string;
  /** Posição do comprovante novo: depois dos que já existem. */
  ordem: number;
  motoristaId: string;
  guardaRef: MutableRefObject<GuardaDevolucao>;
  /** Anexos já lidos: a ordem e o nome da pasta do comprovante novo dependem deles. */
  anexosProntos: boolean;
  /** Nome do veículo lançado, para aparecer na lista mesmo fora dos veículos do motorista. */
  veiculoRotulo: string;
  onEnviada: (explicacao: string, alteracoes: Partial<DespesaRelatorio>) => void;
  /** "Lancei em dobro": o detalhe pede a confirmação e cancela. */
  onLancouEmDobro: () => void;
};

/** Três ações de mesmo peso (Nova foto, Corrigir e Explicar, juntas ou separadas) e um envio único. O valor fica travado. */
export function DevolucaoPainel({ despesa, nome, ordem, motoristaId, guardaRef, anexosProntos, veiculoRotulo, onEnviada, onLancouEmDobro }: PainelProps) {
  const [rascunhoInicial] = useState(() => lerRascunho(despesa.id));
  const [explicacao, setExplicacao] = useState(rascunhoInicial);
  const [explicarAberto, setExplicarAberto] = useState(Boolean(rascunhoInicial));
  const [saindo, setSaindo] = useState(false);
  const [foto, setFoto] = useState<FotoNova | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [erroFoto, setErroFoto] = useState("");
  /** Erro de tamanho só aparece depois de tentar enviar; antes, contador neutro. */
  const [tentou, setTentou] = useState(false);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const progresso = useRef<ProgressoEnvio>({ anexado: false });
  /** Foto já enviada e depois trocada/removida: a próxima sobe numa ordem nova, sem repetir a do comprovante descartado. */
  const deslocamento = useRef(0);
  const reiniciarProgresso = () => {
    if (progresso.current.anexado) deslocamento.current += 1;
    progresso.current = { anexado: false };
  };
  const arquivoRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef(0);

  const dados = useDadosCorrecao();
  const referenceData = dados?.referenceData ?? null;
  const inicial = useMemo(() => (referenceData ? edicaoInicial(despesa, referenceData) : null), [despesa, referenceData]);
  const [alteracoes, setAlteracoes] = useState<Partial<EdicaoDespesa>>({});
  const [corrigirAberto, setCorrigirAberto] = useState(false);
  const atual = useMemo(() => (inicial ? { ...inicial, ...alteracoes } : null), [inicial, alteracoes]);
  const mudou = referenceData && inicial && atual ? camposAlterados(inicial, atual, referenceData) : [];
  const errosEdicao = referenceData && inicial && atual ? validarEdicao(inicial, atual, referenceData) : {};
  const edicaoComErro = Object.keys(errosEdicao).length > 0;
  const regras = getExpenseCategoryRules(atual && referenceData ? findExpenseCategory(referenceData, atual.categoriaId) : null);
  const opcoesCategoria = useMemo(() => (referenceData?.categories ?? []).map((item) => ({ value: item.id, label: item.name })), [referenceData]);
  const opcoesPagamento = useMemo(() => (referenceData?.paymentMethods ?? []).map((item) => ({ value: item.id, label: item.name })), [referenceData]);
  const opcoesVeiculo = useMemo(() => {
    const lista = (dados?.veiculos ?? []).map((item) => ({ value: item.id, label: item.isCurrent ? `${item.label} - atual` : item.label }));
    const lancado = despesa.veiculoId;
    return lancado && !lista.some((item) => item.value.toLowerCase() === lancado.toLowerCase()) ? [{ value: lancado, label: veiculoRotulo || "Veículo lançado" }, ...lista] : lista;
  }, [dados, despesa.veiculoId, veiculoRotulo]);
  const mudar = (parcial: Partial<EdicaoDespesa>) => { setAlteracoes((anterior) => ({ ...anterior, ...parcial })); setFalhou(false); };

  const validacao = validarEnvio({ explicacao, temFoto: Boolean(foto), temAlteracao: mudou.length > 0 });
  // Foto nova só sobe depois de saber quantos comprovantes já existem (senão repete a ordem 1 e a pasta errada).
  const aguardandoAnexos = Boolean(foto) && !anexosProntos;
  const semAcao = !foto && !explicacao.trim() && mudou.length === 0;
  const mostraErro = tentou && Boolean(validacao.erro);
  const caracteres = explicacao.trim().length;
  const sujo = Boolean(foto) || mudou.length > 0 || (explicacao.trim() !== "" && explicacao !== rascunhoInicial);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => {
    guardaRef.current = {
      sujo,
      enviando,
      // Volta ao que havia ao abrir: o rascunho guardado antes (não alterado) não se perde.
      descartar: () => { setFoto(null); setAlteracoes({}); setExplicacao(rascunhoInicial); guardarRascunho(despesa.id, rascunhoInicial); }
    };
    // Painel saiu (enviado): nada mais a proteger ao fechar o detalhe.
    return () => { guardaRef.current = GUARDA_VAZIA; };
  }, [sujo, enviando, despesa.id, guardaRef, rascunhoInicial]);

  const alternarExplicar = () => {
    window.clearTimeout(timerRef.current);
    if (!explicarAberto) { setSaindo(false); setExplicarAberto(true); return; }
    setSaindo(true);
    timerRef.current = window.setTimeout(() => { setExplicarAberto(false); setSaindo(false); }, SAIDA_MS);
  };

  const mudarTexto = (valor: string) => {
    setExplicacao(valor);
    guardarRascunho(despesa.id, valor);
    setFalhou(false);
  };

  // Prova de mídia (fase 2): o comprovante da devolução passa pelas regras da galeria (PDF até 10 MB e 20 páginas,
  // data gravada, repetida recusada). A sessão é aberta uma vez por painel, no registro real da despesa.
  const sessaoProvaRef = useRef<Promise<SessaoProva> | null>(null);

  const escolherFoto = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErroFoto("");
    try {
      sessaoProvaRef.current ??= provaCaptura().iniciar({ tela: "devolucao", tabela: "cr40f_despesaoperacional", registroId: despesa.id });
      const resultado = await provaCaptura().prepararDaGaleria(await sessaoProvaRef.current, arquivo, { referencia: despesa.data });
      if (!resultado.ok) { setErroFoto(resultado.erro); return; }
      if (resultado.tipo === "video") { setErroFoto("Vídeo indisponível nesta tela."); return; }
      setFoto({ dataUrl: resultado.dataUrl, fileName: arquivo.name });
      reiniciarProgresso();
      setFalhou(false);
    } catch {
      setErroFoto("Não deu para abrir essa foto. Tente de novo ou escolha outra.");
    }
  };

  const enviar = async () => {
    if (enviando || aguardandoAnexos) return;
    if (edicaoComErro) { setTentou(true); setCorrigirAberto(true); return; }
    if (!validacao.pode) { setTentou(true); textoRef.current?.focus(); return; }
    setEnviando(true);
    setFalhou(false);
    try {
      const edicao = referenceData && inicial && atual ? { inicial, atual, referenceData } : null;
      await enviarDevolucao({ explicacao, foto, progresso: progresso.current, edicao }, dependenciasRemotas({ despesaId: despesa.id, nome, motoristaId, ordem: ordem + deslocamento.current }));
      guardarRascunho(despesa.id, "");
      onEnviada(explicacao.trim(), edicao ? alteracoesParaLista(edicao.inicial, edicao.atual, edicao.referenceData) : {});
    } catch (erro) {
      // Texto e foto ficam na tela (e o texto no aparelho) para tentar de novo sem perder nada.
      setFalhou(true);
      reportAppError(erro, { severity: "warning", source: "app", action: "enviarDevolucaoDespesa", notifyUser: false });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="dv-painel" aria-labelledby="dv-resolver">
      <h3 className="gr-subtitulo" id="dv-resolver">Como resolver</h3>
      <div className="dv-acoes" data-colunas={atual ? 3 : 2}>
        <button type="button" className="dv-acao" aria-pressed={Boolean(foto)} disabled={enviando} onClick={() => arquivoRef.current?.click()}>
          Nova foto
        </button>
        {atual ? (
          <button type="button" className="dv-acao" aria-expanded={corrigirAberto} aria-controls="dv-corrigir" disabled={enviando} onClick={() => setCorrigirAberto((v) => !v)}>
            Corrigir{mudou.length ? ` (${mudou.length})` : ""}
          </button>
        ) : null}
        <button type="button" className="dv-acao" aria-expanded={explicarAberto && !saindo} aria-controls="dv-explicar" disabled={enviando} onClick={alternarExplicar}>
          Explicar
        </button>
      </div>
      <input ref={arquivoRef} type="file" accept={acceptDaGaleria("devolucao")} hidden onChange={(event) => { void escolherFoto(event.target.files?.[0]); event.target.value = ""; }} />

      {foto ? (
        <div className="dv-foto">
          <ImagemOuPdf src={foto.dataUrl} alt="Novo comprovante escolhido" />
          <span>Novo comprovante pronto para enviar.</span>
          <button type="button" className="termo-text-button" disabled={enviando} onClick={() => { setFoto(null); reiniciarProgresso(); }}>Remover</button>
        </div>
      ) : null}
      {erroFoto ? <p className="dv-aviso" role="alert">{erroFoto}</p> : null}

      {atual && corrigirAberto ? (
        <div id="dv-corrigir" className="dv-corrigir">
          <TextInputField
            label="Data do gasto"
            type="date"
            disabled={enviando || despesa.conciliadaCartao}
            error={tentou ? errosEdicao.dataGasto : undefined}
            value={atual.dataGasto}
            onChange={(event) => mudar({ dataGasto: event.target.value })}
          />
          <SelectField
            label="Categoria"
            error={tentou ? errosEdicao.categoriaId : undefined}
            value={atual.categoriaId}
            options={opcoesCategoria}
            placeholder="Selecione"
            ariaLabel="Selecionar categoria"
            disabled={enviando}
            onChange={(value) => mudar({ categoriaId: value })}
          />
          <SelectField
            label="Forma de pagamento"
            error={tentou ? errosEdicao.formaPagamentoId : undefined}
            value={atual.formaPagamentoId}
            options={opcoesPagamento}
            placeholder="Selecione"
            ariaLabel="Selecionar forma de pagamento"
            disabled={enviando || despesa.conciliadaCartao}
            onChange={(value) => mudar({ formaPagamentoId: value })}
          />
          {regras.exigeVeiculo ? (
            <SelectField
              label="Veículo"
              error={tentou ? errosEdicao.veiculoId : undefined}
              value={atual.veiculoId}
              options={opcoesVeiculo}
              placeholder="Selecione"
              ariaLabel="Selecionar veículo"
              disabled={enviando}
              onChange={(value) => mudar({ veiculoId: value })}
            />
          ) : null}
          {regras.exigeKm ? (
            <TextInputField
              label="KM"
              inputMode="numeric"
              placeholder="Ex.: 58230"
              disabled={enviando}
              error={tentou ? errosEdicao.kmInformado : undefined}
              value={atual.kmInformado}
              onChange={(event) => mudar({ kmInformado: event.target.value })}
            />
          ) : null}
          {regras.exigeLitros ? (
            <TextInputField
              label="Litros"
              inputMode="decimal"
              placeholder="Ex.: 42,5"
              disabled={enviando}
              error={tentou ? errosEdicao.litros : undefined}
              value={atual.litros}
              onChange={(event) => mudar({ litros: event.target.value })}
            />
          ) : null}
          <small className="dv-corrigir-nota">
            {despesa.conciliadaCartao ? "Valor, data e forma de pagamento vêm do cartão e não podem ser alterados aqui." : "O valor do gasto não pode ser alterado aqui."}
          </small>
        </div>
      ) : null}

      {explicarAberto ? (
        <div id="dv-explicar" className="dv-explicar" data-estado={saindo ? "saindo" : "entrando"}>
          <textarea
            ref={textoRef}
            id="dv-explicar-texto"
            aria-label="Sua explicação"
            rows={3}
            value={explicacao}
            disabled={enviando}
            placeholder="O que aconteceu? Ex.: o posto emitiu o cupom com o valor errado."
            aria-describedby="dv-explicar-ajuda"
            aria-invalid={mostraErro}
            onChange={(event) => mudarTexto(event.target.value)}
          />
          <small id="dv-explicar-ajuda" data-erro={mostraErro} aria-live="polite">
            {mostraErro ? validacao.erro : caracteres > 0 && caracteres < MIN_EXPLICACAO ? `${caracteres}/${MIN_EXPLICACAO} caracteres` : ""}
          </small>
        </div>
      ) : null}

      {falhou ? (
        <p className="dv-aviso" role="alert">Não deu para enviar agora. {explicacao.trim() ? "Seu texto está guardado. " : ""}Tente de novo quando o sinal melhorar.</p>
      ) : null}
      {/* Envio só aparece quando há o que enviar: nada de botão cinza desabilitado antes da escolha. */}
      {semAcao ? null : (
        <button type="button" className="dv-enviar" disabled={enviando || aguardandoAnexos} aria-busy={enviando} onClick={() => { void enviar(); }}>
          {enviando ? "Enviando…" : aguardandoAnexos ? "Carregando comprovantes…" : falhou ? "Tentar de novo" : "Enviar para nova conferência"}
        </button>
      )}
      {/* A despesa do cartão está ligada à transação do banco: a repetida é a outra. */}
      {despesa.conciliadaCartao ? null : <button type="button" className="dv-dobro" disabled={enviando} onClick={onLancouEmDobro}>Lancei em dobro</button>}
    </section>
  );
}
