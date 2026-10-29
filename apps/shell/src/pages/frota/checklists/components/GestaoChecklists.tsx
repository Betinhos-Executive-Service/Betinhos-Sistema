import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Icon } from "./icons";
import { PadroesTab } from "./PadroesTab";
import { FotosChecklist } from "./FotosChecklist";
import { ModeloEditor, type StatusSalvar } from "./ModeloEditor";
import type { EstadoVeiculos } from "./FiltroVeiculos";
import { ehPadrao, resumoFiltro, type OpcoesFiltro, type VeiculoFiltro } from "../domain/filtroVeiculo";
import { logAppError, setErrorLogContext } from "@betinhos/ui/error-logger";
import { CHECKLIST_ESTADO, CHECKLIST_ORIGEM, isMockChecklists, type ChecklistResposta } from "../domain/checklists";
import {
  cancelarChecklist,
  canRemind,
  checklistBuscaTexto,
  CHK_FILTERS,
  comUids,
  contarUsoModelo,
  duplicarModelo,
  erroMotivoCancelamento,
  errosModelo,
  estadoLabel,
  FalhaAoSalvarModelo,
  lembrarMotorista,
  loadChecklistsGestao,
  loadChecklistsPadroes,
  loadFrota,
  loadModelos,
  loadOpcoesFiltro,
  loadVeiculosFiltro,
  matchChk,
  moverPrioridade,
  opcoesDosVeiculos,
  novoModelo,
  ordenarModelos,
  origemLabel,
  podeSalvar,
  periodicidadePorVeiculo,
  periodicidadeVigente,
  plural,
  podeReatribuir,
  PUSH,
  proximaPrioridade,
  pushLabel,
  reatribuirChecklist,
  resumoErros,
  salvarPrioridades,
  saveModelo,
  situacaoVeiculo,
  solicitarChecklist,
  veiculosComMotorista,
  type ChecklistGestao,
  type ChkFilter,
  type Modelo,
  type SituacaoVeiculo,
  type UsoModelo,
  type VeiculoFrota
} from "../domain/gestaoChecklists";
import { PERIODO_PADROES_INICIAL, type PeriodoPadroes } from "../domain/padroesChecklists";


// Dentro do Sistema Betinhos (iframe com ?host=shell) o selo do Sistema ocupa o canto inferior direito.

type Tab = "veiculos" | "checklists" | "modelos" | "padroes";
type Dialog =
  | { kind: "solicitar"; veiculo: VeiculoFrota }
  | { kind: "cancelar"; checklist: ChecklistGestao }
  | { kind: "descartar" }
  | { kind: "padrao"; substitui: string }
  | { kind: "removerItem"; uid: string; nome: string; voltarFoco: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "veiculos", label: "Veículos" },
  { id: "checklists", label: "Checklists" },
  { id: "modelos", label: "Modelos" },
  { id: "padroes", label: "Padrões" }
];

const isOpen = (item: ChecklistGestao) => item.estado === CHECKLIST_ESTADO.aguardandoMotorista || item.estado === CHECKLIST_ESTADO.pendente;
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)).replace(",", "") : "";
const formatDay = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const formatNumber = (value: string, unidade: string) => {
  const number = Number(value);
  if (!value || !Number.isFinite(number)) return value || "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(number)}${unidade ? ` ${unidade}` : ""}`;
};
const sameModelo = (a: Modelo | null, b: Modelo | null) => JSON.stringify(a) === JSON.stringify(b);
const clonar = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const horaAgora = () => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());

