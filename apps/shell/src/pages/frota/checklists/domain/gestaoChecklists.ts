import { createOne, DATAVERSE, executeChangeset, retrieveMetadata, retrieveMultiple, updateOne } from "../data/dataverse";
import {
  CAMPOS_FILTRO,
  compararPrioridade,
  criarResolvedor,
  ehPadrao,
  erroCondicao,
  lerFiltro,
  MAX_FILTRO_JSON,
  VEICULO_CATEGORIA_PROPRIO,
  VEICULO_STATUS,
  type OpcoesFiltro,
  type VeiculoFiltro
} from "./filtroVeiculo";
import {
  CHECKLIST_ESTADO,
  CHECKLIST_ORIGEM,
  CHECKLIST_PROBLEMAS_PADRAO,
  cleanGuid,
  executeChecklistAction,
  isMockChecklists,
  mapChecklist,
  type ChecklistItemTipo,
  type ChecklistResposta,
  type ChecklistVeiculo
} from "./checklists";

// Gestão do checklist de vistoria: frota, checklists e modelos. As ações sobre checklists passam pelas
// Custom APIs do plugin ChecklistCommandPlugin (App Motoristas); modelos são registros comuns.

export const ITEM_TIPO: Record<ChecklistItemTipo, number> = { foto: 100000000, numero: 100000001, texto: 100000002, okNok: 100000003 };
export const PUSH = { pendente: 100000000, enviado: 100000001, falhou: 100000002 } as const;
export const PERIODICIDADE_PADRAO = 15;
const DAY = 86_400_000;
export const MAX_OPCOES_PROBLEMA = 12;
export const MAX_OPCAO_PROBLEMA = 40;

/** `uid` só existe no editor (key do React e foco); nunca vai para o Dataverse. */
export type ModeloItem = { id: string; uid?: string; ordem: number; rotulo: string; instrucao: string; tipo: ChecklistItemTipo; obrigatorio: boolean; unidade: string; opcoesProblema: string };
/** `filtroJson`: new_filtrojson como está gravado ("" = sem filtro); `prioridade`: new_prioridade (menor vence, nulo é o último). */
export type Modelo = { id: string; nome: string; descricao: string; ativo: boolean; padraoQuinzenal: boolean; periodicidadeDias: number; prioridade: number | null; filtroJson: string; itens: ModeloItem[] };

export type ChecklistGestao = ChecklistVeiculo & {
  motoristaNome: string;
  modeloNome: string;
  erroAtribuicao: string;
  pushStatus: number | null;
  pushErro: string;
  atribuidoEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string;
  temProblema: boolean;
  qtdProblemas: number;
  entreguePorId: string;
  entreguePorNome: string;
  trocaDetectadaEm: string | null;
};

export type VeiculoFrota = { id: string; placa: string; modelo: string; hodometro: number | null; motoristaId: string; motoristaNome: string; motoristaDesde: string | null };

export type SituacaoTone = "success" | "warning" | "danger" | "info" | "neutral";
export type SituacaoVeiculo = { tone: SituacaoTone; label: string; detail: string; ordem: number; aberto?: ChecklistGestao; ultimo?: ChecklistGestao };

