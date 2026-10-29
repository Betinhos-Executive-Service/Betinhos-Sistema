import { CHECKLIST_ESTADO, CHECKLIST_ORIGEM, cleanGuid, type ChecklistResposta } from "./checklists";
import { type ChecklistGestao } from "./gestaoChecklists";

// Padrões da Gestão de Checklists (entrega 3): contagens simples e conferíveis sobre checklists enviados, sem IA.
// Cada número guarda os ids dos checklists que o formam, para a tela abrir a lista com as fotos.

const DAY = 86_400_000;

export const PERIODOS_PADROES = [30, 90, 180] as const;
export type PeriodoPadroes = (typeof PERIODOS_PADROES)[number];
export const PERIODO_PADROES_INICIAL: PeriodoPadroes = 90;
export const MIN_TROCAS_ENTREGADOR = 3;
export const RECORRENCIA_JANELA = 3;
export const RECORRENCIA_MINIMO = 2;
export const TOP_PROBLEMAS_FROTA = 10;
export const MAX_DESTAQUES = 3;
export const DESTAQUE_MIN_OCORRENCIAS = 3;
export const DESTAQUE_MIN_FRACAO = 0.5;
export const NAO_IDENTIFICADO = "Não identificado";
export const PROBLEMA_NAO_INFORMADO = "Problema não informado";

export type ItemNaoOk = { item: string; problemas: string[]; resposta: ChecklistResposta };
export type ParContagem = { item: string; problema: string; quantidade: number; checklistIds: string[] };
export type PadraoEntregador = { chave: string; nome: string; trocas: number; comProblema: number; percentual: number; principais: ParContagem[]; checklistIds: string[] };
export type PadraoVeiculo = { veiculoId: string; placa: string; item: string; problemas: string[]; ocorrencias: number; janela: number; ultimaEm: string; checklistIds: string[] };
export type DestaquePadrao = { texto: string; chave: string; nome: string; item: string; problema: string; ocorrencias: number; trocas: number; checklistIds: string[] };
export type Padroes = {
  periodoDias: number;
  desde: string;
  total: number;
  trocas: number;
  porEntregador: PadraoEntregador[];
  naoIdentificado: PadraoEntregador | null;
  porVeiculo: PadraoVeiculo[];
  problemasFrota: ParContagem[];
  destaques: DestaquePadrao[];
};

/** Chave de comparação de rótulos: "Pneus", " pneus " e "PNEUS" são o mesmo item. */
export const normalizarRotulo = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
const quando = (checklist: ChecklistGestao) => Date.parse(checklist.concluidoEm ?? "") || 0;
const maisRecente = (a: ChecklistGestao, b: ChecklistGestao) => quando(b) - quando(a) || a.id.localeCompare(b.id);
const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR");

function rotuloDoItem(checklist: ChecklistGestao, resposta: ChecklistResposta) {
  return resposta.rotulo.trim() || checklist.itens.find((item) => item.chave === resposta.chave)?.rotulo.trim() || "Item sem nome";
}

// Só conta resposta OK / Não OK preenchida: checklist antigo (sem esse tipo) ou item opcional em branco ficam de fora.
const respostasOkNok = (checklist: ChecklistGestao) =>
  checklist.respostas.filter((resposta) => resposta.tipo === "okNok" && (resposta.valor === "ok" || resposta.valor === "nok"));

/** Itens marcados Não OK, com o rótulo e os problemas sem repetição. Checklist sem OK / Não OK devolve []. */
export function itensNaoOk(checklist: ChecklistGestao): ItemNaoOk[] {
  return respostasOkNok(checklist)
    .filter((resposta) => resposta.valor === "nok")
    .map((resposta) => {
      // "Murcho" e "murcho" são o mesmo problema: fica a primeira grafia.
      const unicos = new Map<string, string>();
      for (const problema of resposta.problemas.map((value) => value.trim()).filter(Boolean)) {
        if (!unicos.has(normalizarRotulo(problema))) unicos.set(normalizarRotulo(problema), problema);
      }
      const problemas = [...unicos.values()];
      return { item: rotuloDoItem(checklist, resposta), problemas: problemas.length ? problemas : [PROBLEMA_NAO_INFORMADO], resposta };
    });
}

