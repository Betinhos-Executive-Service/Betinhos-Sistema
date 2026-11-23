import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Dialog, Drawer, EmptyState, Field, MetricCard, SearchBox, SegmentedControl, Select, StatusBadge, Surface, Table, TableTitle, Tabs, Textarea, useToast, type MetricTone, type TableColumn } from "@betinhos/ui";
import { PageLayout } from "../../../../app/PageLayout";
import { ArrowDown, ArrowLeft, ArrowUp, Ban, Bell, Car, Check, CircleCheck, Clock, ClipboardCheck, Copy, Eye, List, Plus, RefreshCw, Search, Send, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
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

type Tab = "veiculos" | "checklists" | "modelos" | "padroes";
type Dialogo =
  | { kind: "solicitar"; veiculo: VeiculoFrota }
  | { kind: "cancelar"; checklist: ChecklistGestao }
  | { kind: "descartar" }
  | { kind: "padrao"; substitui: string }
  | { kind: "removerItem"; uid: string; nome: string; voltarFoco: string };

const isOpen = (item: ChecklistGestao) => item.estado === CHECKLIST_ESTADO.aguardandoMotorista || item.estado === CHECKLIST_ESTADO.pendente;
const dataHoraFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const formatDate = (value: string | null) => value ? dataHoraFormat.format(new Date(value)).replace(",", "") : "";
const diaFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const numeroFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const formatDay = (value: string | null) => value ? diaFormat.format(new Date(value)) : "";
const formatNumber = (value: string, unidade: string) => {
  const number = Number(value);
  if (!value || !Number.isFinite(number)) return value || "—";
  return `${numeroFormat.format(number)}${unidade ? ` ${unidade}` : ""}`;
};
const sameModelo = (a: Modelo | null, b: Modelo | null) => JSON.stringify(a) === JSON.stringify(b);
const clonar = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const horaFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const horaAgora = () => horaFormat.format(new Date());

export function GestaoChecklists({ titulo }: { titulo: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("veiculos");
  useEffect(() => { setErrorLogContext({ screen: `frota-checklists/${tab}` }); }, [tab]);
  const [frota, setFrota] = useState<VeiculoFrota[]>([]);
  const [checklists, setChecklists] = useState<ChecklistGestao[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
  const [dialog, setDialog] = useState<Dialogo | null>(null);
  const [dialogModeloId, setDialogModeloId] = useState("");
  const [dialogMotivo, setDialogMotivo] = useState("");
  const dialogVolta = useRef<HTMLElement | string | null>(null);
  // Padrões: lidos só ao abrir a aba (180 dias de checklists enviados) e recalculados no navegador ao trocar o período.
  const [padroesRows, setPadroesRows] = useState<ChecklistGestao[] | null>(null);
  const [padroesLoading, setPadroesLoading] = useState(false);
  const [padroesFalhou, setPadroesFalhou] = useState(false);
  const [periodo, setPeriodo] = useState<PeriodoPadroes>(PERIODO_PADROES_INICIAL);
  const [padraoAberto, setPadraoAberto] = useState("");
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
  const linhasModelos = useMemo(() => ordenarModelos(modelos).map((modelo, index) => ({ modelo, index, padrao: ehPadrao(modelo), recebe: resumoFiltro(modelo, opcoesFiltro) })), [modelos, opcoesFiltro]);
  const totalOrdenaveis = linhasModelos.filter((linha) => !linha.padrao).length;
  const frotaTerm = frotaSearch.trim().toLowerCase();
  const frotaVisivel = frota
    .filter((veiculo) => !frotaTerm || `${veiculo.placa} ${veiculo.modelo} ${veiculo.motoristaNome}`.toLowerCase().includes(frotaTerm))
    .sort((a, b) => (situacoes.get(a.id)?.ordem ?? 9) - (situacoes.get(b.id)?.ordem ?? 9) || a.placa.localeCompare(b.placa));
  const chkTerm = chkSearch.trim().toLowerCase();
  const chkBuscados = checklists.filter((item) => !chkTerm || checklistBuscaTexto(item).toLowerCase().includes(chkTerm));
  const chkVisiveis = chkBuscados.filter((item) => matchChk(chkFilter, item));
  const selectedChk = checklists.find((item) => item.id === selectedChkId) ?? null;
  const contagem = {
    emDia: [...situacoes.values()].filter((item) => item.tone === "success").length,
    pendentes: veiculosComMotorista(checklists),
    atencao: [...situacoes.values()].filter((item) => item.tone === "danger").length
  };
  const dirty = Boolean(editing) && !sameModelo(editing, editingOriginal);
  const erroMotivo = dialog?.kind === "cancelar" ? erroMotivoCancelamento(dialogMotivo) : "";

  const avisar = (message: string) => toast({ tone: "success", message });
  const falhar = (message: string) => toast({ tone: "danger", message });

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
        falhar(cause instanceof Error ? cause.message : "Não foi possível carregar os checklists.");
      })
      .finally(() => setLoading(false));
    // Em paralelo e com erro próprio: a situação por carro usa o modelo de cada um; sem estes dados vale o padrão.
    void carregarVeiculosFiltro();
  }, []);

  // `conferir` lê a lista recarregada e devolve o erro a mostrar quando a ação terminou sem o efeito esperado.
  const run = async (action: () => Promise<void>, success: string, failure: string, conferir?: (checklists: ChecklistGestao[]) => string) => {
    setBusy(true);
    let done = false;
    try {
      await action();
      done = true;
      const lista = await load();
      const erro = conferir ? conferir(lista) : "";
      if (erro) falhar(erro); else avisar(success);
    } catch (cause) {
      void logAppError(cause, { action: failure, phase: done ? "refresh" : "submit", component: "GestaoChecklists" });
      falhar(done ? `${success.replace(/\.$/, "")}, mas não foi possível atualizar a tela. Toque em Atualizar.` : cause instanceof Error && cause.message ? cause.message : failure);
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
      falhar(cause instanceof Error && cause.message ? cause.message : "Não foi possível carregar os padrões.");
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
      if (tab === "padroes") falhar("Não foi possível atualizar os padrões. Os números são da última leitura.");
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


  // ---------- Diálogos ----------

  // Ao fechar, o foco volta para onde estava (ou para o seletor indicado quando o elemento de origem some).
  const abrirDialog = (next: Dialogo, volta?: string) => {
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
      avisar(aviso || "Modelo salvo.");
      try { await load(); } catch (cause) {
        void logAppError(cause, { action: "salvar-modelo", phase: "refresh", component: "GestaoChecklists" });
        falhar("Modelo salvo, mas não foi possível atualizar a lista. Toque em Atualizar.");
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
      falhar(cause instanceof Error && cause.message ? cause.message : "Não foi possível salvar o modelo.");
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

  const kpis: { label: string; value: number; tone: MetricTone; icon: LucideIcon; hint: string }[] = [
    { label: "Frota própria", value: frota.length, tone: "info", icon: Car, hint: isMock ? "Dados de exemplo" : "Carros próprios ativos" },
    { label: "Em dia", value: contagem.emDia, tone: "success", icon: CircleCheck, hint: `Padrão: vistoria a cada ${periodicidade} ${plural(periodicidade, "dia", "dias")}` },
    { label: "Com o motorista", value: contagem.pendentes, tone: contagem.pendentes ? "warning" : "info", icon: Clock, hint: contagem.pendentes ? "Aguardando envio pelo app" : "Nenhum pendente" },
    { label: "Precisam de atenção", value: contagem.atencao, tone: contagem.atencao ? "danger" : "success", icon: TriangleAlert, hint: contagem.atencao ? "Vencidos, com problema, sem checklist ou sem motorista" : "Nenhum problema" }
  ];

  const tabs = [
    { value: "veiculos" as const, label: "Veículos", badge: loading ? undefined : frota.length },
    { value: "checklists" as const, label: "Checklists", badge: loading ? undefined : checklists.filter(isOpen).length },
    { value: "modelos" as const, label: "Modelos", badge: loading ? undefined : modelos.length },
    { value: "padroes" as const, label: "Padrões" }
  ];

  const colunasFrota: TableColumn<VeiculoFrota>[] = [
    { key: "veiculo", header: "Veículo", width: "minmax(170px, 1fr)", cell: (veiculo) => <TableTitle title={veiculo.placa} meta={`${veiculo.modelo || "Modelo não informado"}${veiculo.hodometro != null ? ` · ${numeroFormat.format(veiculo.hodometro)} km` : ""}`} /> },
    { key: "motorista", header: "Motorista atual", width: "minmax(180px, 1fr)", hideBelow: "mobile", cell: (veiculo) => veiculo.motoristaNome
      ? <TableTitle title={<span className="chk-texto">{veiculo.motoristaNome}</span>} meta={veiculo.motoristaDesde ? `Desde ${formatDay(veiculo.motoristaDesde)}` : undefined} />
      : <StatusBadge tone="danger">Sem motorista na Infleet</StatusBadge> },
    { key: "ultima", header: "Última vistoria", width: "130px", hideBelow: "compact", cell: (veiculo) => { const ultimo = situacoes.get(veiculo.id)?.ultimo; return ultimo ? formatDay(ultimo.concluidoEm) : <span className="chk-vazio">—</span>; } },
    { key: "situacao", header: "Situação", width: "minmax(200px, 1.3fr)", cell: (veiculo) => {
      const situacao = situacoes.get(veiculo.id);
      return <span className="chk-situacao"><StatusBadge tone={situacao?.tone ?? "neutral"} dot>{situacao?.label ?? "—"}</StatusBadge>{situacao?.detail ? <small>{situacao.detail}</small> : null}</span>;
    } },
    { key: "acao", header: <span className="bt-sr-only">Ação</span>, label: "Ação", width: "160px", align: "end", cell: (veiculo) => <AcaoVeiculo veiculo={veiculo} situacao={situacoes.get(veiculo.id)} busy={busy} onSolicitar={() => askSolicitar(veiculo)} onVer={setSelectedChkId} onReatribuir={(id) => void reatribuir(id)} /> }
  ];

  const colunasChecklists: TableColumn<ChecklistGestao>[] = [
    { key: "veiculo", header: "Veículo", width: "minmax(170px, 1fr)", cell: (item) => <TableTitle title={item.placa || "Veículo"} meta={`${origemLabel(item)} · ${item.modeloNome || "Modelo"}`} /> },
    { key: "motorista", header: "Motorista", width: "minmax(170px, 1fr)", hideBelow: "mobile", cell: (item) => item.motoristaNome ? <span className="chk-texto">{item.motoristaNome}</span> : <StatusBadge tone={item.erroAtribuicao ? "danger" : "info"}>{item.erroAtribuicao ? "Sem motorista" : "Atribuindo"}</StatusBadge> },
    { key: "data", header: "Data", width: "120px", hideBelow: "compact", cell: (item) => formatDay(item.concluidoEm || item.canceladoEm || item.solicitadoEm) },
    { key: "situacao", header: "Situação", width: "minmax(170px, .8fr)", cell: (item) => { const estado = estadoLabel(item); return <StatusBadge tone={estado.tone} dot>{estado.label}</StatusBadge>; } }
  ];

  type LinhaModelo = (typeof linhasModelos)[number];
  const colunasModelos: TableColumn<LinhaModelo>[] = [
    { key: "modelo", header: "Modelo", width: "minmax(240px, 2fr)", cell: ({ modelo, recebe, index }) => {
      return (
        <span className="chk-modelo">
          <button type="button" className="chk-modelo__nome" data-foco={`modelo-${modelo.id}`} disabled={busy} onClick={() => startEdit(modelo, `modelo-${modelo.id}`)}>
            <span className="chk-modelo__ordem">{index + 1}.</span> {modelo.nome}
          </button>
          <small>{modelo.descricao || "Sem descrição"}</small>
          <small className="chk-modelo__recebe"><Car size={14}/>{recebe}</small>
        </span>
      );
    } },
    { key: "itens", header: "Itens", width: "90px", hideBelow: "mobile", cell: ({ modelo }) => `${modelo.itens.length} ${plural(modelo.itens.length, "item", "itens")}` },
    { key: "periodicidade", header: "Periodicidade", width: "120px", hideBelow: "compact", cell: ({ modelo }) => `${modelo.periodicidadeDias} ${plural(modelo.periodicidadeDias, "dia", "dias")}` },
    { key: "situacao", header: "Situação", width: "minmax(140px, .8fr)", cell: ({ modelo, padrao: ehOPadrao }) => (
      <span className="chk-badges"><StatusBadge tone={modelo.ativo ? "success" : "neutral"} dot>{modelo.ativo ? "Ativo" : "Inativo"}</StatusBadge>{ehOPadrao ? <StatusBadge tone="info">Padrão</StatusBadge> : null}</span>
    ) },
    { key: "acoes", header: <span className="bt-sr-only">Ações</span>, label: "Ações", width: "136px", align: "end", cell: ({ modelo, padrao: ehOPadrao, index }) => {
      return (
        <span className="chk-acoes">
          {ehOPadrao ? null : <>
            <Button variant="ghost" size="compact" icon={<ArrowUp size={16}/>} data-foco={`subir-${modelo.id}`} disabled={busy || index === 0} aria-label={`Subir ${modelo.nome} na ordem (posição ${index + 1} de ${totalOrdenaveis})`} title="Subir" onClick={() => void moverModelo(modelo, -1)} />
            <Button variant="ghost" size="compact" icon={<ArrowDown size={16}/>} data-foco={`descer-${modelo.id}`} disabled={busy || index === totalOrdenaveis - 1} aria-label={`Descer ${modelo.nome} na ordem (posição ${index + 1} de ${totalOrdenaveis})`} title="Descer" onClick={() => void moverModelo(modelo, 1)} />
          </>}
          <Button variant="ghost" size="compact" icon={<Copy size={16}/>} data-foco={`duplicar-${modelo.id}`} disabled={busy} aria-label={`Duplicar ${modelo.nome}`} title="Duplicar modelo" onClick={() => startEdit(duplicarModelo(modelo), `duplicar-${modelo.id}`, true)} />
        </span>
      );
    } }
  ];

  const acoes = editing ? undefined : (
    <>
      <Button variant="secondary" icon={<RefreshCw size={16}/>} loading={refreshing} disabled={busy} onClick={() => void refreshView()}>Atualizar</Button>
      {tab === "modelos" ? <Button icon={<Plus size={16}/>} data-foco="novo-modelo" disabled={busy} onClick={() => startEdit(null, "novo-modelo")}>Novo modelo</Button> : null}
    </>
  );

  const dialogo = dialog ? dialogTexto(dialog) : null;

  return (
    <PageLayout
      className="frota-page gestao-checklists"
      eyebrow={editing ? undefined : "Frota"}
      breadcrumb={editing ? <Button variant="ghost" size="compact" icon={<ArrowLeft size={14} />} disabled={busy} onClick={leaveEdit}>Modelos</Button> : undefined}
      title={editing ? (editingOriginal?.id ? editingOriginal.nome || "Modelo" : "Novo modelo") : titulo}
      description={editing ? "Defina o que o motorista fotografa e confere. Checklists já criados mantêm a versão anterior." : "Vistorias da frota própria enviadas pelos motoristas no App Motoristas."}
      meta={editing ? undefined : <StatusBadge tone={isMock ? "neutral" : "info"} dot>{isMock ? "Dados de exemplo" : "Dataverse"}</StatusBadge>}
      actions={acoes}
      tabs={editing ? undefined : <Tabs aria-label="Seções" tabs={tabs} value={tab} onChange={setTab} />}
    >
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
          {tab !== "padroes" ? (
            <div className="frota-kpis frota-kpis--4">
              {kpis.map((kpi) => <MetricCard key={kpi.label} icon={<kpi.icon size={20} />} tone={kpi.tone} label={kpi.label} value={kpi.value} hint={kpi.hint} loading={loading} />)}
            </div>
          ) : null}

          {tab === "veiculos" ? (
            <Surface flush eyebrow="Frota própria" title="Situação por veículo" action={<span className="chk-hint">Motorista atual conforme a Infleet</span>}>
              <div className="chk-toolbar">
                <SearchBox className="chk-busca" aria-label="Buscar veículo" placeholder="Buscar placa, modelo ou motorista" value={frotaSearch} onChange={setFrotaSearch} />
              </div>
              <div className="chk-tabela-frota"><Table aria-label="Situação por veículo" columns={colunasFrota} rows={frotaVisivel} rowKey={(veiculo) => veiculo.id} loading={loading}
                empty={frota.length
                  ? <EmptyState compact icon={<Search size={32}/>} title="Nenhum veículo encontrado">Limpe a busca para ver a frota toda.</EmptyState>
                  : <EmptyState compact icon={<Car size={32}/>} title="Nenhum carro próprio ativo">Cadastre a categoria e o status do veículo no Dataverse.</EmptyState>}
                footer={loading ? undefined : <span className="chk-hint">{frotaVisivel.length} de {frota.length}</span>} /></div>
            </Surface>
          ) : null}

          {tab === "checklists" ? (
            <Surface flush eyebrow="Vistorias" title="Checklists">
              <div className="chk-toolbar">
                <SearchBox className="chk-busca" aria-label="Buscar checklist" placeholder="Buscar placa, motorista ou modelo" value={chkSearch} onChange={setChkSearch} />
                <SegmentedControl aria-label="Filtrar checklists" size="compact" className="chk-filtros" value={chkFilter} onChange={setChkFilter}
                  options={CHK_FILTERS.map((item) => ({ value: item.id, label: `${item.grupo === "origem" ? "Origem: " : ""}${item.label} · ${chkBuscados.filter((row) => matchChk(item.id, row)).length}` }))} />
              </div>
              <Table aria-label="Checklists" columns={colunasChecklists} rows={chkVisiveis} rowKey={(item) => item.id} loading={loading} onRowClick={(item) => setSelectedChkId(item.id)} rowActions={() => []}
                empty={<EmptyState compact icon={<ClipboardCheck size={32}/>} title={chkFilter === "abertos" ? "Nenhum checklist em aberto" : chkFilter === "trocas" && !chkTerm ? "Nenhuma troca detectada" : "Nenhum checklist encontrado"}>
                  {chkFilter === "abertos" ? "A rotina diária cria as vistorias quinzenais; use Solicitar na aba Veículos para pedir uma extra." : chkFilter === "trocas" && !chkTerm ? "Quando a Infleet mostrar um carro passando para outro motorista, o checklist de recebimento aparece aqui." : "Troque o filtro ou limpe a busca."}
                </EmptyState>}
                footer={loading ? undefined : <span className="chk-hint">{chkVisiveis.length} de {checklists.length}</span>} />
            </Surface>
          ) : null}

          {tab === "modelos" ? (
            <Surface flush eyebrow="Itens da vistoria" title="Modelos de checklist" action={<span className="chk-hint">{padrao ? `Rotina quinzenal usa: ${padrao.nome}` : "Nenhum modelo marcado para a rotina quinzenal"}</span>}>
              {modelos.length > 1 ? <p className="chk-toolbar chk-hint">Quando um veículo se encaixa em dois modelos, vale o que está mais acima. Use Subir e Descer para mudar a ordem; o padrão fica sempre por último.</p> : null}
              <Table aria-label="Modelos de checklist" columns={colunasModelos} rows={linhasModelos} rowKey={({ modelo }) => modelo.id} loading={loading}
                empty={<EmptyState compact icon={<List size={32}/>} title="Nenhum modelo ainda">Crie o primeiro pelo botão Novo modelo e marque para a rotina quinzenal.</EmptyState>} />
            </Surface>
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
              onAbrir={setSelectedChkId}
            />
          ) : null}
        </>
      )}

      <Drawer open={Boolean(selectedChk) && !editing} onClose={() => setSelectedChkId("")} eyebrow="Checklist" title={selectedChk?.placa || "Veículo"}>
        {selectedChk ? (
          <ChecklistDetail key={selectedChk.id} item={selectedChk} busy={busy}
            onLembrar={() => void run(() => lembrarMotorista(selectedChk.id), "Lembrete enviado ao motorista.", "Não foi possível lembrar o motorista.")}
            onReatribuir={() => void reatribuir(selectedChk.id)}
            onCancelar={() => { setDialogMotivo(""); abrirDialog({ kind: "cancelar", checklist: selectedChk }); }} />
        ) : null}
      </Drawer>

      <Dialog open={Boolean(dialog)} onClose={closeDialog} tone={dialogo?.perigo ? "danger" : "neutral"} title={dialogo?.titulo ?? ""}
        actions={dialog ? (
          <>
            <Button variant="secondary" autoFocus onClick={closeDialog}>{dialog.kind === "descartar" ? "Continuar editando" : "Voltar"}</Button>
            {dialog.kind === "solicitar" ? <Button icon={<Send size={16}/>} disabled={!padrao && !dialogModeloId} onClick={() => void confirmDialog()}>Solicitar checklist</Button>
              : dialog.kind === "cancelar" ? <Button variant="danger" icon={<Ban size={16}/>} disabled={Boolean(erroMotivo)} onClick={() => void confirmDialog()}>Cancelar checklist</Button>
              : dialog.kind === "padrao" ? <Button icon={<ClipboardCheck size={16}/>} onClick={() => void confirmDialog()}>Usar na rotina</Button>
              : dialog.kind === "removerItem" ? <Button variant="danger" icon={<Trash2 size={16}/>} onClick={() => void confirmDialog()}>Remover item</Button>
              : <Button variant="danger" icon={<Trash2 size={16}/>} onClick={() => void confirmDialog()}>Descartar</Button>}
          </>
        ) : null}>
        {dialog ? (
          <div className="chk-dialogo">
            <p>{dialogo?.texto}</p>
            {dialog.kind === "solicitar" && modelosAtivos.length > 1 ? (
              <Field label="Modelo">
                <Select searchable={false} clearable={false} value={dialogModeloId || null} onChange={(value) => setDialogModeloId(value ?? "")}
                  options={modelosAtivos.map((modelo) => ({ value: modelo.id, label: `${modelo.nome}${modelo.padraoQuinzenal ? " (rotina quinzenal)" : ""}` }))} />
              </Field>
            ) : null}
            {dialog.kind === "cancelar" ? (
              <Field label="Motivo" error={erroMotivo || undefined}>
                <Textarea maxLength={500} value={dialogMotivo} placeholder="Ex.: carro na oficina" invalid={Boolean(erroMotivo)} onChange={(event) => setDialogMotivo(event.target.value)} />
              </Field>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </PageLayout>
  );
}

function dialogTexto(dialog: Dialogo): { titulo: string; texto: string; perigo: boolean } {
  switch (dialog.kind) {
    case "solicitar": return {
      titulo: `Solicitar checklist do ${dialog.veiculo.placa}?`, perigo: false,
      texto: dialog.veiculo.motoristaNome ? `${dialog.veiculo.motoristaNome} recebe um push e o checklist aparece no App Motoristas.` : "A Infleet não mostra motorista neste carro agora. O checklist fica aguardando até alguém pegar o veículo."
    };
    case "cancelar": return { titulo: `Cancelar o checklist do ${dialog.checklist.placa}?`, perigo: true, texto: "O checklist sai do app do motorista. As respostas já enviadas em outros checklists não mudam." };
    case "padrao": return { titulo: "Usar este modelo na rotina quinzenal?", perigo: false, texto: `${dialog.substitui ? `Este modelo passa a ser usado na rotina quinzenal no lugar de ${dialog.substitui}.` : "Este modelo passa a ser usado na rotina quinzenal."} A troca vale quando você salvar.` };
    case "removerItem": return { titulo: `Remover “${dialog.nome}”?`, perigo: true, texto: "O item sai dos próximos checklists quando você salvar. Checklists já criados mantêm as respostas." };
    default: return { titulo: "Descartar alterações?", perigo: true, texto: "As mudanças neste modelo ainda não foram salvas." };
  }
}

function AcaoVeiculo({ veiculo, situacao, busy, onSolicitar, onVer, onReatribuir }: {
  veiculo: VeiculoFrota;
  situacao?: SituacaoVeiculo;
  busy: boolean;
  onSolicitar: () => void;
  onVer: (id: string) => void;
  onReatribuir: (id: string) => void;
}) {
  const aberto = situacao?.aberto;
  const semMotorista = aberto?.estado === CHECKLIST_ESTADO.aguardandoMotorista && Boolean(aberto.erroAtribuicao);
  if (semMotorista && aberto) return <Button variant="secondary" size="compact" icon={<RefreshCw size={14}/>} disabled={busy} onClick={() => onReatribuir(aberto.id)}>Tentar de novo</Button>;
  if (aberto) return <Button variant="secondary" size="compact" icon={<Eye size={14}/>} disabled={busy} onClick={() => onVer(aberto.id)}>Ver checklist</Button>;
  return <Button variant="secondary" size="compact" icon={<ClipboardCheck size={14}/>} disabled={busy} aria-label={`Solicitar checklist do ${veiculo.placa}`} onClick={onSolicitar}>Solicitar</Button>;
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
    <div className="chk-detalhe">
      <div className="chk-detalhe__resumo">
        <StatusBadge tone={estado.tone} dot>{estado.label}</StatusBadge>
        <span className="chk-hint">{origemLabel(item)} · {item.modeloNome || "Modelo"}</span>
      </div>
      {item.erroAtribuicao && item.estado === CHECKLIST_ESTADO.aguardandoMotorista ? <Alert tone="danger">{item.erroAtribuicao}</Alert> : null}
      <section className="gestao-timeline" aria-label="Linha do tempo">
        <span className="bt-surface__eyebrow">Linha do tempo</span>
        {steps.map((step) => (
          <div key={step.label} className={`gestao-step ${step.done ? "is-done" : step.error ? "is-error" : ""}`}>
            <span className="gestao-step-dot" aria-hidden="true">{step.done ? <Check size={14}/> : null}</span>
            <span><strong>{step.label}</strong><small>{step.time}</small></span>
          </div>
        ))}
      </section>
      {isOpen(item) ? (
        <div className="chk-detalhe__acoes">
          {canRemind(item) ? <Button variant="secondary" size="compact" icon={<Bell size={14}/>} disabled={busy} onClick={onLembrar}>{item.pushStatus === PUSH.falhou ? "Reenviar push" : "Lembrar motorista"}</Button> : null}
          {reatribuicao.pode ? <Button variant="secondary" size="compact" icon={<RefreshCw size={14}/>} disabled={busy} onClick={onReatribuir}>Tentar atribuir de novo</Button> : null}
          <Button variant="secondary" size="compact" icon={<Ban size={14}/>} disabled={busy} onClick={onCancelar}>Cancelar checklist</Button>
          {reatribuicao.aviso ? <p className="chk-hint">{reatribuicao.aviso}</p> : null}
        </div>
      ) : null}
      {item.estado === CHECKLIST_ESTADO.concluido ? (
        <section className="gestao-detail-block" aria-label="Respostas">
          <span className="bt-surface__eyebrow">Respostas</span>
          <dl className="chk-answers">
            {respostas.map((answer) => (
              <div key={answer.chave} className={isNok(answer) ? "is-problem" : undefined}>
                <dt>{answer.rotulo}</dt>
                <dd>
                  {isNok(answer) ? (
                    <span className="chk-problem">
                      <StatusBadge tone="danger">Não OK</StatusBadge>
                      {answer.problemas.length ? <span>{answer.problemas.join(" · ")}</span> : null}
                      {answer.observacao ? <small>{answer.observacao}</small> : null}
                      {answer.fotos.length ? <FotosChecklist fotos={answer.fotos} rotulo={answer.rotulo} /> : null}
                    </span>
                  ) : answer.tipo === "okNok" ? (answer.valor === "ok" ? <StatusBadge tone="success">OK</StatusBadge> : "—")
                    : answer.tipo === "foto" ? (answer.fotos.length ? <FotosChecklist fotos={answer.fotos} rotulo={answer.rotulo} /> : "Sem foto")
                    : answer.tipo === "numero" ? formatNumber(answer.valor, unidade(answer.chave)) : answer.valor || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