const formatDay = (value: string | number | Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const isOpen = (item: ChecklistVeiculo) => item.estado === CHECKLIST_ESTADO.aguardandoMotorista || item.estado === CHECKLIST_ESTADO.pendente;
export const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const naoOkLabel = (qtd: number) => `${qtd} ${plural(qtd, "item", "itens")} Não OK`;
/** Veículos distintos com checklist nas mãos de um motorista (pendente); checklist sem veículo não conta. */
export const veiculosComMotorista = (checklists: ChecklistGestao[]) =>
  new Set(checklists.filter((item) => item.estado === CHECKLIST_ESTADO.pendente && item.veiculoId).map((item) => cleanGuid(item.veiculoId))).size;
/** Dias antes do vencimento em que o carro passa a "Vence em N dias": 1/5 da periodicidade, entre 1 e 3. */
export const limiarVencimento = (periodicidadeDias: number) => Math.max(1, Math.min(3, Math.floor(periodicidadeDias / 5)));

// ---------- Regras puras ----------

/** `periodicidadeDias` nulo: nenhum modelo se aplica ao carro (fora da rotina), então não há vencimento. */
export function situacaoVeiculo(veiculo: VeiculoFrota, checklists: ChecklistGestao[], periodicidadeDias: number | null, now = Date.now()): SituacaoVeiculo {
  const doVeiculo = checklists.filter((item) => cleanGuid(item.veiculoId) === cleanGuid(veiculo.id));
  const aberto = doVeiculo.filter(isOpen).sort((a, b) => b.solicitadoEm.localeCompare(a.solicitadoEm))[0];
  const ultimo = doVeiculo.filter((item) => item.estado === CHECKLIST_ESTADO.concluido && item.concluidoEm)
    .sort((a, b) => String(b.concluidoEm).localeCompare(String(a.concluidoEm)))[0];
  if (aberto?.estado === CHECKLIST_ESTADO.aguardandoMotorista && aberto.erroAtribuicao) {
    return { tone: "danger", label: "Sem motorista", detail: aberto.erroAtribuicao, ordem: 0, aberto, ultimo };
  }
  if (aberto) {
    const atribuindo = aberto.estado === CHECKLIST_ESTADO.aguardandoMotorista;
    const detail = atribuindo ? "Procurando quem está com o carro na Infleet" : `Com ${aberto.motoristaNome || "o motorista"} desde ${formatDay(aberto.atribuidoEm || aberto.solicitadoEm)}`;
    // O problema do último checklist continua valendo enquanto a nova vistoria não chega.
    if (ultimo?.temProblema) return { tone: "danger", label: naoOkLabel(ultimo.qtdProblemas), detail, ordem: 1, aberto, ultimo };
    return atribuindo
      ? { tone: "info", label: "Atribuindo", detail, ordem: 3, aberto, ultimo }
      : { tone: "warning", label: "Pendente", detail, ordem: 2, aberto, ultimo };
  }
  // Último checklist com item "Não OK": o carro precisa de atenção até uma vistoria sem problema (mesmo fora da rotina).
  if (ultimo?.concluidoEm && ultimo.temProblema) {
    const feito = `Checklist de ${formatDay(ultimo.concluidoEm)}`;
    const vence = periodicidadeDias == null ? null : new Date(ultimo.concluidoEm).getTime() + periodicidadeDias * DAY;
    return { tone: "danger", label: naoOkLabel(ultimo.qtdProblemas), detail: vence != null && vence <= now ? `${feito} · venceu em ${formatDay(vence)}` : feito, ordem: 1, ultimo };
  }
  // Nenhum modelo se aplica: a rotina não cria checklist para o carro, então não há vencimento.
  if (periodicidadeDias == null) return { tone: "neutral", label: "Fora da rotina", detail: "Nenhum modelo de checklist se aplica a este carro", ordem: 6, ultimo };
  if (!ultimo?.concluidoEm) return { tone: "danger", label: "Sem checklist", detail: "Nenhuma vistoria enviada", ordem: 1, ultimo };
  const vence = new Date(ultimo.concluidoEm).getTime() + periodicidadeDias * DAY;
  const dias = Math.ceil((vence - now) / DAY);
  if (dias <= 0) return { tone: "danger", label: "Vencido", detail: `Venceu em ${formatDay(vence)}`, ordem: 1, ultimo };
  if (dias <= limiarVencimento(periodicidadeDias)) return { tone: "warning", label: `Vence em ${dias} ${plural(dias, "dia", "dias")}`, detail: `Última em ${formatDay(ultimo.concluidoEm)}`, ordem: 4, ultimo };
  return { tone: "success", label: "Em dia", detail: `Próxima em ${formatDay(vence)}`, ordem: 5, ultimo };
}

export function periodicidadeVigente(modelos: Modelo[]) {
  return modelos.find((modelo) => modelo.ativo && modelo.padraoQuinzenal)?.periodicidadeDias || PERIODICIDADE_PADRAO;
}

const periodicidadeOk = (dias: number) => Number.isInteger(dias) && dias >= 1 && dias <= 365;

/**
 * Periodicidade de cada carro pelo modelo que a rotina escolhe para ele (mesmo resolvedor da prévia); nulo quando
 * nenhum modelo se aplica. Sem os dados do carro para o filtro (ainda carregando ou falhou), vale a do padrão.
 */
export function periodicidadePorVeiculo(veiculosFiltro: VeiculoFiltro[], modelos: Modelo[]) {
  const escolher = criarResolvedor(modelos);
  const porId = new Map(veiculosFiltro.map((veiculo) => [cleanGuid(veiculo.id), veiculo]));
  const padrao = periodicidadeVigente(modelos);
  return (veiculoId: string): number | null => {
    const veiculo = porId.get(cleanGuid(veiculoId));
    if (!veiculo) return padrao;
    const modelo = escolher(veiculo);
    return modelo ? (periodicidadeOk(modelo.periodicidadeDias) ? modelo.periodicidadeDias : PERIODICIDADE_PADRAO) : null;
  };
}

// ---------- Validação do modelo ----------

export type CampoModelo = "nome" | "periodicidade" | "itens" | "padrao" | "filtro";
export type CampoItem = "rotulo" | "unidade" | "instrucao" | "problemas";
export type ErroModelo =
  | { alvo: "modelo"; campo: CampoModelo; mensagem: string; condicao?: number }
  | { alvo: "item"; uid: string; indice: number; campo: CampoItem; mensagem: string };

/** Chave estável do item no editor: o id gravado ou o uid criado ao adicionar. */
export const itemChave = (item: ModeloItem, index = 0) => item.uid || item.id || `i-${index}`;

/** O modelo padrão salvo não pode deixar de ser padrão (nem ser inativado) sem outro assumir a rotina. */
export function erroPadrao(modelo: Modelo, original: Modelo | null | undefined) {
  const eraPadrao = Boolean(original?.id) && original!.ativo && original!.padraoQuinzenal;
  if (eraPadrao && !(modelo.ativo && modelo.padraoQuinzenal)) {
    return "Este é o modelo da rotina quinzenal. Marque outro modelo para a rotina antes de inativar ou desmarcar este.";
  }
  return "";
}

function errosProblemas(item: ModeloItem) {
  if (item.tipo !== "okNok") return "";
  const opcoes = opcoesProblemaLista(item.opcoesProblema);
  if (opcoes.length > MAX_OPCOES_PROBLEMA) return `Use no máximo ${MAX_OPCOES_PROBLEMA} problemas; remova ${opcoes.length - MAX_OPCOES_PROBLEMA}.`;
  const longa = opcoes.find((opcao) => opcao.length > MAX_OPCAO_PROBLEMA);
  return longa ? `“${longa.slice(0, 24)}…” tem ${longa.length} caracteres; use até ${MAX_OPCAO_PROBLEMA}.` : "";
}

/** Todos os erros do modelo, na ordem da tela; espelha os limites do plugin (que corta em silêncio). */
export function errosModelo(modelo: Modelo, original?: Modelo | null): ErroModelo[] {
  const erros: ErroModelo[] = [];
  const nome = modelo.nome.trim();
  if (!nome) erros.push({ alvo: "modelo", campo: "nome", mensagem: "Informe o nome do modelo." });
  else if (nome.length > 150) erros.push({ alvo: "modelo", campo: "nome", mensagem: "Use até 150 caracteres no nome do modelo." });
  if (!periodicidadeOk(modelo.periodicidadeDias)) {
    erros.push({ alvo: "modelo", campo: "periodicidade", mensagem: "Informe a periodicidade entre 1 e 365 dias." });
  }
  const padrao = erroPadrao(modelo, original);
  if (padrao) erros.push({ alvo: "modelo", campo: "padrao", mensagem: padrao });
  // O padrão ignora o filtro (a seção fica escondida): só valida o filtro dos outros modelos.
  if (!modelo.padraoQuinzenal) {
    lerFiltro(modelo.filtroJson).condicoes.forEach((condicao, indice) => {
      const mensagem = erroCondicao(condicao);
      if (mensagem) erros.push({ alvo: "modelo", campo: "filtro", condicao: indice, mensagem: `Condição ${indice + 1} do filtro: ${mensagem.charAt(0).toLowerCase()}${mensagem.slice(1)}` });
    });
    if (modelo.filtroJson.length > MAX_FILTRO_JSON) erros.push({ alvo: "modelo", campo: "filtro", mensagem: "O filtro ficou grande demais. Use menos condições ou valores mais curtos." });
  }
  if (!modelo.itens.length) erros.push({ alvo: "modelo", campo: "itens", mensagem: "Adicione pelo menos um item ao modelo." });
  if (modelo.itens.length > 60) erros.push({ alvo: "modelo", campo: "itens", mensagem: "Use no máximo 60 itens por modelo." });
  modelo.itens.forEach((item, indice) => {
    const base = { alvo: "item" as const, uid: itemChave(item, indice), indice };
    const rotulo = item.rotulo.trim();
    if (!rotulo) erros.push({ ...base, campo: "rotulo", mensagem: "Dê um nome ao item." });
    else if (rotulo.length > 150) erros.push({ ...base, campo: "rotulo", mensagem: "Use até 150 caracteres no nome." });
    if (item.tipo === "numero" && item.unidade.trim().length > 20) erros.push({ ...base, campo: "unidade", mensagem: "Use até 20 caracteres na unidade." });
    if (item.instrucao.trim().length > 1000) erros.push({ ...base, campo: "instrucao", mensagem: "Use até 1.000 caracteres na instrução." });
    const problemas = errosProblemas(item);
    if (problemas) erros.push({ ...base, campo: "problemas", mensagem: problemas });
  });
  return erros;
}

/** Mensagem do erro com o item identificado, para o resumo do topo e para o erro lançado pelo salvar. */
export function descreverErro(erro: ErroModelo, modelo: Modelo) {
  if (erro.alvo === "modelo") return erro.mensagem;
  const rotulo = modelo.itens[erro.indice]?.rotulo.trim();
  return `Item ${erro.indice + 1}${rotulo ? ` (${rotulo})` : ""}: ${erro.mensagem.charAt(0).toLowerCase()}${erro.mensagem.slice(1)}`;
}

/** Primeira mensagem de erro do modelo (vazio quando pode salvar). */
export function validateModelo(modelo: Modelo, original?: Modelo | null) {
  const [erro] = errosModelo(modelo, original);
  return erro ? descreverErro(erro, modelo) : "";
}

/** Texto do resumo do topo: conta itens com erro e campos do modelo com erro. */
export function resumoErros(erros: ErroModelo[]) {
  const itens = new Set(erros.filter((erro) => erro.alvo === "item").map((erro) => erro.uid)).size;
  const campos = erros.filter((erro) => erro.alvo === "modelo").length;
  if (!campos) return `${itens} ${plural(itens, "item precisa", "itens precisam")} de ajuste`;
  const total = itens + campos;
  return `${total} ${plural(total, "ponto precisa", "pontos precisam")} de ajuste`;
}

// ---------- Problemas do OK / Não OK ----------

/** Opções de problema gravadas (uma por linha), sem espaços nem linhas vazias. */
export const opcoesProblemaLista = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
/** Opções que o motorista verá: sem nenhuma cadastrada, vale a lista padrão. */
export function opcoesProblemaEfetivas(item: ModeloItem) {
  const opcoes = opcoesProblemaLista(item.opcoesProblema);
  return opcoes.length ? opcoes : [...CHECKLIST_PROBLEMAS_PADRAO];
}
/** O plugin corta em silêncio opção acima de 40 caracteres: o editor recusa antes de salvar. */
export function opcoesProblemaInvalidas(item: ModeloItem) {
  return Boolean(errosProblemas(item));
}

const chaveTexto = (value: string) => value.trim().toLocaleLowerCase("pt-BR");

/**
 * Acrescenta problemas digitados (separados por vírgula ou quebra de linha) à lista do item. Recusa repetido
 * (sem diferenciar maiúsculas), acima de 40 caracteres e além de 12, e devolve o aviso do que ficou de fora.
 */
export function adicionarProblemas(atuais: string[], digitado: string): { lista: string[]; aviso: string } {
  const lista = [...atuais];
  let aviso = "";
  for (const opcao of digitado.split(/[,\n]/).map((part) => part.trim()).filter(Boolean)) {
    if (opcao.length > MAX_OPCAO_PROBLEMA) { aviso = `“${opcao.slice(0, 24)}…” tem ${opcao.length} caracteres; use até ${MAX_OPCAO_PROBLEMA}.`; continue; }
    if (lista.some((item) => chaveTexto(item) === chaveTexto(opcao))) { aviso = `“${opcao}” já está na lista.`; continue; }
    if (lista.length >= MAX_OPCOES_PROBLEMA) { aviso = `Limite de ${MAX_OPCOES_PROBLEMA} problemas atingido.`; break; }
    lista.push(opcao);
  }
  return { lista, aviso };
}

// ---------- Itens: criar, mover, duplicar, prontos ----------

const novoUid = () => globalThis.crypto?.randomUUID?.() ?? `u-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Move o item de uma posição para outra e renumera a ordem. */
export function moverItem(itens: ModeloItem[], de: number, para: number) {
  if (de === para || de < 0 || para < 0 || de >= itens.length || para >= itens.length) return itens;
  const next = [...itens];
  const [item] = next.splice(de, 1);
  next.splice(para, 0, item);
  return next.map((entry, position) => ({ ...entry, ordem: position + 1 }));
}

export function moveItem(itens: ModeloItem[], index: number, delta: -1 | 1) {
  return moverItem(itens, index, index + delta);
}

/** Padrão de "Obrigatório" por tipo: foto e OK / Não OK são obrigatórios; número e texto, opcionais. */
export const obrigatorioPadrao = (tipo: ChecklistItemTipo) => tipo === "foto" || tipo === "okNok";

export const novoItem = (ordem: number, tipo: ChecklistItemTipo = "foto"): ModeloItem => ({ id: "", uid: novoUid(), ordem, rotulo: "", instrucao: "", tipo, obrigatorio: obrigatorioPadrao(tipo), unidade: "", opcoesProblema: "" });
export const novoModelo = (): Modelo => ({ id: "", nome: "", descricao: "", ativo: true, padraoQuinzenal: false, periodicidadeDias: PERIODICIDADE_PADRAO, prioridade: null, filtroJson: "", itens: [] });

/** Garante uid estável em todos os itens (o editor usa como key do React e alvo de foco). */
export const comUids = (modelo: Modelo): Modelo => ({ ...modelo, itens: modelo.itens.map((item) => ({ ...item, uid: item.uid || item.id || novoUid() })) });

/** Cópia ainda não gravada: sem ids, fora da rotina quinzenal, ativa. */
export function duplicarModelo(modelo: Modelo): Modelo {
  return {
    ...modelo,
    id: "",
    nome: `Cópia de ${modelo.nome}`.slice(0, 150),
    ativo: true,
    padraoQuinzenal: false,
    itens: modelo.itens.map((item, index) => ({ ...item, id: "", uid: novoUid(), ordem: index + 1 }))
  };
}

// ---------- Prioridade entre modelos ----------

/** Ordem da lista de Modelos: por prioridade (quem vem primeiro vence) e o padrão sempre por último. */
export function ordenarModelos(modelos: Modelo[]) {
  return [...modelos.filter((modelo) => !ehPadrao(modelo)).sort(compararPrioridade), ...modelos.filter(ehPadrao)];
}

/** Prioridade de um modelo novo ou cópia: depois de todos os outros. */
export function proximaPrioridade(modelos: Modelo[]) {
  const usadas = modelos.filter((modelo) => !ehPadrao(modelo)).map((modelo) => modelo.prioridade).filter((value): value is number => value != null);
  return Math.floor((usadas.length ? Math.max(...usadas) : 0) / 10) * 10 + 10;
}

/**
 * Sobe (-1) ou desce (+1) o modelo entre os não padrão e renumera 10, 20, 30…: devolve só as prioridades que mudaram,
 * a nova posição (base 0) e o total. Sem mudanças quando não há para onde mover.
 */
export function moverPrioridade(modelos: Modelo[], id: string, delta: -1 | 1) {
  const ordem = ordenarModelos(modelos).filter((modelo) => !ehPadrao(modelo));
  const de = ordem.findIndex((modelo) => modelo.id === id);
  const para = de + delta;
  if (de < 0 || para < 0 || para >= ordem.length) return { mudancas: [], posicao: de, total: ordem.length };
  const [modelo] = ordem.splice(de, 1);
  ordem.splice(para, 0, modelo);
  const mudancas = ordem.flatMap((entry, index) => entry.prioridade === (index + 1) * 10 ? [] : [{ id: entry.id, prioridade: (index + 1) * 10 }]);
  return { mudancas, posicao: para, total: ordem.length };
}

export type ItemPronto = { chave: string; rotulo: string; tipo: ChecklistItemTipo; instrucao: string; problemas: string[] };
const PLACA = "Enquadre o carro inteiro, com a placa legível.";
export const ITENS_PRONTOS: ItemPronto[] = [
  { chave: "frente", rotulo: "Frente do veículo", tipo: "foto", instrucao: PLACA, problemas: [] },
  { chave: "traseira", rotulo: "Traseira do veículo", tipo: "foto", instrucao: PLACA, problemas: [] },
  { chave: "lateral-esquerda", rotulo: "Lateral esquerda", tipo: "foto", instrucao: "Enquadre a lateral inteira, da frente à traseira.", problemas: [] },
  { chave: "lateral-direita", rotulo: "Lateral direita", tipo: "foto", instrucao: "Enquadre a lateral inteira, da frente à traseira.", problemas: [] },
  { chave: "pneus", rotulo: "Pneus", tipo: "okNok", instrucao: "", problemas: ["Murcho", "Careca", "Furado", "Outro"] },
  { chave: "farois", rotulo: "Faróis e lanternas", tipo: "okNok", instrucao: "", problemas: ["Queimado", "Quebrado", "Outro"] },
  { chave: "vidros", rotulo: "Para-brisa e vidros", tipo: "okNok", instrucao: "", problemas: ["Trincado", "Riscado", "Outro"] },
  { chave: "painel", rotulo: "Luzes de alerta no painel", tipo: "okNok", instrucao: "", problemas: ["Injeção", "Freio", "Óleo", "Bateria", "Outra"] },
  { chave: "limpeza-interna", rotulo: "Limpeza interna", tipo: "okNok", instrucao: "", problemas: ["Sujo", "Com lixo", "Com cheiro", "Outro"] },
  { chave: "limpeza-externa", rotulo: "Limpeza externa", tipo: "okNok", instrucao: "", problemas: ["Sujo", "Outro"] },
  { chave: "combustivel", rotulo: "Combustível acima de 1/4", tipo: "okNok", instrucao: "", problemas: ["Abaixo de 1/4", "Na reserva"] },
  { chave: "estepe", rotulo: "Estepe, macaco e triângulo", tipo: "okNok", instrucao: "", problemas: ["Faltando", "Estepe murcho", "Outro"] },
  { chave: "documento", rotulo: "Documento do veículo", tipo: "okNok", instrucao: "", problemas: ["Faltando", "Vencido"] },
  { chave: "observacoes", rotulo: "Observações", tipo: "texto", instrucao: "Avarias, limpeza, itens faltando ou o que mais a operação precisa saber.", problemas: [] }
];

/** Rótulo comparável: sem acento, espaço extra nem maiúsculas. */
export const normalizarRotulo = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export const prontoNoModelo = (modelo: Modelo, pronto: ItemPronto) =>
  modelo.itens.some((item) => normalizarRotulo(item.rotulo) === normalizarRotulo(pronto.rotulo));

export const itemDePronto = (pronto: ItemPronto, ordem: number): ModeloItem => ({
  ...novoItem(ordem, pronto.tipo), rotulo: pronto.rotulo, instrucao: pronto.instrucao, opcoesProblema: pronto.problemas.join("\n")
});

export function canRemind(item: ChecklistGestao) {
  return item.estado === CHECKLIST_ESTADO.pendente && (item.pushStatus === PUSH.enviado || item.pushStatus === PUSH.falhou);
}

// Espelho do ChecklistFactory.KeepsReceiver do plugin: troca já atribuída fica com quem recebeu o carro e
// não é reatribuída (o aviso explica em vez de esconder a ação). Troca nunca atribuída e as outras origens
// reatribuem quando estão aguardando motorista ou com erro de atribuição.
export function podeReatribuir(item: ChecklistGestao): { pode: boolean; aviso: string } {
  const regra = item.estado === CHECKLIST_ESTADO.aguardandoMotorista || Boolean(item.erroAtribuicao);
  if (!regra) return { pode: false, aviso: "" };
  if (item.origem === CHECKLIST_ORIGEM.troca && Boolean(item.motoristaId)) return { pode: false, aviso: "Checklist de troca: fica com quem recebeu o carro." };
  return { pode: true, aviso: "" };
}

export function pushLabel(item: ChecklistGestao) {
  if (item.estado !== CHECKLIST_ESTADO.pendente) return "";
  if (item.pushStatus === PUSH.enviado) return "Push enviado";
  if (item.pushStatus === PUSH.falhou) return `Push falhou · ${item.pushErro || "erro não informado"}`;
  return "Push na fila";
}

export function estadoLabel(item: ChecklistVeiculo): { label: string; tone: SituacaoTone } {
  if (item.estado === CHECKLIST_ESTADO.concluido) return { label: "Enviado", tone: "success" };
  if (item.estado === CHECKLIST_ESTADO.cancelado) return { label: "Cancelado", tone: "neutral" };
  if (item.estado === CHECKLIST_ESTADO.pendente) return { label: "Pendente", tone: "warning" };
  return { label: "Aguardando motorista", tone: "info" };
}

export const origemLabel = (item: ChecklistVeiculo) =>
  item.origem === CHECKLIST_ORIGEM.troca ? "Troca" : item.origem === CHECKLIST_ORIGEM.manual ? "Solicitado" : "Quinzenal";

// Busca da lista de checklists: placa, motorista, modelo, origem e quem entregou (troca).
export const checklistBuscaTexto = (item: ChecklistGestao) =>
  `${item.placa} ${item.motoristaNome} ${item.modeloNome} ${origemLabel(item)} ${item.entreguePorNome}`;

export type ChkFilter = "abertos" | "enviados" | "cancelados" | "trocas" | "todos";
/** Filtros por estado ficam juntos; "Trocas" filtra pela origem e fica num grupo próprio na tela. */
export const CHK_FILTERS: { id: ChkFilter; label: string; grupo: "estado" | "origem" }[] = [
  { id: "abertos", label: "Abertos", grupo: "estado" },
  { id: "enviados", label: "Enviados", grupo: "estado" },
  { id: "cancelados", label: "Cancelados", grupo: "estado" },
  { id: "todos", label: "Todos", grupo: "estado" },
  { id: "trocas", label: "Trocas", grupo: "origem" }
];
export const matchChk = (filter: ChkFilter, item: ChecklistGestao) =>
  filter === "todos" ? true
    : filter === "abertos" ? isOpen(item)
    : filter === "enviados" ? item.estado === CHECKLIST_ESTADO.concluido
    : filter === "trocas" ? item.origem === CHECKLIST_ORIGEM.troca
    : item.estado === CHECKLIST_ESTADO.cancelado;

// ---------- Mapeamento ----------

const text = (value: unknown) => (value == null ? "" : String(value));
const dateOrNull = (value: unknown) => (value ? String(value) : null);
const tipoFromChoice = (value: unknown): ChecklistItemTipo =>
  (Object.keys(ITEM_TIPO) as ChecklistItemTipo[]).find((tipo) => ITEM_TIPO[tipo] === Number(value)) ?? "foto";

export function mapChecklistGestao(row: Record<string, unknown>): ChecklistGestao {
  return {
    ...mapChecklist(row),
    motoristaNome: text(row["_new_motorista_value@OData.Community.Display.V1.FormattedValue"]),
    modeloNome: text(row["_new_modelo_value@OData.Community.Display.V1.FormattedValue"]),
    erroAtribuicao: text(row.new_erroatribuicao),
    pushStatus: row.new_pushstatus == null ? null : Number(row.new_pushstatus),
    pushErro: text(row.new_pusherro),
    atribuidoEm: dateOrNull(row.new_atribuidoem),
    canceladoEm: dateOrNull(row.new_canceladoem),
    motivoCancelamento: text(row.new_motivocancelamento),
    temProblema: row.new_temproblema === true,
    qtdProblemas: Number(row.new_qtdproblemas ?? 0) || 0,
    entreguePorId: text(row._new_entreguepor_value),
    entreguePorNome: text(row["_new_entreguepor_value@OData.Community.Display.V1.FormattedValue"]),
    trocaDetectadaEm: dateOrNull(row.new_trocadetectadaem)
  };
}

// ---------- Mock local ----------

// usoModelo: id do checklist -> id do modelo (no Dataverse vem de _new_modelo_value).
type MockStore = { modelos: Modelo[]; frota: VeiculoFrota[]; checklists: ChecklistGestao[]; usoModelo: Map<string, string>; veiculosFiltro: VeiculoFiltro[] };
let mock: MockStore | null = null;
const mockId = () => globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const iso = (offsetDays: number, now = Date.now()) => new Date(now - offsetDays * DAY).toISOString();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function mockItens(): ModeloItem[] {
  return [
    { id: "i1", ordem: 1, rotulo: "Frente do veículo", instrucao: "Enquadre o carro inteiro, com a placa legível.", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: "" },
    { id: "i2", ordem: 2, rotulo: "Traseira do veículo", instrucao: "Enquadre o carro inteiro, com a placa legível.", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: "" },
    { id: "i3", ordem: 3, rotulo: "Lateral esquerda", instrucao: "", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: "" },
    { id: "i4", ordem: 4, rotulo: "Lateral direita", instrucao: "", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: "" },
    { id: "i5", ordem: 5, rotulo: "Painel ligado", instrucao: "Mostre o hodômetro e o nível de combustível.", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: "" },
    { id: "i6", ordem: 6, rotulo: "Quilometragem", instrucao: "Confira o número do painel.", tipo: "numero", obrigatorio: true, unidade: "km", opcoesProblema: "" },
    { id: "i7", ordem: 7, rotulo: "Combustível", instrucao: "Nível aproximado do tanque.", tipo: "numero", obrigatorio: false, unidade: "%", opcoesProblema: "" },
    { id: "i8", ordem: 8, rotulo: "Observações", instrucao: "Avarias, limpeza, itens faltando ou o que mais a operação precisa saber.", tipo: "texto", obrigatorio: false, unidade: "", opcoesProblema: "" },
    { id: "i9", ordem: 9, rotulo: "Pneus", instrucao: "Confira calibragem e desgaste.", tipo: "okNok", obrigatorio: true, unidade: "", opcoesProblema: "Murcho\nCareca\nFurado\nOutro" },
    { id: "i10", ordem: 10, rotulo: "Lataria", instrucao: "", tipo: "okNok", obrigatorio: true, unidade: "", opcoesProblema: "" }
  ];
}

type MockNok = { problemas: string[]; observacao: string; fotos: number };

function mockChecklist(veiculo: VeiculoFrota, modelo: Modelo, estado: number, solicitadoDias: number, extra: Partial<ChecklistGestao> = {}, nok: Record<string, MockNok> = {}): ChecklistGestao {
  const itens = modelo.itens.map((item) => ({ chave: item.id, ordem: item.ordem, rotulo: item.rotulo, instrucao: item.instrucao, tipo: item.tipo, obrigatorio: item.obrigatorio, unidade: item.unidade, opcoesProblema: item.tipo === "okNok" ? opcoesProblemaEfetivas(item) : [] }));
  const concluido = estado === CHECKLIST_ESTADO.concluido;
  const foto = (rotulo: string, numero: number) => ({ link: `https://example.com/mock-foto-${numero}.jpg`, caminho: "Checklists/DEV/mock", nomeArquivo: `${rotulo}-${numero}.jpg` });
  const respostas: ChecklistResposta[] = concluido ? itens.map((item) => {
    const problema = item.tipo === "okNok" ? nok[item.rotulo] : undefined;
    return {
      chave: item.chave, rotulo: item.rotulo, tipo: item.tipo,
      valor: item.tipo === "numero" ? (item.unidade === "km" ? String((veiculo.hodometro ?? 40000) - 1200) : "75") : item.tipo === "texto" ? "Sem avarias." : item.tipo === "okNok" ? (problema ? "nok" : "ok") : "",
      problemas: problema?.problemas ?? [], observacao: problema?.observacao ?? "",
      fotos: item.tipo === "foto" ? [foto(item.rotulo, 1)] : problema ? Array.from({ length: problema.fotos }, (_, index) => foto(item.rotulo, index + 1)) : []
    };
  }) : [];
  const temProblema = Object.keys(nok).length > 0;
  return {
    id: mockId(), nome: `Checklist ${veiculo.placa}`, motoristaId: estado === CHECKLIST_ESTADO.aguardandoMotorista ? "" : veiculo.motoristaId,
    veiculoId: veiculo.id, placa: veiculo.placa, estado, origem: CHECKLIST_ORIGEM.quinzenal, solicitadoEm: iso(solicitadoDias),
    concluidoEm: concluido ? iso(solicitadoDias - 1) : null, odometro: veiculo.hodometro, itens, respostas,
    motoristaNome: estado === CHECKLIST_ESTADO.aguardandoMotorista ? "" : veiculo.motoristaNome, modeloNome: modelo.nome,
    erroAtribuicao: "", pushStatus: estado === CHECKLIST_ESTADO.pendente ? PUSH.enviado : null, pushErro: "",
    atribuidoEm: estado === CHECKLIST_ESTADO.aguardandoMotorista ? null : iso(solicitadoDias), canceladoEm: null, motivoCancelamento: "",
    temProblema, qtdProblemas: Object.keys(nok).length, entreguePorId: "", entreguePorNome: "", trocaDetectadaEm: null, ...extra
  };
}