const teveProblema = (checklist: ChecklistGestao) => checklist.temProblema || itensNaoOk(checklist).length > 0;

/** Pares item + problema, contados uma vez por checklist; mais frequentes primeiro. Recebe a lista do mais recente ao mais antigo. */
function contarPares(checklists: ChecklistGestao[]): ParContagem[] {
  const pares = new Map<string, ParContagem>();
  for (const checklist of checklists) {
    const vistos = new Set<string>();
    for (const { item, problemas } of itensNaoOk(checklist)) {
      for (const problema of problemas) {
        const chave = `${normalizarRotulo(item)}|${normalizarRotulo(problema)}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        const par = pares.get(chave) ?? { item, problema, quantidade: 0, checklistIds: [] };
        par.quantidade += 1;
        par.checklistIds.push(checklist.id);
        pares.set(chave, par);
      }
    }
  }
  return [...pares.values()].sort((a, b) => b.quantidade - a.quantidade || porNome(a.item, b.item) || porNome(a.problema, b.problema));
}

function agruparPorEntregador(trocas: ChecklistGestao[]) {
  const grupos = new Map<string, { nome: string; checklists: ChecklistGestao[] }>();
  for (const checklist of trocas) {
    const nome = checklist.entreguePorNome.trim();
    // Chave vazia = entregador não identificado: fica numa linha separada e não é atribuído a ninguém.
    const chave = cleanGuid(checklist.entreguePorId) || normalizarRotulo(nome);
    const grupo = grupos.get(chave) ?? { nome: chave ? nome || "Sem nome no cadastro" : NAO_IDENTIFICADO, checklists: [] };
    grupo.checklists.push(checklist);
    grupos.set(chave, grupo);
  }
  return grupos;
}

function resumirEntregador(chave: string, nome: string, checklists: ChecklistGestao[]) {
  const pares = contarPares(checklists);
  const comProblema = checklists.filter(teveProblema).length;
  const linha: PadraoEntregador = {
    chave,
    nome,
    trocas: checklists.length,
    comProblema,
    percentual: Math.round((comProblema / checklists.length) * 100),
    principais: pares.slice(0, 2),
    checklistIds: checklists.map((checklist) => checklist.id)
  };
  return { linha, pares };
}

function recorrenciasPorVeiculo(checklists: ChecklistGestao[]): PadraoVeiculo[] {
  const veiculos = new Map<string, ChecklistGestao[]>();
  for (const checklist of checklists) {
    const chave = cleanGuid(checklist.veiculoId) || checklist.placa;
    veiculos.set(chave, [...(veiculos.get(chave) ?? []), checklist]);
  }
  const linhas: PadraoVeiculo[] = [];
  for (const [veiculoId, lista] of veiculos) {
    const itens = new Map<string, string>();
    for (const checklist of lista) {
      for (const resposta of respostasOkNok(checklist)) {
        const rotulo = rotuloDoItem(checklist, resposta);
        if (!itens.has(normalizarRotulo(rotulo))) itens.set(normalizarRotulo(rotulo), rotulo);
      }
    }
    for (const [chaveItem, item] of itens) {
      // Janela = os últimos 3 checklists do carro que avaliaram este item (OK ou Não OK).
      const janela = lista
        .filter((checklist) => respostasOkNok(checklist).some((resposta) => normalizarRotulo(rotuloDoItem(checklist, resposta)) === chaveItem))
        .slice(0, RECORRENCIA_JANELA);
      const naoOk = janela
        .map((checklist) => ({ checklist, nok: itensNaoOk(checklist).find((entry) => normalizarRotulo(entry.item) === chaveItem) }))
        .filter((entry): entry is { checklist: ChecklistGestao; nok: ItemNaoOk } => Boolean(entry.nok));
      if (naoOk.length < RECORRENCIA_MINIMO) continue;
      // Problemas do mais frequente ao menos frequente; no empate, o que apareceu mais recentemente.
      const contagem = new Map<string, { problema: string; quantidade: number; ordem: number }>();
      naoOk.forEach(({ nok }, ordem) => nok.problemas.forEach((problema) => {
        const atual = contagem.get(normalizarRotulo(problema)) ?? { problema, quantidade: 0, ordem };
        atual.quantidade += 1;
        contagem.set(normalizarRotulo(problema), atual);
      }));
      linhas.push({
        veiculoId,
        placa: lista[0].placa,
        item,
        problemas: [...contagem.values()].sort((a, b) => b.quantidade - a.quantidade || a.ordem - b.ordem).map((entry) => entry.problema),
        ocorrencias: naoOk.length,
        janela: janela.length,
        ultimaEm: naoOk[0].checklist.concluidoEm ?? "",
        checklistIds: naoOk.map((entry) => entry.checklist.id)
      });
    }
  }
  return linhas.sort((a, b) => b.ocorrencias - a.ocorrencias || Date.parse(b.ultimaEm) - Date.parse(a.ultimaEm) || porNome(a.placa, b.placa) || porNome(a.item, b.item));
}

/** Padrões dos checklists enviados nos últimos `periodoDias` dias. Função pura: `now` entra por parâmetro nos testes. */
export function calcularPadroes(checklists: ChecklistGestao[], periodoDias: number, now = Date.now()): Padroes {
  const inicio = now - periodoDias * DAY;
  const doPeriodo = checklists
    .filter((checklist) => checklist.estado === CHECKLIST_ESTADO.concluido && quando(checklist) >= inicio)
    .sort(maisRecente);
  const trocas = doPeriodo.filter((checklist) => checklist.origem === CHECKLIST_ORIGEM.troca);
  const porEntregador: PadraoEntregador[] = [];
  const destaques: DestaquePadrao[] = [];
  let naoIdentificado: PadraoEntregador | null = null;
  for (const [chave, grupo] of agruparPorEntregador(trocas)) {
    const { linha, pares } = resumirEntregador(chave, grupo.nome, grupo.checklists);
    if (!chave) { naoIdentificado = linha; continue; }
    if (linha.trocas < MIN_TROCAS_ENTREGADOR) continue;
    porEntregador.push(linha);
    // Uma frase por pessoa: o par mais frequente que passa da regra (≥ 3 ocorrências e ≥ 50% das trocas).
    const forte = pares.find((par) => par.quantidade >= DESTAQUE_MIN_OCORRENCIAS && par.quantidade / linha.trocas >= DESTAQUE_MIN_FRACAO);
    if (forte) {
      destaques.push({
        texto: `${linha.nome}: ${forte.quantidade} de ${linha.trocas} carros entregues com '${forte.item}: ${forte.problema}' (${periodoDias} dias)`,
        chave,
        nome: linha.nome,
        item: forte.item,
        problema: forte.problema,
        ocorrencias: forte.quantidade,
        trocas: linha.trocas,
        checklistIds: forte.checklistIds
      });
    }
  }
  porEntregador.sort((a, b) => b.percentual - a.percentual || b.comProblema - a.comProblema || b.trocas - a.trocas || porNome(a.nome, b.nome));
  destaques.sort((a, b) => b.ocorrencias / b.trocas - a.ocorrencias / a.trocas || b.ocorrencias - a.ocorrencias || porNome(a.nome, b.nome));
  return {
    periodoDias,
    desde: new Date(inicio).toISOString(),
    total: doPeriodo.length,
    trocas: trocas.length,
    porEntregador,
    naoIdentificado,
    porVeiculo: recorrenciasPorVeiculo(doPeriodo),
    problemasFrota: contarPares(doPeriodo).slice(0, TOP_PROBLEMAS_FROTA),
    destaques: destaques.slice(0, MAX_DESTAQUES)
  };
}