export function GestaoChecklists() {
  const [tab, setTab] = useState<Tab>("veiculos");
  useEffect(() => { setErrorLogContext({ screen: `frota-checklists/${tab}` }); }, [tab]);
  const [frota, setFrota] = useState<VeiculoFrota[]>([]);
  const [checklists, setChecklists] = useState<ChecklistGestao[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [frotaSearch, setFrotaSearch] = useState("");
  const [chkFilter, setChkFilter] = useState<ChkFilter>("abertos");
  const [chkSearch, setChkSearch] = useState("");
  const [selectedChkId, setSelectedChkId] = useState("");
  const [editing, setEditing] = useState<Modelo | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<Modelo | null>(null);
  // Editor de modelo: erros só aparecem depois do primeiro Salvar; o pedido leva ao primeiro erro.
  const [mostrarErros, setMostrarErros] = useState(false);
  const [pedidoErro, setPedidoErro] = useState(0);
  const [salvoAs, setSalvoAs] = useState("");
  const [falhaSalvar, setFalhaSalvar] = useState(false);
  const [uso, setUso] = useState<UsoModelo | null | "erro">(null);
  const usoPedido = useRef("");
  const pedidoVeiculos = useRef(0);
  // Se o modelo era o padrão quando o editor abriu (o padrão só é reconciliado quando o checkbox mudou).
  const [padraoAoAbrir, setPadraoAoAbrir] = useState(false);
  // Elemento da lista que recebe o foco ao sair do editor (data-foco).
  const [focoLista, setFocoLista] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogModeloId, setDialogModeloId] = useState("");
  const [dialogMotivo, setDialogMotivo] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogVolta = useRef<HTMLElement | string | null>(null);
  // Padrões: lidos só ao abrir a aba (180 dias de checklists enviados) e recalculados no navegador ao trocar o período.
  const [padroesRows, setPadroesRows] = useState<ChecklistGestao[] | null>(null);
  const [padroesLoading, setPadroesLoading] = useState(false);
  const [padroesFalhou, setPadroesFalhou] = useState(false);
  const [periodo, setPeriodo] = useState<PeriodoPadroes>(PERIODO_PADROES_INICIAL);
  const [padraoAberto, setPadraoAberto] = useState("");
  // Checklist aberto de outra aba (Veículos ou Padrões): a lista rola até a linha e o foco vai para ela.
  const [focarChkId, setFocarChkId] = useState("");
  // Prévia do filtro e situação por carro: universo da rotina e rótulos das choices, lidos ao abrir a tela.
  const [veiculosFiltro, setVeiculosFiltro] = useState<VeiculoFiltro[]>([]);
  const [opcoesFiltro, setOpcoesFiltro] = useState<OpcoesFiltro>({});
  const [estadoVeiculos, setEstadoVeiculos] = useState<EstadoVeiculos>("carregando");
  const isMock = isMockChecklists();

  const periodicidade = periodicidadeVigente(modelos);
  const modelosAtivos = modelos.filter((modelo) => modelo.ativo);
  const padrao = modelos.find(ehPadrao) ?? null;
  // Cada carro vence pela periodicidade do modelo que a rotina escolhe para ele (sem modelo: fora da rotina).
  const situacoes = useMemo(() => {
    const periodicidadeDe = periodicidadePorVeiculo(veiculosFiltro, modelos);
    return new Map(frota.map((veiculo) => [veiculo.id, situacaoVeiculo(veiculo, checklists, periodicidadeDe(veiculo.id))]));
  }, [frota, checklists, veiculosFiltro, modelos]);
  // Lista de Modelos: ordem de prioridade (padrão por último) e quem recebe cada um.
  const linhasModelos = useMemo(() => ordenarModelos(modelos).map((modelo) => ({ modelo, padrao: ehPadrao(modelo), recebe: resumoFiltro(modelo, opcoesFiltro) })), [modelos, opcoesFiltro]);
  const totalOrdenaveis = linhasModelos.filter((linha) => !linha.padrao).length;
  const frotaTerm = frotaSearch.trim().toLowerCase();
  const frotaVisivel = frota
    .filter((veiculo) => !frotaTerm || `${veiculo.placa} ${veiculo.modelo} ${veiculo.motoristaNome}`.toLowerCase().includes(frotaTerm))
    .sort((a, b) => (situacoes.get(a.id)?.ordem ?? 9) - (situacoes.get(b.id)?.ordem ?? 9) || a.placa.localeCompare(b.placa));
  const chkTerm = chkSearch.trim().toLowerCase();
  const chkBuscados = checklists.filter((item) => !chkTerm || checklistBuscaTexto(item).toLowerCase().includes(chkTerm));
  const chkVisiveis = chkBuscados.filter((item) => matchChk(chkFilter, item));
  const selectedChk = checklists.find((item) => item.id === selectedChkId) ?? chkVisiveis[0];
  const contagem = {
    emDia: [...situacoes.values()].filter((item) => item.tone === "success").length,
    pendentes: veiculosComMotorista(checklists),
    atencao: [...situacoes.values()].filter((item) => item.tone === "danger").length
  };
  const dirty = Boolean(editing) && !sameModelo(editing, editingOriginal);
  const erroMotivo = dialog?.kind === "cancelar" ? erroMotivoCancelamento(dialogMotivo) : "";

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const load = async () => {
    const [loadedFrota, loadedChecklists, loadedModelos] = await Promise.all([loadFrota(), loadChecklistsGestao(), loadModelos()]);
    setFrota(loadedFrota);
    setChecklists(loadedChecklists);
    setModelos(loadedModelos);
    return loadedChecklists;
  };

  useEffect(() => {
    load()
      .catch((cause) => {
        void logAppError(cause, { action: "carregar-checklists", phase: "load", component: "GestaoChecklists" });
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar os checklists.");
      })
      .finally(() => setLoading(false));
    // Em paralelo e com erro próprio: a situação por carro usa o modelo de cada um; sem estes dados vale o padrão.
    void carregarVeiculosFiltro();
  }, []);

  // `conferir` lê a lista recarregada e devolve o erro a mostrar quando a ação terminou sem o efeito esperado.
  const run = async (action: () => Promise<void>, success: string, failure: string, conferir?: (checklists: ChecklistGestao[]) => string) => {
    setBusy(true);
    setError("");
    setNotice("");
    let done = false;
    try {
      await action();
      done = true;
      const lista = await load();
      const erro = conferir ? conferir(lista) : "";
      if (erro) setError(erro); else setNotice(success);
    } catch (cause) {
      void logAppError(cause, { action: failure, phase: done ? "refresh" : "submit", component: "GestaoChecklists" });
      setError(done ? `${success.replace(/\.$/, "")}, mas não foi possível atualizar a tela. Toque em Atualizar.` : cause instanceof Error && cause.message ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const loadPadroes = async () => {
    setPadroesLoading(true);
    setPadroesFalhou(false);
    try {
      setPadroesRows(await loadChecklistsPadroes());
    } catch (cause) {
      void logAppError(cause, { action: "carregar-padroes", phase: "load", component: "GestaoChecklists" });
      setPadroesFalhou(true);
      setError(cause instanceof Error && cause.message ? cause.message : "Não foi possível carregar os padrões.");
    } finally {
      setPadroesLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "padroes" && padroesRows === null && !padroesLoading && !padroesFalhou) void loadPadroes();
  }, [tab]);

  // Recarga dos Padrões no Atualizar: só se a aba já foi aberta, depois das outras abas e com erro próprio.
  // Se falhar, ficam os números da última leitura e as outras abas não são afetadas.
  const refreshPadroes = async () => {
    if (padroesRows === null) return;
    try {
      setPadroesRows(await loadChecklistsPadroes());
      setPadroesFalhou(false);
    } catch (cause) {
      void logAppError(cause, { action: "atualizar-padroes", phase: "refresh", component: "GestaoChecklists" });
      if (tab === "padroes") setError("Não foi possível atualizar os padrões. Os números são da última leitura.");
    }
  };

  const refreshView = async () => {
    if (busy) return;
    setRefreshing(true);
    await run(async () => undefined, "Dados atualizados.", "Não foi possível atualizar.");
    await Promise.all([carregarVeiculosFiltro(), refreshPadroes()]);
    setRefreshing(false);
  };

  // Depois de tentar atribuir de novo, o checklist pode continuar sem motorista: isso é erro, não sucesso.
  const reatribuir = (id: string) => run(() => reatribuirChecklist(id), "Atribuição conferida de novo.", "Não foi possível atribuir.",
    (lista) => lista.find((item) => item.id === id)?.erroAtribuicao ?? "");

  const openChecklist = (id: string) => {
    setTab("checklists");
    setChkFilter("todos");
    setSelectedChkId(id);
    setFocarChkId(id);
  };

  useEffect(() => {
    if (!focarChkId || tab !== "checklists") return;
    const row = document.querySelector<HTMLElement>(`[data-chk-id="${CSS.escape(focarChkId)}"]`);
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
    setFocarChkId("");
  }, [focarChkId, tab]);

  // ---------- Diálogos ----------

  // Ao fechar, o foco volta para onde estava (ou para o seletor indicado quando o elemento de origem some).
  const abrirDialog = (next: Dialog, volta?: string) => {
    dialogVolta.current = volta ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setDialog(next);
  };

  useEffect(() => {
    if (dialog || !dialogVolta.current) return;
    const alvo = dialogVolta.current;
    dialogVolta.current = null;
    const el = typeof alvo === "string" ? document.querySelector<HTMLElement>(alvo) : alvo.isConnected ? alvo : null;
    el?.focus();
  }, [dialog]);

  const closeDialog = () => { if (!busy) setDialog(null); };

  const askSolicitar = (veiculo: VeiculoFrota) => {
    setDialogModeloId(padrao?.id ?? modelosAtivos[0]?.id ?? "");
    abrirDialog({ kind: "solicitar", veiculo });
  };

  const confirmDialog = async () => {
    if (!dialog) return;
    const current = dialog;
    if (current.kind === "descartar") { dialogVolta.current = null; setDialog(null); closeEditor(); return; }
    if (current.kind === "padrao") { setDialog(null); setEditing((modelo) => modelo && { ...modelo, padraoQuinzenal: true }); return; }
    if (current.kind === "removerItem") {
      setDialog(null);
      setEditing((modelo) => modelo && { ...modelo, itens: modelo.itens.filter((item) => (item.uid || item.id) !== current.uid).map((item, position) => ({ ...item, ordem: position + 1 })) });
      dialogVolta.current = current.voltarFoco;
      return;
    }
    setDialog(null);
    if (current.kind === "solicitar") {
      // Sempre o id escolhido (inclusive o padrão): sem id o plugin resolve pelo filtro e pode criar com outro modelo.
      await run(() => solicitarChecklist(current.veiculo.id, dialogModeloId),
        `Checklist solicitado para ${current.veiculo.placa}.`, "Não foi possível solicitar o checklist.");
    } else {
      await run(() => cancelarChecklist(current.checklist.id, dialogMotivo), "Checklist cancelado.", "Não foi possível cancelar o checklist.");
    }
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); closeDialog(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), select, textarea"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  // ---------- Modelos ----------

  const carregarVeiculosFiltro = async () => {
    // Só a leitura mais recente vale: Atualizar e "Tentar de novo" podem sobrepor uma leitura ainda em curso.
    const pedido = ++pedidoVeiculos.current;
    setEstadoVeiculos("carregando");
    try {
      const [veiculos, opcoes] = await Promise.all([loadVeiculosFiltro(), loadOpcoesFiltro()]);
      if (pedido !== pedidoVeiculos.current) return;
      setVeiculosFiltro(veiculos);
      setOpcoesFiltro(opcoes ?? opcoesDosVeiculos(veiculos));
      setEstadoVeiculos("pronto");
    } catch (cause) {
      if (pedido !== pedidoVeiculos.current) return;
      void logAppError(cause, { action: "carregar-veiculos-filtro", phase: "load", component: "GestaoChecklists" });
      setEstadoVeiculos("erro");
    }
  };

  /** Sobe ou desce o modelo na ordem de prioridade e grava a nova numeração (10, 20, 30…). */
  const moverModelo = async (modelo: Modelo, delta: -1 | 1) => {
    const { mudancas, posicao, total } = moverPrioridade(modelos, modelo.id, delta);
    if (!mudancas.length) return;
    await run(() => salvarPrioridades(mudancas), `${modelo.nome} passou para a posição ${posicao + 1} de ${total}.`, "Não foi possível mudar a ordem dos modelos.");
    // O foco fica no botão usado; se ele desativou (topo ou fim da lista), vai para o outro.
    const [usado, outro] = delta < 0 ? ["subir", "descer"] : ["descer", "subir"];
    const noLimite = delta < 0 ? posicao === 0 : posicao === total - 1;
    setFocoLista(`${noLimite ? outro : usado}-${modelo.id}`);
  };

  /** Abre o editor; `origem` é o data-foco que recebe o foco ao voltar. Cópia começa com alteração pendente. */
  const startEdit = (modelo: Modelo | null, origem: string, copia = false) => {
    const base = comUids(modelo ? clonar(modelo) : novoModelo());
    // Modelo novo e cópia entram no fim da ordem de prioridade.
    if (!base.id) base.prioridade = proximaPrioridade(modelos);
    if (estadoVeiculos === "erro") void carregarVeiculosFiltro();
    setEditing(base);
    // Modelo novo e cópia ainda não existem no Dataverse: o original não tem id; a cópia compara com um modelo vazio.
    setEditingOriginal(copia ? comUids(novoModelo()) : clonar(base));
    setPadraoAoAbrir(Boolean(base.id && base.ativo && base.padraoQuinzenal));
    setMostrarErros(false);
    setSalvoAs("");
    setFalhaSalvar(false);
    setUso(null);
    setFocoLista(origem);
    window.scrollTo({ top: 0 });
    usoPedido.current = base.id;
    if (base.id) {
      // Só aplica a contagem se o mesmo modelo continua aberto (o usuário pode ter trocado de modelo).
      contarUsoModelo(base.id).then((valor) => { if (usoPedido.current === base.id) setUso(valor); }).catch((cause) => {
        void logAppError(cause, { action: "contar-uso-modelo", phase: "load", component: "GestaoChecklists" });
        if (usoPedido.current === base.id) setUso("erro");
      });
    }
  };

  const closeEditor = () => {
    usoPedido.current = "";
    setEditing(null);
    setEditingOriginal(null);
    setMostrarErros(false);
  };

  const leaveEdit = () => {
    if (busy) return;
    if (dirty) { abrirDialog({ kind: "descartar" }); return; }
    closeEditor();
  };

  // Volta o foco para o elemento da lista que abriu o editor.
  useEffect(() => {
    if (editing || !focoLista || tab !== "modelos") return;
    document.querySelector<HTMLElement>(`[data-foco="${CSS.escape(focoLista)}"]`)?.focus();
    setFocoLista("");
  }, [editing, focoLista, tab]);

  const originalGravado = editingOriginal?.id ? editingOriginal : null;

  const saveEditing = async () => {
    if (!editing || busy) return;
    if (errosModelo(editing, originalGravado).length) {
      setMostrarErros(true);
      setPedidoErro((value) => value + 1);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { modelo: salvo, aviso } = await saveModelo(editing, originalGravado, { padraoAoAbrir });
      setEditing(clonar(salvo));
      setEditingOriginal(clonar(salvo));
      // Uma nova edição começa daqui: o checkbox do padrão passa a ser comparado com o que ficou gravado.
      setPadraoAoAbrir(salvo.ativo && salvo.padraoQuinzenal);
      setMostrarErros(false);
      setFalhaSalvar(false);
      setSalvoAs(horaAgora());
      if (!originalGravado) { usoPedido.current = salvo.id; setUso({ total: 0, abertos: 0 }); }
      setFocoLista(`modelo-${salvo.id}`);
      setNotice(aviso || "Modelo salvo.");
      try { await load(); } catch (cause) {
        void logAppError(cause, { action: "salvar-modelo", phase: "refresh", component: "GestaoChecklists" });
        setError("Modelo salvo, mas não foi possível atualizar a lista. Toque em Atualizar.");
      }
    } catch (cause) {
      void logAppError(cause, { action: "salvar-modelo", phase: "submit", component: "GestaoChecklists" });
      // Guarda os ids do que já foi gravado: o próximo Salvar continua de onde parou, sem duplicar.
      // `persistido` é o que de fato está gravado; com o Salvar habilitado pela falha, a nova tentativa reconcilia.
      if (cause instanceof FalhaAoSalvarModelo) {
        setEditing(clonar(cause.modelo));
        setEditingOriginal(clonar(cause.persistido));
        // Modelo novo cujo cabeçalho já foi criado: ainda não tem checklists.
        if (!originalGravado && cause.persistido.id) { usoPedido.current = cause.persistido.id; setUso({ total: 0, abertos: 0 }); }
      }
      setFalhaSalvar(true);
      setError(cause instanceof Error && cause.message ? cause.message : "Não foi possível salvar o modelo.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!editing) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      // Esc durante o arraste só cancela o arraste (tratado na alça).
      if (event.key === "Escape" && !dialog && !document.querySelector(".mod-list.is-reordering") && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) leaveEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Recarregar ou fechar a aba com alteração não salva pede confirmação do navegador.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const errosVisiveis = editing && mostrarErros ? errosModelo(editing, originalGravado) : [];
  const statusSalvar: StatusSalvar = busy && editing ? { tom: "salvando", texto: "Salvando…" }
    : errosVisiveis.length ? { tom: "erro", texto: resumoErros(errosVisiveis) }
    : falhaSalvar ? { tom: "erro", texto: "Não foi salvo por completo. Toque em Salvar de novo." }
    : dirty ? { tom: "aviso", texto: "Alterações não salvas" }
    : salvoAs ? { tom: "sucesso", texto: `Salvo às ${salvoAs}` }
    : { tom: "neutro", texto: "Nenhuma alteração" };

  // ---------- Render ----------

  const kpis = [
    { label: "Frota própria", value: frota.length, tone: "navy", icon: "car" as const, foot: isMock ? "Mock local" : "Carros próprios ativos" },
    { label: "Em dia", value: contagem.emDia, tone: "green", icon: "checkCircle" as const, foot: `Padrão: vistoria a cada ${periodicidade} dias` },
    { label: "Com o motorista", value: contagem.pendentes, tone: "amber", icon: "clock" as const, foot: contagem.pendentes ? "Veículos com checklist aguardando envio pelo app" : "Nenhum pendente" },
    { label: "Precisam de atenção", value: contagem.atencao, tone: contagem.atencao ? "red" : "green", icon: "alert" as const, foot: contagem.atencao ? "Vencidos, com problema, sem checklist ou sem motorista" : "Nenhum problema" }
  ];

  const header = editing ? (
    <header className="gestao-header">
      <div className="gestao-header-text">
        <nav className="gestao-crumbs" aria-label="Navegação">
          <button type="button" className="gestao-back" disabled={busy} onClick={leaveEdit}><Icon name="arrowLeft" size={16} />Modelos</button>
          <span aria-hidden="true">/</span><span aria-current="page">{editingOriginal?.id ? "Editar" : "Novo"}</span>
        </nav>
        <h1>{editingOriginal?.id ? editingOriginal.nome || "Modelo" : "Novo modelo"}</h1>
        <p className="gestao-subtitle">Defina o que o motorista fotografa e confere. Checklists já criados mantêm a versão anterior.</p>
      </div>
    </header>
  ) : (
    // O título vem do cabeçalho do shell (`useShellHeader` na FrotaPage); aqui ficam só a descrição e as ações.
    <header className="gestao-header">
      <div className="gestao-header-text">
        <p className="gestao-subtitle">Vistorias da frota própria enviadas pelos motoristas no App Motoristas.</p>
      </div>
      <div className="gestao-header-actions">
        <button type="button" className="gestao-button is-secondary" disabled={busy} aria-busy={refreshing} onClick={() => void refreshView()}><Icon name="refresh" size={16} className={refreshing ? "is-spinning" : ""} />Atualizar</button>
        {tab === "modelos" ? <button type="button" className="gestao-button is-primary" data-foco="novo-modelo" disabled={busy} onClick={() => startEdit(null, "novo-modelo")}><Icon name="plus" size={16} />Novo modelo</button> : null}
      </div>
    </header>
  );

  return (
    <div className="gestao-shell" aria-busy={loading}>
      <main className="gestao-main">
        {header}

        {editing ? (
          <ModeloEditor
            modelo={editing}
            original={originalGravado}
            padraoAtual={padrao}
            busy={busy}
            dirty={dirty}
            podeSalvar={podeSalvar({ busy, dirty, falhaSalvar })}
            status={statusSalvar}
            mostrarErros={mostrarErros}
            pedidoErro={pedidoErro}
            uso={uso}
            filtro={{ outros: modelos, veiculos: veiculosFiltro, opcoes: opcoesFiltro, estado: estadoVeiculos, onTentar: () => void carregarVeiculosFiltro() }}
            onChange={(change) => setEditing((current) => current && { ...current, ...change })}
            onItens={(itens) => setEditing((current) => current && { ...current, itens })}
            onPedirPadrao={() => abrirDialog({ kind: "padrao", substitui: padrao && padrao.id !== editing.id ? padrao.nome : "" }, "#mod-padrao")}
            onPedirRemover={(uid, voltarFoco) => {
              const item = editing.itens.find((entry) => (entry.uid || entry.id) === uid);
              abrirDialog({ kind: "removerItem", uid, nome: item?.rotulo.trim() || "este item", voltarFoco });
            }}
            onCancel={leaveEdit}
            onSave={() => void saveEditing()}
          />
        ) : (
          <>
            <div className="gestao-kpis">
              {kpis.map((kpi, index) => (
                <div key={kpi.label} className="gestao-card gestao-kpi" style={{ "--i": index } as CSSProperties}>
                  <div className="gestao-kpi-top">
                    <span className={`gestao-kpi-icon is-${kpi.tone}`}><Icon name={kpi.icon} /></span>
                    <div><span className="gestao-kpi-label">{kpi.label}</span><span className="gestao-kpi-value">{loading ? "…" : kpi.value}</span></div>
                  </div>
                  <span className="gestao-hint">{kpi.foot}</span>
                </div>
              ))}
            </div>

            <div className="gestao-tabs gestao-segmented-scroll">
              <div className="gestao-segmented is-four" role="tablist" aria-label="Seções" style={{ "--pos": TABS.findIndex((item) => item.id === tab) } as CSSProperties}>
                <span className="gestao-segmented-thumb" aria-hidden="true" />
                {TABS.map((item) => (
                  <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
                    {item.label}{item.id === "padroes" ? "" : ` · ${item.id === "veiculos" ? frota.length : item.id === "checklists" ? checklists.filter(isOpen).length : modelos.length}`}
                  </button>
                ))}
              </div>
            </div>

            {tab === "veiculos" ? (
              <section className="gestao-card gestao-list" aria-labelledby="frota-title">
                <div className="gestao-card-head">
                  <div><span className="gestao-eyebrow">Frota própria</span><h2 id="frota-title">Situação por veículo</h2></div>
                  <span className="gestao-hint">Motorista atual conforme a Infleet</span>
                </div>
                <div className="gestao-results-toolbar">
                  <div className="gestao-search"><Icon name="search" size={16} /><input type="search" aria-label="Buscar veículo" placeholder="Buscar placa, modelo ou motorista" value={frotaSearch} onChange={(event) => setFrotaSearch(event.target.value)} /></div>
                </div>
                <div className="frota-head" aria-hidden="true"><span>Veículo</span><span>Motorista atual</span><span>Última vistoria</span><span>Situação</span><span /></div>
                <div role="list">
                  {loading ? [0, 1, 2, 3].map((index) => <span key={index} className="gestao-row-skeleton" aria-hidden="true" />) : null}
                  {frotaVisivel.map((veiculo, index) => (
                    <FrotaRow key={veiculo.id} veiculo={veiculo} situacao={situacoes.get(veiculo.id)} index={index} busy={busy}
                      onSolicitar={() => askSolicitar(veiculo)}
                      onVer={(id) => openChecklist(id)}
                      onReatribuir={(id) => void reatribuir(id)} />
                  ))}
                  {!loading && !frota.length ? <div className="gestao-empty"><Icon name="car" size={32} /><strong>Nenhum carro próprio ativo</strong><p>Cadastre a categoria e o status do veículo no Dataverse.</p></div> : null}
                  {!loading && frota.length > 0 && !frotaVisivel.length ? <div className="gestao-empty"><Icon name="search" size={32} /><strong>Nenhum veículo encontrado</strong><p>Limpe a busca para ver a frota toda.</p></div> : null}
                </div>
              </section>
            ) : null}

            {tab === "checklists" ? (
              <div className="gestao-report-columns">
                <section className="gestao-card gestao-results" aria-labelledby="chk-title">
                  <div className="gestao-card-head">
                    <div><span className="gestao-eyebrow">Vistorias</span><h2 id="chk-title">Checklists</h2></div>
                    <div className="gestao-segmented-scroll chk-filtros">
                      {(["estado", "origem"] as const).map((grupo) => {
                        const filtros = CHK_FILTERS.filter((item) => item.grupo === grupo);
                        const pos = filtros.findIndex((item) => item.id === chkFilter);
                        return (
                          <div key={grupo} className={`gestao-segmented ${grupo === "estado" ? "is-four" : "is-one"}${pos < 0 ? " is-none" : ""}`} role="group" aria-label={grupo === "estado" ? "Filtrar por estado" : "Filtrar por origem"} style={{ "--pos": pos } as CSSProperties}>
                            <span className="gestao-segmented-thumb" aria-hidden="true" />
                            {filtros.map((item) => (
                              <button key={item.id} type="button" aria-pressed={chkFilter === item.id} onClick={() => { setChkFilter(item.id); setSelectedChkId(""); }}>{grupo === "origem" ? "Origem: " : ""}{item.label} · {chkBuscados.filter((row) => matchChk(item.id, row)).length}</button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="gestao-results-toolbar">
                    <div className="gestao-search"><Icon name="search" size={16} /><input type="search" aria-label="Buscar checklist" placeholder="Buscar placa, motorista ou modelo" value={chkSearch} onChange={(event) => setChkSearch(event.target.value)} /></div>
                  </div>
                  <div className="chk-head" aria-hidden="true"><span>Veículo</span><span>Motorista</span><span>Data</span><span>Situação</span><span /></div>
                  <div role="list">
                    {loading ? [0, 1, 2].map((index) => <span key={index} className="gestao-row-skeleton" aria-hidden="true" />) : null}
                    {chkVisiveis.map((item, index) => {
                      const estado = estadoLabel(item);
                      const selected = selectedChk?.id === item.id;
                      return (
                        <div key={item.id} role="listitem">
                          <button type="button" className={`chk-row ${selected ? "is-selected" : ""}`} aria-pressed={selected} data-chk-id={item.id} style={{ "--i": Math.min(index, 12) } as CSSProperties} onClick={() => setSelectedChkId(item.id)}>
                            <span className="frota-cell"><strong>{item.placa || "Veículo"}</strong><small>{origemLabel(item)} · {item.modeloNome || "Modelo"}</small></span>
                            <span className="frota-cell"><span className={item.motoristaNome ? "" : "is-missing"}>{item.motoristaNome || (item.erroAtribuicao ? "Sem motorista" : "Atribuindo")}</span></span>
                            <span className="frota-cell"><span>{formatDay(item.concluidoEm || item.canceladoEm || item.solicitadoEm)}</span></span>
                            <span><span className={`gestao-badge is-${estado.tone}`}>{estado.label}</span></span>
                            <Icon name="chevronRight" size={16} className="gestao-list-chevron" />
                          </button>
                        </div>
                      );
                    })}
                    {!loading && !chkVisiveis.length ? <div className="gestao-empty"><Icon name="clipboardCheck" size={32} /><strong>{chkFilter === "abertos" ? "Nenhum checklist em aberto" : chkFilter === "trocas" && !chkTerm ? "Nenhuma troca detectada" : "Nenhum checklist encontrado"}</strong><p>{chkFilter === "abertos" ? "A rotina diária cria as vistorias quinzenais; use Solicitar na aba Veículos para pedir uma extra." : chkFilter === "trocas" && !chkTerm ? "Quando a Infleet mostrar um carro passando para outro motorista, o checklist de recebimento aparece aqui." : "Troque o filtro ou limpe a busca."}</p></div> : null}
                  </div>
                </section>
                <aside className="gestao-side-stack" aria-label="Detalhe do checklist">
                  {selectedChk ? (
                    <ChecklistDetail key={selectedChk.id} item={selectedChk} busy={busy}
                      onLembrar={() => void run(() => lembrarMotorista(selectedChk.id), "Lembrete enviado ao motorista.", "Não foi possível lembrar o motorista.")}
                      onReatribuir={() => void reatribuir(selectedChk.id)}
                      onCancelar={() => { setDialogMotivo(""); abrirDialog({ kind: "cancelar", checklist: selectedChk }); }} />
                  ) : null}
                </aside>
              </div>
            ) : null}

            {tab === "modelos" ? (
              <section className="gestao-card gestao-list" aria-labelledby="mod-title">
                <div className="gestao-card-head">
                  <div><span className="gestao-eyebrow">Itens da vistoria</span><h2 id="mod-title">Modelos de checklist</h2></div>
                  <span className="gestao-hint">{padrao ? `Rotina quinzenal usa: ${padrao.nome}` : "Nenhum modelo marcado para a rotina quinzenal"}</span>
                </div>
                {modelos.length > 1 ? <p className="gestao-hint mod-ordem-ajuda">Quando um veículo se encaixa em dois modelos, vale o que está mais acima. Use Subir e Descer para mudar a ordem; o padrão fica sempre por último.</p> : null}
                <div className="mod-head" aria-hidden="true"><span>Modelo</span><span>Itens</span><span>Periodicidade</span><span>Situação</span><span /></div>
                <div role="list">
                  {loading ? [0, 1].map((index) => <span key={index} className="gestao-row-skeleton" aria-hidden="true" />) : null}
                  {linhasModelos.map(({ modelo, padrao: ehOPadrao, recebe }, index) => (
                    <div key={modelo.id} role="listitem" className={`mod-row-wrap ${ehOPadrao ? "" : "has-ordem"}`}>
                      <button type="button" className="mod-row" data-foco={`modelo-${modelo.id}`} disabled={busy} style={{ "--i": index } as CSSProperties} onClick={() => startEdit(modelo, `modelo-${modelo.id}`)}>
                        <span className="gestao-list-title"><strong><span className="mod-ordem">{index + 1}.</span> {modelo.nome}</strong><small>{modelo.descricao || "Sem descrição"}</small><small className="mod-recebe"><Icon name="car" size={14} />{recebe}</small></span>
                        <span className="gestao-list-meta">{modelo.itens.length} {plural(modelo.itens.length, "item", "itens")}</span>
                        <span className="gestao-list-meta">{modelo.periodicidadeDias} dias</span>
                        <span className="mod-badges">
                          <span className={`gestao-badge ${modelo.ativo ? "is-success" : "is-neutral"}`}>{modelo.ativo ? "Ativo" : "Inativo"}</span>
                          {ehOPadrao ? <span className="gestao-badge is-info">Padrão</span> : null}
                        </span>
                        <Icon name="chevronRight" size={16} className="gestao-list-chevron" />
                      </button>
                      {ehOPadrao ? null : (
                        <span className="mod-ordem-acoes">
                          <button type="button" className="mod-icon-button" data-foco={`subir-${modelo.id}`} disabled={busy || index === 0} aria-label={`Subir ${modelo.nome} na ordem (posição ${index + 1} de ${totalOrdenaveis})`} title="Subir"
                            onClick={() => void moverModelo(modelo, -1)}><Icon name="arrowUp" size={16} /><span className="mod-ordem-rotulo">Subir</span></button>
                          <button type="button" className="mod-icon-button" data-foco={`descer-${modelo.id}`} disabled={busy || index === totalOrdenaveis - 1} aria-label={`Descer ${modelo.nome} na ordem (posição ${index + 1} de ${totalOrdenaveis})`} title="Descer"
                            onClick={() => void moverModelo(modelo, 1)}><Icon name="arrowDown" size={16} /><span className="mod-ordem-rotulo">Descer</span></button>
                        </span>
                      )}
                      <button type="button" className="mod-duplicar" data-foco={`duplicar-${modelo.id}`} disabled={busy} aria-label={`Duplicar ${modelo.nome}`} title="Duplicar modelo"
                        onClick={() => startEdit(duplicarModelo(modelo), `duplicar-${modelo.id}`, true)}><Icon name="copy" size={16} /></button>
                    </div>
                  ))}
                  {!loading && !modelos.length ? <div className="gestao-empty"><Icon name="list" size={32} /><strong>Nenhum modelo ainda</strong><p>Crie o primeiro pelo botão Novo modelo e marque para a rotina quinzenal.</p></div> : null}
                </div>
              </section>
            ) : null}
            {tab === "padroes" ? (
              <PadroesTab
                checklists={padroesRows}
                loading={padroesLoading}
                failed={padroesFalhou}
                periodo={periodo}
                onPeriodo={setPeriodo}
                aberta={padraoAberto}
                onAberta={setPadraoAberto}
                onRetry={() => void loadPadroes()}
                podeAbrir={(id) => checklists.some((item) => item.id === id)}
                onAbrir={openChecklist}
              />
            ) : null}
          </>
        )}
      </main>

      {dialog ? (
        <div className="gestao-modal">
          <button type="button" className="gestao-modal-backdrop" aria-label="Fechar" tabIndex={-1} onClick={closeDialog} />
          <div ref={dialogRef} className="gestao-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-text" onKeyDown={onDialogKeyDown}>
            <span className={`gestao-kpi-icon ${dialog.kind === "solicitar" || dialog.kind === "padrao" ? "is-blue" : "is-red"}`}><Icon name={dialog.kind === "solicitar" || dialog.kind === "padrao" ? "clipboardCheck" : dialog.kind === "cancelar" ? "ban" : dialog.kind === "removerItem" ? "trash" : "alert"} /></span>
            <div>
              <h2 id="dlg-title">{dialog.kind === "solicitar" ? `Solicitar checklist do ${dialog.veiculo.placa}?` : dialog.kind === "cancelar" ? `Cancelar o checklist do ${dialog.checklist.placa}?`
                : dialog.kind === "padrao" ? "Usar este modelo na rotina quinzenal?" : dialog.kind === "removerItem" ? `Remover “${dialog.nome}”?` : "Descartar alterações?"}</h2>
              <p id="dlg-text">{dialog.kind === "solicitar"
                ? dialog.veiculo.motoristaNome ? `${dialog.veiculo.motoristaNome} recebe um push e o checklist aparece no App Motoristas.` : "A Infleet não mostra motorista neste carro agora. O checklist fica aguardando até alguém pegar o veículo."
                : dialog.kind === "cancelar" ? "O checklist sai do app do motorista. As respostas já enviadas em outros checklists não mudam."
                : dialog.kind === "padrao" ? `${dialog.substitui ? `Este modelo passa a ser usado na rotina quinzenal no lugar de ${dialog.substitui}.` : "Este modelo passa a ser usado na rotina quinzenal."} A troca vale quando você salvar.`
                : dialog.kind === "removerItem" ? "O item sai dos próximos checklists quando você salvar. Checklists já criados mantêm as respostas."
                : "As mudanças neste modelo ainda não foram salvas."}</p>
            </div>
            {dialog.kind === "solicitar" && modelosAtivos.length > 1 ? (
              <div className="gestao-field">
                <label htmlFor="dlg-modelo" className="gestao-label">Modelo</label>
                <select id="dlg-modelo" value={dialogModeloId} onChange={(event) => setDialogModeloId(event.target.value)}>
                  {modelosAtivos.map((modelo) => <option key={modelo.id} value={modelo.id}>{modelo.nome}{modelo.padraoQuinzenal ? " (rotina quinzenal)" : ""}</option>)}
                </select>
              </div>
            ) : null}
            {dialog.kind === "cancelar" ? (
              <div className="gestao-field">
                <label htmlFor="dlg-motivo" className="gestao-label">Motivo</label>
                <textarea id="dlg-motivo" maxLength={500} value={dialogMotivo} placeholder="Ex.: carro na oficina" aria-invalid={Boolean(erroMotivo)} aria-describedby={erroMotivo ? "dlg-motivo-erro" : undefined} onChange={(event) => setDialogMotivo(event.target.value)} />
                {erroMotivo ? <p id="dlg-motivo-erro" className="gestao-field-error"><Icon name="alert" size={14} />{erroMotivo}</p> : null}
              </div>
            ) : null}
            <div className="gestao-dialog-actions">
              <button type="button" className="gestao-button is-secondary" autoFocus onClick={closeDialog}>{dialog.kind === "descartar" ? "Continuar editando" : "Voltar"}</button>
              {dialog.kind === "solicitar" ? <button type="button" className="gestao-button is-primary" disabled={!padrao && !dialogModeloId} onClick={() => void confirmDialog()}><Icon name="send" size={16} />Solicitar checklist</button>
                : dialog.kind === "cancelar" ? <button type="button" className="gestao-button is-danger" disabled={Boolean(erroMotivo)} onClick={() => void confirmDialog()}><Icon name="ban" size={16} />Cancelar checklist</button>
                : dialog.kind === "padrao" ? <button type="button" className="gestao-button is-primary" onClick={() => void confirmDialog()}><Icon name="clipboardCheck" size={16} />Usar na rotina</button>
                : dialog.kind === "removerItem" ? <button type="button" className="gestao-button is-danger" onClick={() => void confirmDialog()}><Icon name="trash" size={16} />Remover item</button>
                : <button type="button" className="gestao-button is-danger" onClick={() => void confirmDialog()}><Icon name="trash" size={16} />Descartar</button>}
            </div>
          </div>
        </div>
      ) : null}

      <div className="gestao-toasts">
        {error ? (
          <div className="gestao-toast is-error" role="alert" key={`e-${error}`}>
            <Icon name="errorCircle" /><span>{error}</span>
            <button type="button" aria-label="Fechar aviso" onClick={() => setError("")}><Icon name="close" size={16} /></button>
          </div>
        ) : null}
        {notice ? (
          <div className="gestao-toast is-success" role="status" key={`n-${notice}`}>
            <Icon name="checkCircle" /><span>{notice}</span>
            <button type="button" aria-label="Fechar aviso" onClick={() => setNotice("")}><Icon name="close" size={16} /></button>
          </div>
        ) : null}
      </div>

    </div>
  );
}

function FrotaRow({ veiculo, situacao, index, busy, onSolicitar, onVer, onReatribuir }: {
  veiculo: VeiculoFrota;
  situacao?: SituacaoVeiculo;
  index: number;
  busy: boolean;
  onSolicitar: () => void;
  onVer: (id: string) => void;
  onReatribuir: (id: string) => void;
}) {
  const aberto = situacao?.aberto;
  const semMotorista = aberto?.estado === CHECKLIST_ESTADO.aguardandoMotorista && Boolean(aberto.erroAtribuicao);
  return (
    <div role="listitem" className="frota-row" style={{ "--i": Math.min(index, 12) } as CSSProperties}>
      <span className="frota-cell"><strong>{veiculo.placa}</strong><small>{veiculo.modelo || "Modelo não informado"}{veiculo.hodometro != null ? ` · ${new Intl.NumberFormat("pt-BR").format(veiculo.hodometro)} km` : ""}</small></span>
      <span className="frota-cell frota-driver">
        {veiculo.motoristaNome ? <><span>{veiculo.motoristaNome}</span>{veiculo.motoristaDesde ? <small>Desde {formatDay(veiculo.motoristaDesde)}</small> : null}</> : <span className="is-missing">Sem motorista na Infleet</span>}
      </span>
      <span className="frota-cell frota-last"><span>{situacao?.ultimo ? formatDay(situacao.ultimo.concluidoEm) : "—"}</span></span>
      <span className={`frota-status is-${situacao?.tone ?? "neutral"}`}>
        <span className={`gestao-badge is-${situacao?.tone ?? "neutral"}`}>{situacao?.label ?? "—"}</span>
        {situacao?.detail ? <small>{situacao.detail}</small> : null}
      </span>
      <span className="frota-action">
        {semMotorista && aberto ? <button type="button" className="gestao-button is-secondary is-compact" disabled={busy} onClick={() => onReatribuir(aberto.id)}><Icon name="refresh" size={14} />Tentar de novo</button>
          : aberto ? <button type="button" className="gestao-button is-secondary is-compact" disabled={busy} onClick={() => onVer(aberto.id)}><Icon name="eye" size={14} />Ver checklist</button>
          : <button type="button" className="gestao-button is-secondary is-compact" disabled={busy} aria-label={`Solicitar checklist do ${veiculo.placa}`} onClick={onSolicitar}><Icon name="clipboardCheck" size={14} />Solicitar</button>}
      </span>
    </div>
  );
}

function ChecklistDetail({ item, busy, onLembrar, onReatribuir, onCancelar }: {
  item: ChecklistGestao;
  busy: boolean;
  onLembrar: () => void;
  onReatribuir: () => void;
  onCancelar: () => void;
}) {
  const estado = estadoLabel(item);
  const troca = item.origem === CHECKLIST_ORIGEM.troca;
  const origemPasso = troca
    ? { label: "Troca detectada pela Infleet", time: `${formatDate(item.trocaDetectadaEm || item.solicitadoEm)} · Entregue por ${item.entreguePorNome || "não identificado"}`, done: true, error: false }
    : { label: item.origem === CHECKLIST_ORIGEM.manual ? "Solicitado pela operação" : "Criado pela rotina quinzenal", time: formatDate(item.solicitadoEm), done: true, error: false };
  const reatribuicao = podeReatribuir(item);
  const steps = [
    origemPasso,
    { label: "Atribuído ao motorista", time: item.motoristaNome ? `${item.motoristaNome}${item.atribuidoEm ? ` · ${formatDate(item.atribuidoEm)}` : ""}` : item.erroAtribuicao || "Procurando quem está com o carro", done: Boolean(item.motoristaNome), error: Boolean(item.erroAtribuicao) && !item.motoristaNome },
    ...(item.estado === CHECKLIST_ESTADO.pendente ? [{ label: "Push", time: pushLabel(item), done: item.pushStatus === PUSH.enviado, error: item.pushStatus === PUSH.falhou }] : []),
    item.estado === CHECKLIST_ESTADO.cancelado
      ? { label: "Cancelado", time: `${formatDate(item.canceladoEm)}${item.motivoCancelamento ? ` · ${item.motivoCancelamento}` : ""}`, done: false, error: true }
      : { label: "Enviado pelo motorista", time: formatDate(item.concluidoEm) || "Ainda não enviado", done: item.estado === CHECKLIST_ESTADO.concluido, error: false }
  ];
  const unidade = (chave: string) => item.itens.find((entry) => entry.chave === chave)?.unidade ?? "";
  const isNok = (answer: ChecklistResposta) => answer.tipo === "okNok" && answer.valor === "nok";
  const respostas = [...item.respostas.filter(isNok), ...item.respostas.filter((answer) => !isNok(answer))];
  return (
    <section className="gestao-card gestao-detail" aria-labelledby="chk-detail-title">
      <div className="gestao-detail-head">
        <span className="gestao-avatar is-large" aria-hidden="true"><Icon name="car" size={20} /></span>
        <div><h2 id="chk-detail-title">{item.placa || "Veículo"}</h2><span className={`gestao-badge is-${estado.tone}`}>{estado.label}</span></div>
      </div>
      <div className="gestao-detail-body">
        {item.erroAtribuicao && item.estado === CHECKLIST_ESTADO.aguardandoMotorista ? <p className="chk-alert"><Icon name="alert" size={16} />{item.erroAtribuicao}</p> : null}
        <div className="gestao-timeline">
          <span className="gestao-eyebrow">Linha do tempo</span>
          {steps.map((step, index) => (
            <div key={step.label} className={`gestao-step ${step.done ? "is-done" : step.error ? "is-error" : ""}`} style={{ "--i": index } as CSSProperties}>
              <span className="gestao-step-dot" aria-hidden="true">{step.done ? <Icon name="check" size={14} /> : null}</span>
              <span><strong>{step.label}</strong><small>{step.time}</small></span>
            </div>
          ))}
        </div>
        {isOpen(item) ? (
          <div className="chk-detail-actions">
            {canRemind(item) ? <button type="button" className="gestao-button is-secondary is-compact" disabled={busy} onClick={onLembrar}><Icon name="bell" size={14} />{item.pushStatus === PUSH.falhou ? "Reenviar push" : "Lembrar motorista"}</button> : null}
            {reatribuicao.pode ? <button type="button" className="gestao-button is-secondary is-compact" disabled={busy} onClick={onReatribuir}><Icon name="refresh" size={14} />Tentar atribuir de novo</button> : null}
            <button type="button" className="gestao-button is-secondary is-compact" disabled={busy} onClick={onCancelar}><Icon name="ban" size={14} />Cancelar checklist</button>
            {reatribuicao.aviso ? <p className="gestao-hint">{reatribuicao.aviso}</p> : null}
          </div>
        ) : null}
        {item.estado === CHECKLIST_ESTADO.concluido ? (
          <div className="gestao-detail-block">
            <span className="gestao-eyebrow">Respostas</span>
            <dl className="chk-answers">
              {respostas.map((answer) => (
                <div key={answer.chave} className={isNok(answer) ? "is-problem" : undefined}>
                  <dt>{answer.rotulo}</dt>
                  <dd>
                    {isNok(answer) ? (
                      <span className="chk-problem">
                        <span className="gestao-badge is-danger">Não OK</span>
                        {answer.problemas.length ? <span>{answer.problemas.join(" · ")}</span> : null}
                        {answer.observacao ? <small>{answer.observacao}</small> : null}
                        {answer.fotos.length ? <FotosChecklist fotos={answer.fotos} rotulo={answer.rotulo} /> : null}
                      </span>
                    ) : answer.tipo === "okNok" ? (answer.valor === "ok" ? <span className="gestao-badge is-success">OK</span> : "—")
                      : answer.tipo === "foto" ? (answer.fotos.length ? <FotosChecklist fotos={answer.fotos} rotulo={answer.rotulo} /> : "Sem foto")
                      : answer.tipo === "numero" ? formatNumber(answer.valor, unidade(answer.chave)) : answer.valor || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}