function getMock(): MockStore {
  if (mock) return mock;
  const padrao: Modelo = { id: "mod-quinzenal", nome: "Vistoria quinzenal", descricao: "Fotos externas, painel e quilometragem.", ativo: true, padraoQuinzenal: true, periodicidadeDias: 15, prioridade: null, filtroJson: "", itens: mockItens() };
  const entrega: Modelo = { id: "mod-entrega", nome: "Entrega de veículo novo", descricao: "Conferência completa na chegada de um carro à frota.", ativo: false, padraoQuinzenal: false, periodicidadeDias: 15, prioridade: 20, filtroJson: "", itens: mockItens().slice(0, 4) };
  // Filtro que alcança terceiro e aluguel (fora da frota própria do padrão).
  const terceiros: Modelo = {
    id: "mod-terceiros", nome: "Carros de terceiros e aluguel", descricao: "Conferência mensal dos carros que não são da frota própria.", ativo: true, padraoQuinzenal: false, periodicidadeDias: 30, prioridade: 10,
    filtroJson: JSON.stringify({ condicoes: [{ campo: "new_categoriadoveiculo", operador: "em", valor: [100000001, 100000002] }] }),
    itens: mockItens().slice(0, 4).map((item) => ({ ...item, id: `t${item.id}` }))
  };
  const frota: VeiculoFrota[] = [
    { id: "v1", placa: "ABC1D23", modelo: "Corolla Preto", hodometro: 45210, motoristaId: "f1", motoristaNome: "Carlos Andrade", motoristaDesde: iso(20) },
    { id: "v2", placa: "BRA2E19", modelo: "Civic Prata", hodometro: 81233, motoristaId: "f2", motoristaNome: "Marcos Lima", motoristaDesde: iso(40) },
    { id: "v3", placa: "QTP4F55", modelo: "Corolla Branco", hodometro: 12980, motoristaId: "f3", motoristaNome: "Ana Ribeiro", motoristaDesde: iso(8) },
    { id: "v4", placa: "RIO7G21", modelo: "Sentra Grafite", hodometro: 63004, motoristaId: "", motoristaNome: "", motoristaDesde: null },
    { id: "v5", placa: "SPX9H08", modelo: "Corolla Cross Preto", hodometro: 22417, motoristaId: "f5", motoristaNome: "Rafael Souza", motoristaDesde: iso(3) },
    { id: "v6", placa: "MGA3J44", modelo: "Jetta Branco", hodometro: 98112, motoristaId: "f6", motoristaNome: "Paulo Mendes", motoristaDesde: iso(60) },
    { id: "v7", placa: "PRN5K72", modelo: "Spin Prata", hodometro: 71540, motoristaId: "f7", motoristaNome: "Julia Faria", motoristaDesde: iso(25) }
  ];
  const [v1, v2, v3, v4, v5, v6, v7] = frota;
  const checklists = [
    mockChecklist(v1, padrao, CHECKLIST_ESTADO.pendente, 1),
    mockChecklist(v1, padrao, CHECKLIST_ESTADO.concluido, 16),
    mockChecklist(v2, padrao, CHECKLIST_ESTADO.concluido, 4, {}, {
      Pneus: { problemas: ["Murcho", "Careca"], observacao: "Dianteiro direito baixo, calibrei no posto.", fotos: 2 },
      Lataria: { problemas: ["Arranhado"], observacao: "", fotos: 1 }
    }),
    mockChecklist(v3, padrao, CHECKLIST_ESTADO.concluido, 13),
    mockChecklist(v4, padrao, CHECKLIST_ESTADO.aguardandoMotorista, 0, { erroAtribuicao: "Nenhum motorista ativo está com este veículo segundo a Infleet." }),
    mockChecklist(v5, padrao, CHECKLIST_ESTADO.pendente, 2, { origem: CHECKLIST_ORIGEM.manual, pushStatus: PUSH.falhou, pushErro: "Usuário sem dispositivo registrado." }),
    mockChecklist(v6, padrao, CHECKLIST_ESTADO.cancelado, 30, { canceladoEm: iso(29), motivoCancelamento: "Carro na oficina." }),
    mockChecklist(v7, padrao, CHECKLIST_ESTADO.concluido, 21, {}, { Lataria: { problemas: ["Amassado"], observacao: "", fotos: 1 } }),
    mockChecklist(v3, padrao, CHECKLIST_ESTADO.pendente, 0, { origem: CHECKLIST_ORIGEM.troca, entreguePorId: "f2", entreguePorNome: "Marcos Lima", trocaDetectadaEm: iso(0) }),
    mockChecklist(v2, padrao, CHECKLIST_ESTADO.pendente, 0, { origem: CHECKLIST_ORIGEM.troca, entreguePorNome: "", trocaDetectadaEm: iso(0) })
  ];
  // Histórico de 180 dias para a aba Padrões: só checklists enviados, todos mais antigos que o último enviado de
  // cada carro, para não mudar a situação da aba Veículos.
  const troca = (veiculo: VeiculoFrota, dias: number, entreguePorNome: string, entreguePorId: string, nok: Record<string, MockNok> = {}) =>
    mockChecklist(veiculo, padrao, CHECKLIST_ESTADO.concluido, dias, { origem: CHECKLIST_ORIGEM.troca, entreguePorId, entreguePorNome, trocaDetectadaEm: iso(dias) }, nok);
  const sujo: MockNok = { problemas: ["Sujo"], observacao: "Carro entregue sem lavar.", fotos: 1 };
  const pneu = (problema: string): MockNok => ({ problemas: [problema], observacao: "", fotos: 1 });
  const historico = [
    troca(v1, 40, "Marcos Lima", "f2", { Lataria: sujo }),
    troca(v3, 50, "Marcos Lima", "f2", { Lataria: sujo, Pneus: pneu("Murcho") }),
    troca(v7, 60, "Marcos Lima", "f2", { Lataria: sujo }),
    troca(v1, 100, "Marcos Lima", "f2"),
    troca(v2, 25, "Paulo Mendes", "f6"),
    troca(v3, 45, "Paulo Mendes", "f6", { Pneus: pneu("Careca") }),
    troca(v1, 70, "Paulo Mendes", "f6"),
    troca(v2, 35, "Julia Faria", "f7"),
    troca(v3, 55, "Julia Faria", "f7", { Lataria: { problemas: ["Amassado"], observacao: "", fotos: 1 } }),
    troca(v7, 28, "", "", { Pneus: { problemas: ["Furado"], observacao: "Trocado pelo estepe.", fotos: 1 } }),
    troca(v1, 80, "", ""),
    mockChecklist(v2, padrao, CHECKLIST_ESTADO.concluido, 18, {}, { Pneus: pneu("Murcho") }),
    // Checklist antigo, anterior ao OK / Não OK: só fotos.
    mockChecklist(v1, entrega, CHECKLIST_ESTADO.concluido, 120)
  ];
  const todos = [...checklists, ...historico];
  const usoModelo = new Map(todos.map((row) => [row.id, row.modeloNome === entrega.nome ? entrega.id : padrao.id]));
  mock = { modelos: [padrao, entrega, terceiros], frota, checklists: todos, usoModelo, veiculosFiltro: mockVeiculosFiltro() };
  return mock;
}

