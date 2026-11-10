import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getInitialDespesaId } from "../../app/bootstrap";
import { AUTO_REFRESH_INTERVAL_MS } from "../../app/navigation";
import { reportAppError } from "../../shared/appErrorLogger";
import { revokePhotoPreviewUrls } from "../fotos/envioMidia";
import { EMPTY_EXPENSE_DRAFT } from "./rascunho";
import { MOCK_CIDADES, gastoCartaoParaRascunho, isMockGastosCartao, listarGastosCartao, mesclarRascunho, type GastoCartao, type GastosCartaoLoadStatus } from "./gastosCartao";
import { ANEXO_COMPLETO } from "./devolucao";
import { STATUS_DESPESA, carregarDespesasRelatorio, hojeSaoPaulo, montarRelatorio, type DespesaRelatorio, type PeriodoId } from "./gastosRelatorio";
import type { GastosRelatorioLoadStatus } from "./GastosRelatorioScreen";
import type { ExpenseDraft, ExpensePhoto } from "./expenses";
import type { useExpenseFlow } from "./useExpenseFlow";
import type { Screen } from "../../types";

type Options = {
  comunicadosDriverIdRef: React.MutableRefObject<string>;
  despesas: ReturnType<typeof useExpenseFlow>;
  driverContextId: string | undefined;
  gastoCartaoAtualRef: React.MutableRefObject<GastoCartao | null>;
  remoteMode: boolean;
  screen: Screen;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Gastos do cartão corporativo (pendentes criados pelo flow que o motorista completa), relatório de gastos e deep link do push.
export function useGastosCartao({ comunicadosDriverIdRef, despesas, driverContextId, gastoCartaoAtualRef, remoteMode, screen, setScreen }: Options) {
  const {
    clearExpensePhotoDraftState,
    expenseDraftRef,
    expensePhotos,
    expenseReferenceData,
    expenseSubmissions,
    isExpenseDraftBlank,
    resetExpenseQuickRead,
    setExpenseDraft,
    setExpensePhotos,
    setExpensePreviewPhotoId,
    setExpenseReferenceData
  } = despesas;
  // Gastos do cartão corporativo criados pelo flow: o motorista completa descrição, categoria, cidade e comprovante.
  const [gastosCartao, setGastosCartao] = useState<GastoCartao[]>([]);
  const [gastosCartaoStatus, setGastosCartaoStatus] = useState<GastosCartaoLoadStatus>("loading");
  const [gastoCartaoAtual, setGastoCartaoAtual] = useState<GastoCartao | null>(null);
  gastoCartaoAtualRef.current = gastoCartaoAtual;
  const gastoCartaoBackupRef = useRef<{ draft: ExpenseDraft; photos: ExpensePhoto[] } | null>(null);
  const pendingGastoCartaoDeepLinkRef = useRef(getInitialDespesaId());
  const gastosCartaoEmCargaRef = useRef<Promise<void> | null>(null);
  const [duplicidadeCartao, setDuplicidadeCartao] = useState<GastoCartao | null>(null);
  const reloadGastosCartao = useCallback(() => {
    if (gastosCartaoEmCargaRef.current) return gastosCartaoEmCargaRef.current;
    const carga = (async () => {
      try {
        setGastosCartao(await listarGastosCartao(comunicadosDriverIdRef.current));
        setGastosCartaoStatus("ready");
      } catch (error) {
        setGastosCartaoStatus((current) => current === "ready" ? current : "error");
        throw error;
      } finally {
        gastosCartaoEmCargaRef.current = null;
      }
    })();
    gastosCartaoEmCargaRef.current = carga;
    return carga;
  }, []);
  useEffect(() => {
    if (!isMockGastosCartao() && !driverContextId) return;
    const carregar = () => {
      if (document.hidden) return;
      reloadGastosCartao().catch((error) => reportAppError(error, { severity: "warning", source: "app", action: "listarGastosCartao", notifyUser: false }));
    };
    carregar();
    const timer = window.setInterval(carregar, AUTO_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", carregar);
    document.addEventListener("visibilitychange", carregar);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", carregar);
      document.removeEventListener("visibilitychange", carregar);
    };
  }, [driverContextId]);
  // Já enviado e guardado no diário do aparelho: sai da lista e da contagem mesmo antes da releitura.
  const gastosCartaoPendentes = gastosCartao.filter((gasto) => !expenseSubmissions.some((submission) => submission.expenseId === gasto.id));

  // Relatório de gastos: uma consulta de 6 meses; o recorte por período e as contas são locais (trocar de período não consulta de novo).
  const [relatorioPeriodo, setRelatorioPeriodo] = useState<PeriodoId>("mes");
  const [relatorioDespesas, setRelatorioDespesas] = useState<DespesaRelatorio[] | null>(null);
  const [relatorioStatus, setRelatorioStatus] = useState<GastosRelatorioLoadStatus>("loading");
  const relatorioEmCargaRef = useRef(false);
  const relatorioRepetirRef = useRef(false);
  const reloadRelatorio = useCallback(async () => {
    if (relatorioEmCargaRef.current) {
      relatorioRepetirRef.current = true;
      return;
    }
    relatorioEmCargaRef.current = true;
    setRelatorioStatus((current) => current === "ready" ? current : "loading");
    try {
      setRelatorioDespesas(await carregarDespesasRelatorio(comunicadosDriverIdRef.current));
      setRelatorioStatus("ready");
    } catch (error) {
      setRelatorioStatus((current) => current === "ready" ? current : "error");
      reportAppError(error, { severity: "warning", source: "app", action: "carregarDespesasRelatorio", notifyUser: false });
    } finally {
      relatorioEmCargaRef.current = false;
      if (relatorioRepetirRef.current) {
        relatorioRepetirRef.current = false;
        void reloadRelatorio();
      }
    }
  }, []);
  // Recarrega a cada vez que o relatório abre (voltar de um envio ou de "Completar" mostra os números novos).
  useEffect(() => {
    if (screen !== "gastosRelatorio") return;
    if (!isMockGastosCartao() && !driverContextId) return;
    void reloadRelatorio();
  }, [screen, driverContextId, reloadRelatorio]);
  // Devolvida reenviada: a lista já mostra "Em conferência", sem depender de nova consulta (o sinal pode estar ruim).
  const marcarDevolucaoEnviada = useCallback((id: string, explicacao: string) => {
    setRelatorioDespesas((atual) => atual && atual.map((item) => item.id === id
      ? { ...item, status: STATUS_DESPESA.enviado, statusAnexo: ANEXO_COMPLETO, justificativa: explicacao || item.justificativa }
      : item));
  }, []);
  // Toque no push de devolução: abre o detalhe da despesa na lista do relatório (some ao sair da tela).
  const [abrirDespesaId, setAbrirDespesaId] = useState("");
  const limparAbrirDespesa = useCallback(() => setAbrirDespesaId(""), []);
  useEffect(() => { if (screen !== "gastosRelatorio") setAbrirDespesaId(""); }, [screen]);
  const relatorioModelo = useMemo(
    () => relatorioDespesas ? montarRelatorio(relatorioDespesas, relatorioPeriodo, hojeSaoPaulo()) : null,
    [relatorioDespesas, relatorioPeriodo]
  );

  // Abre o gasto no formulário de gastos. `manterFormulario`: veio do aviso de duplicidade, mantém fotos e o que foi digitado.
  const abrirGastoCartao = (gasto: GastoCartao, manterFormulario = false) => {
    const base = gastoCartaoParaRascunho(gasto);
    if (!remoteMode && isMockGastosCartao() && !expenseReferenceData.cities.length) setExpenseReferenceData({ ...expenseReferenceData, cities: MOCK_CIDADES });
    if (manterFormulario) {
      setExpenseDraft(mesclarRascunho(base, expenseDraftRef.current));
    } else {
      if (!gastoCartaoAtualRef.current && (expensePhotos.length || !isExpenseDraftBlank(expenseDraftRef.current))) {
        gastoCartaoBackupRef.current = { draft: expenseDraftRef.current, photos: expensePhotos };
      } else if (!gastoCartaoBackupRef.current) {
        revokePhotoPreviewUrls(expensePhotos);
      }
      setExpensePhotos([]);
      setExpenseDraft(base);
    }
    setExpensePreviewPhotoId("");
    clearExpensePhotoDraftState();
    resetExpenseQuickRead();
    setGastoCartaoAtual(gasto);
    setDuplicidadeCartao(null);
    setScreen("gastos");
  };

  // Sai do preenchimento do pendente: devolve o formulário que estava em andamento (se havia) ou limpa tudo.
  const sairGastoCartao = () => {
    const backup = gastoCartaoBackupRef.current;
    gastoCartaoBackupRef.current = null;
    setGastoCartaoAtual(null);
    resetExpenseQuickRead();
    clearExpensePhotoDraftState();
    setExpensePreviewPhotoId("");
    // As fotos atuais são do gasto do cartão (as do formulário anterior estão no backup).
    revokePhotoPreviewUrls(expensePhotos);
    if (backup) {
      setExpenseDraft(backup.draft);
      setExpensePhotos(backup.photos);
    } else {
      setExpenseDraft({ ...EMPTY_EXPENSE_DRAFT, dataGasto: new Date().toISOString().slice(0, 10) });
      setExpensePhotos([]);
    }
  };

  // Gasto enviado: sai da lista, devolve o formulário e diz para onde voltar.
  const concluirGastoCartao = (id: string): Screen => {
    setGastosCartao((current) => current.filter((gasto) => gasto.id !== id));
    sairGastoCartao();
    return gastosCartaoPendentes.some((gasto) => gasto.id !== id) ? "gastosCartao" : "gastosRelatorio";
  };

  // Deep link do push: ?despesaId abre o gasto direto quando ele está pendente; senão (ou com ?gastosCartao=1) fica na lista.
  useEffect(() => {
    const despesaId = pendingGastoCartaoDeepLinkRef.current;
    if (!despesaId || gastosCartaoStatus === "loading") return;
    pendingGastoCartaoDeepLinkRef.current = "";
    const gasto = gastosCartao.find((item) => item.id === despesaId);
    // O motorista pode ter saído da lista enquanto carregava: não puxa ele de volta.
    if (screen !== "gastosCartao") return;
    if (gasto) abrirGastoCartao(gasto);
    // Não é gasto do cartão a completar: é uma despesa devolvida (push "Uma despesa precisa da sua ação"), aberta no relatório.
    else if (gastosCartaoStatus === "ready") { setAbrirDespesaId(despesaId); setScreen("gastosRelatorio"); }
  }, [gastosCartao, gastosCartaoStatus]);

  return {
    abrirDespesaId,
    abrirGastoCartao,
    concluirGastoCartao,
    duplicidadeCartao,
    gastoCartaoAtual,
    gastosCartaoPendentes,
    gastosCartaoStatus,
    limparAbrirDespesa,
    marcarDevolucaoEnviada,
    motoristaIdRelatorio: comunicadosDriverIdRef.current,
    relatorioDespesas,
    relatorioModelo,
    relatorioPeriodo,
    relatorioStatus,
    reloadGastosCartao,
    reloadRelatorio,
    sairGastoCartao,
    setDuplicidadeCartao,
    setRelatorioPeriodo
  };
}