// Veículos da prévia do filtro: os 7 da frota própria e mais terceiro, aluguel, vendido e um com campos vazios.
const MOCK_ROTULOS = { categoria: { [VEICULO_CATEGORIA_PROPRIO]: "Próprio", 100000001: "Terceiro", 100000002: "Aluguel" } as Record<number, string>, propriedade: { 100000000: "Proprio", 100000001: "Alugado" } as Record<number, string> };
function mockVeiculosFiltro(): VeiculoFiltro[] {
  type Linha = [id: string, placa: string, marca: string | null, modelo: string | null, cor: string | null, anoModelo: number | null, anoFab: number | null, km: number | null, blindado: boolean | null, categoria: number | null, propriedade: number | null, status: number | null];
  const P = VEICULO_CATEGORIA_PROPRIO;
  const ativo = VEICULO_STATUS.ativo;
  const linhas: Linha[] = [
    ["v1", "ABC1D23", "Toyota", "Corolla", "Preto", 2022, 2021, 45210, true, P, 100000000, ativo],
    ["v2", "BRA2E19", "Honda", "Civic", "Prata", 2021, 2021, 81233, false, P, null, ativo],
    ["v3", "QTP4F55", "Toyota", "Corolla", "Branco", 2024, 2024, 12980, true, P, 100000000, ativo],
    ["v4", "RIO7G21", "Nissan", "Sentra", "Grafite", 2022, 2021, 63004, false, P, 100000000, ativo],
    ["v5", "SPX9H08", "Toyota", "Corolla Cross", "Preto", 2024, 2023, 22417, false, P, 100000000, ativo],
    ["v6", "MGA3J44", "Volkswagen", "Jetta", "Branco", 2020, 2020, 98112, false, P, null, ativo],
    ["v7", "PRN5K72", "Chevrolet", "Spin", "Prata", 2022, 2022, 71540, false, P, 100000001, ativo],
    ["v8", "TER1A11", "Toyota", "Hilux", "Prata", 2023, 2023, 30500, true, 100000001, null, ativo],
    ["v9", "ALU2B22", "Jeep", "Compass", "Preto", 2025, 2024, 8200, false, 100000002, 100000001, ativo],
    ["v10", "VND3C33", "Toyota", "Corolla", "Prata", 2019, 2019, 150000, true, P, 100000000, VEICULO_STATUS.vendido],
    ["v11", "SEM4D44", null, "Sprinter", null, null, null, null, null, null, null, null]
  ];
  return linhas.map(([id, placa, marca, modelo, cor, anoModelo, anoFab, km, blindado, categoria, propriedade, status]) => ({
    id, placa, statecode: 0, status,
    campos: { cr40f_placa: placa, cr40f_marca: marca, cr40f_modelo: modelo, cr40f_cor: cor, cr40f_anodemodelo: anoModelo, cr40f_anodefabricacao: anoFab, cr40f_hodometro: km, cr40f_blindado: blindado, new_categoriadoveiculo: categoria, new_propriedade: propriedade },
    rotulos: { new_categoriadoveiculo: categoria == null ? "" : MOCK_ROTULOS.categoria[categoria], new_propriedade: propriedade == null ? "" : MOCK_ROTULOS.propriedade[propriedade] }
  }));
}

/** Só para testes: recomeça o mock em memória. */
export function resetMock() { mock = null; }

// ---------- Leitura ----------

async function allRows(entitySet: string, query: string) {
  const rows: Record<string, unknown>[] = [];
  let next = query;
  for (let page = 0; next && page < 20; page += 1) {
    const result = await retrieveMultiple(entitySet, next);
    rows.push(...result.entities);
    next = result.nextLink ? result.nextLink.slice(result.nextLink.indexOf("?") + 1) : "";
  }
  return rows;
}

export async function loadModelos(): Promise<Modelo[]> {
  if (isMockChecklists()) { await delay(120); return clone(getMock().modelos); }
  const [headers, items] = await Promise.all([
    allRows(DATAVERSE.checklistModelos, "$select=new_checklistmodeloid,new_name,new_descricao,new_ativo,new_padraoquinzenal,new_periodicidadedias,new_prioridade,new_filtrojson&$filter=statecode eq 0&$orderby=new_name"),
    allRows(DATAVERSE.checklistModeloItens, "$select=new_checklistmodeloitemid,_new_modelo_value,new_name,new_ordem,new_instrucao,new_tipo,new_obrigatorio,new_unidade,new_opcoesproblema&$filter=statecode eq 0&$orderby=new_ordem")
  ]);
  return headers.map((row) => {
    const id = text(row.new_checklistmodeloid);
    return {
      id,
      nome: text(row.new_name),
      descricao: text(row.new_descricao),
      ativo: row.new_ativo === true,
      padraoQuinzenal: row.new_padraoquinzenal === true,
      periodicidadeDias: Number(row.new_periodicidadedias) || PERIODICIDADE_PADRAO,
      prioridade: row.new_prioridade == null ? null : Number(row.new_prioridade),
      filtroJson: text(row.new_filtrojson),
      itens: items.filter((item) => cleanGuid(text(item._new_modelo_value)) === cleanGuid(id)).map((item, index) => ({
        id: text(item.new_checklistmodeloitemid),
        ordem: Number(item.new_ordem) || index + 1,
        rotulo: text(item.new_name),
        instrucao: text(item.new_instrucao),
        tipo: tipoFromChoice(item.new_tipo),
        obrigatorio: item.new_obrigatorio === true,
        unidade: text(item.new_unidade),
        opcoesProblema: text(item.new_opcoesproblema)
      })).sort((a, b) => a.ordem - b.ordem)
    };
  });
}

export async function loadFrota(): Promise<VeiculoFrota[]> {
  if (isMockChecklists()) { await delay(120); return clone(getMock().frota); }
  const [veiculos, motoristas] = await Promise.all([
    allRows(DATAVERSE.veiculos, `$select=cr40f_veiculosid,cr40f_placa,cr40f_modelo,cr40f_cor,cr40f_hodometro&$filter=statecode eq 0 and cr40f_statusdoveiculo eq ${VEICULO_STATUS.ativo} and new_categoriadoveiculo eq ${VEICULO_CATEGORIA_PROPRIO}&$orderby=cr40f_placa`),
    allRows(DATAVERSE.funcionarios, "$select=cr40f_funcionariosid,cr40f_nomecompleto,_cr40f_veiculoatual_value,new_veiculoatualdesde&$filter=cr40f_status eq 0 and statecode eq 0 and _cr40f_veiculoatual_value ne null")
  ]);
  return veiculos.map((row) => {
    const id = text(row.cr40f_veiculosid);
    // Mesma regra do plugin: com dois motoristas no carro, vale quem pegou por último.
    const atual = motoristas
      .filter((driver) => cleanGuid(text(driver._cr40f_veiculoatual_value)) === cleanGuid(id))
      .sort((a, b) => text(b.new_veiculoatualdesde).localeCompare(text(a.new_veiculoatualdesde)))[0];
    return {
      id,
      placa: text(row.cr40f_placa),
      modelo: [text(row.cr40f_modelo), text(row.cr40f_cor)].filter(Boolean).join(" "),
      hodometro: row.cr40f_hodometro == null ? null : Number(row.cr40f_hodometro),
      motoristaId: atual ? text(atual.cr40f_funcionariosid) : "",
      motoristaNome: atual ? text(atual.cr40f_nomecompleto) : "",
      motoristaDesde: atual ? dateOrNull(atual.new_veiculoatualdesde) : null
    };
  });
}

// ---------- Veículos e opções da prévia do filtro ----------

const CAMPOS_CHOICE = CAMPOS_FILTRO.filter((campo) => campo.tipo === "choice").map((campo) => campo.campo);
const FORMATADO = "@OData.Community.Display.V1.FormattedValue";

/** Linha de cr40f_veiculos no formato do avaliador (valores crus + rótulos das choices). */
export function mapVeiculoFiltro(row: Record<string, unknown>): VeiculoFiltro {
  const campos: VeiculoFiltro["campos"] = {};
  for (const { campo, tipo } of CAMPOS_FILTRO) {
    const value = row[campo];
    campos[campo] = value == null ? null : tipo === "texto" ? String(value) : tipo === "booleano" ? value === true : Number(value);
  }
  return {
    id: text(row.cr40f_veiculosid),
    placa: text(row.cr40f_placa),
    statecode: Number(row.statecode ?? 0),
    status: row.cr40f_statusdoveiculo == null ? null : Number(row.cr40f_statusdoveiculo),
    campos,
    rotulos: Object.fromEntries(CAMPOS_CHOICE.map((campo) => [campo, text(row[`${campo}${FORMATADO}`])]))
  };
}

/** Universo da rotina: veículos ativos que não foram vendidos (status vazio entra), com as colunas da allowlist. */
export async function loadVeiculosFiltro(): Promise<VeiculoFiltro[]> {
  if (isMockChecklists()) { await delay(180); return clone(getMock().veiculosFiltro); }
  const select = ["cr40f_veiculosid", ...CAMPOS_FILTRO.map((campo) => campo.campo), "cr40f_statusdoveiculo", "statecode"].join(",");
  const rows = await allRows(DATAVERSE.veiculos, `$select=${select}&$filter=statecode eq 0 and (cr40f_statusdoveiculo ne ${VEICULO_STATUS.vendido} or cr40f_statusdoveiculo eq null)&$orderby=cr40f_placa`);
  return rows.map(mapVeiculoFiltro);
}

type PicklistMetadata = { value?: Array<{ LogicalName: string; OptionSet?: { Options?: Array<{ Value: number; Label?: { UserLocalizedLabel?: { Label?: string } } }> } }> };

/** Opções das choices da allowlist com os rótulos da metadata (EntityDefinitions); nulo se a metadata falhar. */
export async function loadOpcoesFiltro(): Promise<OpcoesFiltro | null> {
  if (isMockChecklists()) {
    await delay(80);
    const lista = (rotulos: Record<number, string>) => Object.entries(rotulos).map(([valor, rotulo]) => ({ valor: Number(valor), rotulo }));
    return { new_categoriadoveiculo: lista(MOCK_ROTULOS.categoria), new_propriedade: lista(MOCK_ROTULOS.propriedade) };
  }
  try {
    const filtro = CAMPOS_CHOICE.map((campo) => `LogicalName eq '${campo}'`).join(" or ");
    const body = await retrieveMetadata<PicklistMetadata>(`EntityDefinitions(LogicalName='cr40f_veiculos')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$filter=${encodeURIComponent(filtro)}&$expand=OptionSet($select=Options)`);
    const opcoes: OpcoesFiltro = Object.fromEntries((body.value ?? []).map((atributo) => [atributo.LogicalName,
      (atributo.OptionSet?.Options ?? []).map((opcao) => ({ valor: opcao.Value, rotulo: opcao.Label?.UserLocalizedLabel?.Label || `Valor ${opcao.Value}` }))]));
    return CAMPOS_CHOICE.every((campo) => opcoes[campo]?.length) ? opcoes : null;
  } catch {
    return null;
  }
}

/** Plano B sem metadata: os rótulos formatados que os próprios veículos trazem (só os valores em uso). */
export function opcoesDosVeiculos(veiculos: VeiculoFiltro[]): OpcoesFiltro {
  return Object.fromEntries(CAMPOS_CHOICE.map((campo) => {
    const vistos = new Map<number, string>();
    veiculos.forEach((veiculo) => { const valor = veiculo.campos[campo]; if (typeof valor === "number" && veiculo.rotulos[campo]) vistos.set(valor, veiculo.rotulos[campo]); });
    return [campo, [...vistos].map(([valor, rotulo]) => ({ valor, rotulo })).sort((a, b) => a.valor - b.valor)];
  }));
}

/** Grava a nova ordem dos modelos (new_prioridade) numa transação: ou muda tudo, ou nada. */
export async function salvarPrioridades(mudancas: { id: string; prioridade: number }[]) {
  if (isMockChecklists()) {
    await delay(150); mockEscrita("escrita");
    mudancas.forEach(({ id, prioridade }) => { mockModelo(id).prioridade = prioridade; });
    return;
  }
  await executeChangeset(mudancas.map(({ id, prioridade }) => ({ entitySet: DATAVERSE.checklistModelos, id: cleanGuid(id), data: { new_prioridade: prioridade } })));
}

const CHECKLIST_SELECT = "$select=new_checklistveiculoid,new_name,_new_motorista_value,_new_veiculo_value,_new_modelo_value,new_estado,new_origem,new_solicitadoem,new_concluidoem,new_odometroinfleet,new_itensjson,new_respostasjson,_new_entreguepor_value,new_trocadetectadaem,new_erroatribuicao,new_pushstatus,new_pusherro,new_atribuidoem,new_canceladoem,new_motivocancelamento,new_temproblema,new_qtdproblemas,createdon";

export async function loadChecklistsGestao(): Promise<ChecklistGestao[]> {
  if (isMockChecklists()) { await delay(150); return clone(getMock().checklists).sort((a, b) => b.solicitadoEm.localeCompare(a.solicitadoEm)); }
  const rows = await allRows(DATAVERSE.checklistVeiculos, `${CHECKLIST_SELECT}&$orderby=new_solicitadoem desc&$top=500`);
  return rows.map(mapChecklistGestao);
}

// Padrões: só checklists enviados nos últimos 180 dias (o maior período da aba), com as colunas que o cálculo e a
// lista de conferência usam. Sem $top: a lista geral (loadChecklistsGestao) para nos 500 mais recentes de qualquer
// estado e não garante 180 dias.
export const PADROES_DIAS_CARREGADOS = 180;
const PADROES_SELECT = "$select=new_checklistveiculoid,_new_veiculo_value,_new_motorista_value,new_estado,new_origem,new_solicitadoem,new_concluidoem,new_respostasjson,_new_entreguepor_value,new_temproblema,new_qtdproblemas";

export async function loadChecklistsPadroes(now = Date.now()): Promise<ChecklistGestao[]> {
  const desde = now - PADROES_DIAS_CARREGADOS * DAY;
  if (isMockChecklists()) {
    await delay(150);
    return clone(getMock().checklists).filter((item) => item.estado === CHECKLIST_ESTADO.concluido && Date.parse(item.concluidoEm ?? "") >= desde);
  }
  const filtro = `$filter=new_estado eq ${CHECKLIST_ESTADO.concluido} and new_concluidoem ge ${new Date(desde).toISOString()}`;
  const rows = await allRows(DATAVERSE.checklistVeiculos, `${PADROES_SELECT}&${filtro}&$orderby=new_concluidoem desc`);
  return rows.map(mapChecklistGestao);
}

// ---------- Modelos ----------

/** Cabeçalho gravado no modelo, sem o padrão quinzenal (que o salvar troca numa etapa própria e conferida). */
function cabecalhoPayload(modelo: Modelo) {
  return {
    new_name: modelo.nome.trim(),
    new_descricao: modelo.descricao.trim(),
    new_ativo: modelo.ativo,
    new_periodicidadedias: modelo.periodicidadeDias,
    // O padrão ignora o filtro e a tela esconde a seção: nada fica gravado escondido.
    new_filtrojson: modelo.padraoQuinzenal ? null : modelo.filtroJson.trim() || null,
    new_prioridade: modelo.prioridade
  };
}

function itemPayload(item: ModeloItem, ordem: number) {
  return {
    new_name: item.rotulo.trim(),
    new_ordem: ordem,
    new_instrucao: item.instrucao.trim(),
    new_tipo: ITEM_TIPO[item.tipo],
    new_obrigatorio: item.obrigatorio,
    new_unidade: item.tipo === "numero" ? item.unidade.trim() : "",
    new_opcoesproblema: item.tipo === "okNok" ? opcoesProblemaLista(item.opcoesProblema).join("\n") : ""
  };
}

/** Só para testes: o payload gravado em cada item do modelo. */
export const itemPayloadForTest = itemPayload;

/** Escritas do salvar, uma por registro. O Dataverse e o mock local implementam; os testes injetam um falso. */
export type ModeloStore = {
  criarModelo: (modelo: Modelo) => Promise<string>;
  atualizarModelo: (id: string, modelo: Modelo) => Promise<void>;
  /** Uma transação: marca `id` como padrão e desmarca `desmarcar`. Se uma parte falha, nada é gravado. */
  trocarPadrao: (id: string, desmarcar: string[]) => Promise<void>;
  criarItem: (modeloId: string, item: ModeloItem, ordem: number) => Promise<string>;
  atualizarItem: (id: string, item: ModeloItem, ordem: number) => Promise<void>;
  desativarItem: (id: string) => Promise<void>;
  /** Ids dos modelos ativos marcados como padrão quinzenal, lidos na fonte. */
  padroesAtivos: () => Promise<string[]>;
};

export const dataverseModeloStore: ModeloStore = {
  criarModelo: async (modelo) => (await createOne(DATAVERSE.checklistModelos, { ...cabecalhoPayload(modelo), new_padraoquinzenal: false })).id,
  atualizarModelo: async (id, modelo) => { await updateOne(DATAVERSE.checklistModelos, id, cabecalhoPayload(modelo)); },
  trocarPadrao: async (id, desmarcar) => {
    await executeChangeset([
      { entitySet: DATAVERSE.checklistModelos, id: cleanGuid(id), data: { new_padraoquinzenal: true } },
      ...desmarcar.map((outro) => ({ entitySet: DATAVERSE.checklistModelos, id: cleanGuid(outro), data: { new_padraoquinzenal: false } }))
    ]);
  },
  criarItem: async (modeloId, item, ordem) => (await createOne(DATAVERSE.checklistModeloItens, {
    ...itemPayload(item, ordem), "new_Modelo@odata.bind": `/${DATAVERSE.checklistModelos}(${cleanGuid(modeloId)})`
  })).id,
  atualizarItem: async (id, item, ordem) => { await updateOne(DATAVERSE.checklistModeloItens, id, itemPayload(item, ordem)); },
  desativarItem: async (id) => { await updateOne(DATAVERSE.checklistModeloItens, id, { statecode: 1, statuscode: 2 }); },
  padroesAtivos: async () => {
    const result = await retrieveMultiple(DATAVERSE.checklistModelos, "$select=new_checklistmodeloid&$filter=statecode eq 0 and new_ativo eq true and new_padraoquinzenal eq true");
    return result.entities.map((row) => text(row.new_checklistmodeloid));
  }
};

// Mock: `?mockModeloFalha=N` derruba a N-ésima escrita da sessão uma vez (como conexão caída);
// `?mockModeloFalha=padrao` derruba a primeira troca do padrão (transação inteira, nada gravado);
// `?mockModeloFalha=padrao-conferencia` grava a troca, mas outra sessão remarca o padrão antigo antes da conferência.
let mockEscritas = 0;
let mockFalhou = false;
const mockFalha = () => new URLSearchParams(globalThis.window?.location?.search ?? "").get("mockModeloFalha") ?? "";
function mockEscrita(tipo: "escrita" | "padrao") {
  mockEscritas += 1;
  const falha = mockFalha();
  if (mockFalhou || !falha) return;
  if ((falha === "padrao" && tipo === "padrao") || Number(falha) === mockEscritas) {
    mockFalhou = true;
    throw new TypeError("Failed to fetch");
  }
}

function mockModelo(id: string) {
  const modelo = getMock().modelos.find((item) => item.id === id);
  if (!modelo) throw new Error("Modelo não encontrado.");
  return modelo;
}

function mockGuardarItem(item: ModeloItem, id: string, ordem: number): ModeloItem {
  const dados = clone(item);
  delete dados.uid;
  return { ...dados, id, ordem, unidade: item.tipo === "numero" ? item.unidade.trim() : "", opcoesProblema: item.tipo === "okNok" ? opcoesProblemaLista(item.opcoesProblema).join("\n") : "" };
}

const mockModeloStore: ModeloStore = {
  criarModelo: async (modelo) => {
    await delay(60); mockEscrita("escrita");
    const id = mockId();
    getMock().modelos.push({ id, nome: modelo.nome.trim(), descricao: modelo.descricao.trim(), ativo: modelo.ativo, padraoQuinzenal: false, periodicidadeDias: modelo.periodicidadeDias, prioridade: modelo.prioridade, filtroJson: modelo.filtroJson.trim(), itens: [] });
    return id;
  },
  atualizarModelo: async (id, modelo) => {
    await delay(60); mockEscrita("escrita");
    Object.assign(mockModelo(id), { nome: modelo.nome.trim(), descricao: modelo.descricao.trim(), ativo: modelo.ativo, periodicidadeDias: modelo.periodicidadeDias, prioridade: modelo.prioridade, filtroJson: modelo.filtroJson.trim() });
  },
  trocarPadrao: async (id, desmarcar) => {
    await delay(60); mockEscrita("padrao");
    const alvo = mockModelo(id);
    const outros = desmarcar.map(mockModelo);
    alvo.padraoQuinzenal = true;
    outros.forEach((modelo) => { modelo.padraoQuinzenal = false; });
    if (mockFalha() === "padrao-conferencia" && !mockFalhou && outros[0]) {
      mockFalhou = true;
      outros[0].padraoQuinzenal = true;
    }
  },
  criarItem: async (modeloId, item, ordem) => {
    await delay(60); mockEscrita("escrita");
    const id = mockId();
    const modelo = mockModelo(modeloId);
    modelo.itens = [...modelo.itens, mockGuardarItem(item, id, ordem)].sort((a, b) => a.ordem - b.ordem);
    return id;
  },
  atualizarItem: async (id, item, ordem) => {
    await delay(60); mockEscrita("escrita");
    const modelo = getMock().modelos.find((entry) => entry.itens.some((row) => row.id === id));
    if (!modelo) throw new Error("Item não encontrado.");
    modelo.itens = modelo.itens.map((row) => row.id === id ? mockGuardarItem(item, id, ordem) : row).sort((a, b) => a.ordem - b.ordem);
  },
  desativarItem: async (id) => {
    await delay(60); mockEscrita("escrita");
    getMock().modelos.forEach((modelo) => { modelo.itens = modelo.itens.filter((row) => row.id !== id); });
  },
  padroesAtivos: async () => getMock().modelos.filter((modelo) => modelo.ativo && modelo.padraoQuinzenal).map((modelo) => modelo.id)
};

/** Erro do salvar com o que já foi gravado: a tela guarda os ids e o próximo Salvar continua sem duplicar. */
export class FalhaAoSalvarModelo extends Error {
  readonly modelo: Modelo;
  readonly persistido: Modelo;
  constructor(message: string, modelo: Modelo, persistido: Modelo) {
    super(message);
    this.name = "FalhaAoSalvarModelo";
    this.modelo = modelo;
    this.persistido = persistido;
  }
}

const mensagemCausa = (cause: unknown) => cause instanceof Error ? cause.message : cause && typeof cause === "object" && "message" in cause ? String((cause as { message: unknown }).message) : "";
const semConexao = (cause: unknown) => cause instanceof TypeError || /failed to fetch|network|conex|offline/i.test(mensagemCausa(cause));

export type ResultadoSalvarModelo = { modelo: Modelo; aviso: string };

export type OpcoesSalvarModelo = {
  store?: ModeloStore;
  /** Se o modelo era o padrão quando o editor abriu: o padrão só é reconciliado quando o checkbox mudou nesta edição. */
  padraoAoAbrir?: boolean;
};

/** O Salvar fica habilitado com alteração pendente ou depois de qualquer falha (para tentar de novo). */
export const podeSalvar = ({ busy, dirty, falhaSalvar }: { busy: boolean; dirty: boolean; falhaSalvar: boolean }) => !busy && (dirty || falhaSalvar);

/**
 * Salva cabeçalho e itens enviando só o que mudou em relação ao que está gravado (`original`). Cada id criado
 * entra no estado assim que a criação volta; numa falha, `FalhaAoSalvarModelo` devolve esse estado (e o que de
 * fato está gravado, em `persistido`) para a nova tentativa não duplicar nada. O padrão quinzenal muda por último,
 * só se o checkbox mudou nesta edição, numa única transação (marca este e desmarca os outros) conferida na fonte.
 * Itens removidos são desativados.
 */
export async function saveModelo(modelo: Modelo, original: Modelo | null, opcoes: OpcoesSalvarModelo = {}): Promise<ResultadoSalvarModelo> {
  const store = opcoes.store ?? (isMockChecklists() ? mockModeloStore : dataverseModeloStore);
  const padraoAoAbrir = opcoes.padraoAoAbrir ?? Boolean(original?.id && original.ativo && original.padraoQuinzenal);
  const erro = validateModelo(modelo, original);
  if (erro) throw new Error(erro);
  const atual: Modelo = { ...clone(modelo), itens: modelo.itens.map((item, index) => ({ ...clone(item), ordem: index + 1 })) };
  const persistido: Modelo = original?.id ? clone(original) : { ...clone(atual), id: "", padraoQuinzenal: false, itens: [] };
  const falha = (cause: unknown, prefixo = "Não foi possível salvar o modelo") => new FalhaAoSalvarModelo(
    semConexao(cause)
      ? "Sem conexão com o Dataverse. O que já foi gravado está guardado: confira a internet e toque em Salvar de novo."
      : `${prefixo}${mensagemCausa(cause) ? ` (${mensagemCausa(cause)})` : ""}. O que já foi gravado está guardado: toque em Salvar de novo para terminar.`,
    clone(atual), clone(persistido));
  let aviso = "";
  try {
    if (!persistido.id) {
      const id = await store.criarModelo(atual);
      atual.id = id;
      Object.assign(persistido, { ...clone(atual), id, padraoQuinzenal: false, itens: [] });
    } else if (JSON.stringify(cabecalhoPayload(atual)) !== JSON.stringify(cabecalhoPayload(persistido))) {
      await store.atualizarModelo(persistido.id, atual);
      Object.assign(persistido, { nome: atual.nome, descricao: atual.descricao, ativo: atual.ativo, periodicidadeDias: atual.periodicidadeDias, prioridade: atual.prioridade, filtroJson: atual.filtroJson });
    }
    for (const [index, item] of atual.itens.entries()) {
      if (!item.id) {
        const id = await store.criarItem(atual.id, item, item.ordem);
        atual.itens[index] = { ...item, id };
        persistido.itens.push({ ...clone(item), id });
        continue;
      }
      const gravado = persistido.itens.findIndex((row) => row.id === item.id);
      if (gravado >= 0 && JSON.stringify(itemPayload(item, item.ordem)) === JSON.stringify(itemPayload(persistido.itens[gravado], persistido.itens[gravado].ordem))) continue;
      await store.atualizarItem(item.id, item, item.ordem);
      if (gravado >= 0) persistido.itens[gravado] = clone(item); else persistido.itens.push(clone(item));
    }
    const mantidos = new Set(atual.itens.map((item) => item.id));
    for (const removido of persistido.itens.filter((item) => !mantidos.has(item.id))) {
      await store.desativarItem(removido.id);
      persistido.itens = persistido.itens.filter((item) => item.id !== removido.id);
    }
  } catch (cause) {
    throw falha(cause);
  }
  atual.padraoQuinzenal = atual.ativo && atual.padraoQuinzenal;
  const nome = atual.nome.trim();
  const ehAtual = (id: string) => cleanGuid(id) === cleanGuid(atual.id);
  if (atual.padraoQuinzenal && !padraoAoAbrir) {
    // O usuário marcou "Usar na rotina quinzenal" nesta edição: uma transação troca o padrão; depois confere.
    try {
      const antes = await store.padroesAtivos();
      const outros = antes.filter((id) => !ehAtual(id));
      if (outros.length || antes.length === outros.length) await store.trocarPadrao(atual.id, outros);
    } catch (cause) {
      throw falha(cause, "O modelo foi salvo, mas a troca do padrão não foi feita (nada mudou na rotina)");
    }
    let depois: string[];
    try { depois = await store.padroesAtivos(); } catch (cause) { throw falha(cause, "O modelo foi salvo, mas não foi possível conferir o padrão da rotina quinzenal"); }
    persistido.padraoQuinzenal = depois.some(ehAtual);
    if (depois.length !== 1 || !persistido.padraoQuinzenal) {
      throw new FalhaAoSalvarModelo(`O modelo foi salvo, mas a rotina quinzenal ficou com ${depois.length} ${plural(depois.length, "modelo padrão", "modelos padrão")}. Toque em Salvar de novo para corrigir.`, clone(atual), clone(persistido));
    }
  } else if (atual.padraoQuinzenal) {
    // Checkbox intocado: não remarca. Se a fonte diz que o padrão mudou em outro lugar, só atualiza o estado e avisa.
    try {
      if (!(await store.padroesAtivos()).some(ehAtual)) {
        atual.padraoQuinzenal = false;
        persistido.padraoQuinzenal = false;
        aviso = `Modelo salvo. O padrão da rotina quinzenal mudou em outro lugar: “${nome}” não é mais o padrão e não foi remarcado.`;
      }
    } catch { /* A conferência é só informativa aqui; o salvar dos itens já terminou. */ }
  }
  return { modelo: atual, aviso };
}

export type UsoModelo = { total: number; abertos: number };

/** Quantos checklists foram criados com o modelo (e quantos ainda estão em aberto). */
export async function contarUsoModelo(modeloId: string): Promise<UsoModelo> {
  const conta = (estados: number[]) => ({ total: estados.length, abertos: estados.filter((estado) => estado === CHECKLIST_ESTADO.aguardandoMotorista || estado === CHECKLIST_ESTADO.pendente).length });
  if (isMockChecklists()) {
    // `?mockUsoLento=<id do modelo>` atrasa a contagem desse modelo (testa trocar de modelo antes de ela chegar).
    await delay(new URLSearchParams(globalThis.window?.location?.search ?? "").get("mockUsoLento") === modeloId ? 1500 : 120);
    const store = getMock();
    return conta(store.checklists.filter((row) => store.usoModelo.get(row.id) === modeloId).map((row) => row.estado));
  }
  const rows = await allRows(DATAVERSE.checklistVeiculos, `$select=new_checklistveiculoid,new_estado&$filter=_new_modelo_value eq ${cleanGuid(modeloId)}`);
  return conta(rows.map((row) => Number(row.new_estado)));
}

// ---------- Ações sobre checklists (Custom APIs) ----------

// checklists.ts é cópia do App Motoristas e fala do envio pelo motorista; aqui a ação é da operação.
const ERRO_SEM_XRM = /^Abra o aplicativo no Power Apps para enviar o checklist\.$/;
const ERRO_HTTP = /^Não foi possível enviar o checklist \((\d+)\)\.$/;
/** Troca as mensagens genéricas da lib copiada pela ação feita aqui ("cancelar o checklist"); mantém código e detalhes. */
export function erroAcaoOperacao(cause: unknown, acao: string) {
  if (cause instanceof Error) {
    if (ERRO_SEM_XRM.test(cause.message)) cause.message = `Abra esta tela dentro do Sistema Betinhos para ${acao}.`;
    else if (ERRO_HTTP.test(cause.message)) cause.message = `Não foi possível ${acao} (${cause.message.match(ERRO_HTTP)![1]}).`;
  }
  return cause;
}

async function acaoChecklist(operationName: string, parameters: Record<string, string>, acao: string) {
  try { await executeChecklistAction(operationName, parameters); }
  catch (cause) { throw erroAcaoOperacao(cause, acao); }
}

function mockChecklistById(id: string) {
  const row = getMock().checklists.find((item) => item.id === id);
  if (!row) throw new Error("Checklist não encontrado.");
  return row;
}

function mockAssign(row: ChecklistGestao) {
  const veiculo = getMock().frota.find((item) => item.id === row.veiculoId);
  if (!veiculo?.motoristaId) {
    row.erroAtribuicao = "Nenhum motorista ativo está com este veículo segundo a Infleet.";
    return;
  }
  row.erroAtribuicao = "";
  row.estado = CHECKLIST_ESTADO.pendente;
  row.motoristaId = veiculo.motoristaId;
  row.motoristaNome = veiculo.motoristaNome;
  row.atribuidoEm = new Date().toISOString();
  row.pushStatus = PUSH.enviado;
}

export async function solicitarChecklist(veiculoId: string, modeloId = "") {
  if (isMockChecklists()) {
    await delay(300);
    const store = getMock();
    const veiculo = store.frota.find((item) => item.id === veiculoId);
    const modelo = modeloId ? store.modelos.find((item) => item.id === modeloId) : store.modelos.find((item) => item.ativo && item.padraoQuinzenal);
    if (!veiculo || !modelo) throw new Error("Defina exatamente um modelo ativo como padrão quinzenal.");
    const row = mockChecklist(veiculo, modelo, CHECKLIST_ESTADO.aguardandoMotorista, 0, { origem: CHECKLIST_ORIGEM.manual });
    store.checklists.unshift(row);
    store.usoModelo.set(row.id, modelo.id);
    mockAssign(row);
    return;
  }
  const parameters: Record<string, string> = { new_VeiculoId: cleanGuid(veiculoId) };
  if (modeloId) parameters.new_ModeloId = cleanGuid(modeloId);
  await acaoChecklist("new_SolicitarChecklistVeiculo", parameters, "solicitar o checklist");
}

export async function reatribuirChecklist(id: string) {
  if (isMockChecklists()) { await delay(250); mockAssign(mockChecklistById(id)); return; }
  await acaoChecklist("new_ReatribuirChecklistVeiculo", { new_ChecklistId: cleanGuid(id) }, "atribuir o checklist de novo");
}

export const MOTIVO_MIN = 5;
/** Motivo do cancelamento é obrigatório: fica no histórico do checklist. Vazio quando pode cancelar. */
export function erroMotivoCancelamento(motivo: string) {
  const tamanho = motivo.trim().length;
  if (tamanho < MOTIVO_MIN) return `Informe o motivo com pelo menos ${MOTIVO_MIN} caracteres.`;
  if (tamanho > 500) return "Use até 500 caracteres no motivo.";
  return "";
}

export async function cancelarChecklist(id: string, motivo: string) {
  const erro = erroMotivoCancelamento(motivo);
  if (erro) throw new Error(erro);
  if (isMockChecklists()) {
    await delay(250);
    const row = mockChecklistById(id);
    if (!isOpen(row)) throw new Error("Somente checklist pendente pode ser cancelado.");
    Object.assign(row, { estado: CHECKLIST_ESTADO.cancelado, canceladoEm: new Date().toISOString(), motivoCancelamento: motivo.trim() });
    return;
  }
  await acaoChecklist("new_CancelarChecklistVeiculo", { new_ChecklistId: cleanGuid(id), new_Motivo: motivo.trim() }, "cancelar o checklist");
}

export async function lembrarMotorista(id: string) {
  if (isMockChecklists()) { await delay(250); Object.assign(mockChecklistById(id), { pushStatus: PUSH.enviado, pushErro: "" }); return; }
  await acaoChecklist("new_ReenviarPushChecklist", { new_ChecklistId: cleanGuid(id) }, "lembrar o motorista");
}
