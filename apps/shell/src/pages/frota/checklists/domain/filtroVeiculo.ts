// Filtro de veículos por modelo de checklist. Avaliador puro, espelho do plugin C# (mesmo contrato de
// new_filtrojson e new_prioridade): a prévia da Gestão precisa dar o mesmo resultado que a rotina.

export type TipoCampo = "texto" | "inteiro" | "booleano" | "choice";
export type Operador = "igual" | "diferente" | "contem" | "maior" | "menor" | "entre" | "em" | "fora";
/** Condição como está no JSON; `campo`, `operador` e `valor` podem vir de qualquer tipo (dado gravado). */
export type Condicao = { campo: string; operador: string; valor: unknown };
/** `exemplo`: placeholder do valor no editor (campos de texto e número). */
export type CampoFiltro = { campo: string; rotulo: string; tipo: TipoCampo; exemplo?: string };

export const CAMPOS_FILTRO: CampoFiltro[] = [
  { campo: "cr40f_marca", rotulo: "Marca", tipo: "texto", exemplo: "Ex.: Toyota" },
  { campo: "cr40f_modelo", rotulo: "Modelo do veículo", tipo: "texto", exemplo: "Ex.: Corolla" },
  { campo: "cr40f_cor", rotulo: "Cor", tipo: "texto", exemplo: "Ex.: Preto" },
  { campo: "cr40f_placa", rotulo: "Placa", tipo: "texto", exemplo: "Ex.: ABC1D23" },
  { campo: "cr40f_anodemodelo", rotulo: "Ano de modelo", tipo: "inteiro", exemplo: "Ex.: 2022" },
  { campo: "cr40f_anodefabricacao", rotulo: "Ano de fabricação", tipo: "inteiro", exemplo: "Ex.: 2022" },
  { campo: "cr40f_hodometro", rotulo: "Hodômetro (km)", tipo: "inteiro", exemplo: "Ex.: 50000" },
  { campo: "cr40f_blindado", rotulo: "Blindado", tipo: "booleano" },
  { campo: "new_categoriadoveiculo", rotulo: "Categoria", tipo: "choice" },
  { campo: "new_propriedade", rotulo: "Propriedade", tipo: "choice" }
];

export const OPERADORES: Record<TipoCampo, Operador[]> = {
  texto: ["igual", "diferente", "contem"],
  inteiro: ["igual", "diferente", "maior", "menor", "entre"],
  booleano: ["igual"],
  choice: ["em", "fora"]
};

export const ROTULO_OPERADOR: Record<Operador, string> = {
  igual: "é", diferente: "não é", contem: "contém", maior: "maior que", menor: "menor que", entre: "entre", em: "é um destes", fora: "não é nenhum destes"
};

export const VEICULO_STATUS = { vendido: 202410000, ativo: 202410001 } as const;
export const VEICULO_CATEGORIA_PROPRIO = 100000000;
/** Nulo conta como o último (int.MaxValue no C#). */
const PRIORIDADE_ULTIMA = 2147483647;
export const MAX_FILTRO_JSON = 4000;

export const campoFiltro = (campo: string) => CAMPOS_FILTRO.find((entry) => entry.campo === campo);

/** Veículo como o avaliador enxerga: valores crus por nome lógico (texto, número, booleano ou valor da choice). */
export type VeiculoFiltro = {
  id: string;
  placa: string;
  /** statecode do registro (0 = ativo). */
  statecode: number;
  /** cr40f_statusdoveiculo (null = vazio). */
  status: number | null;
  campos: Record<string, string | number | boolean | null>;
  /** Rótulos formatados das choices, para a lista da prévia. */
  rotulos: Record<string, string>;
};

/** Modelo do ponto de vista da escolha: só o que a rotina usa. */
export type ModeloFiltravel = { id: string; nome: string; ativo: boolean; padraoQuinzenal: boolean; prioridade: number | null; filtroJson: string };

// ---------- Leitura do JSON ----------

export type FiltroLido = {
  condicoes: Condicao[];
  /** JSON ilegível, raiz que não é objeto ou `condicoes` que não é lista: o modelo não casa com nenhum veículo. */
  invalido: boolean;
  /** Campos fora da allowlist: o modelo não casa com nenhum veículo. */
  naoSuportados: string[];
};

const semCondicao = (invalido: boolean): FiltroLido => ({ condicoes: [], invalido, naoSuportados: [] });

export function lerFiltro(json: string | null | undefined): FiltroLido {
  if (json == null || !json.trim()) return semCondicao(false);
  let dado: unknown;
  try { dado = JSON.parse(json); } catch { return semCondicao(true); }
  // `null` e objeto sem `condicoes` (ou com `condicoes: null`) contam como sem filtro, igual ao plugin.
  if (dado === null) return semCondicao(false);
  if (typeof dado !== "object" || Array.isArray(dado)) return semCondicao(true);
  const lista = (dado as { condicoes?: unknown }).condicoes;
  if (lista == null) return semCondicao(false);
  if (!Array.isArray(lista)) return semCondicao(true);
  const condicoes: Condicao[] = [];
  let invalido = false;
  for (const entrada of lista) {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) { invalido = true; continue; }
    const { campo, operador, valor } = entrada as Record<string, unknown>;
    condicoes.push({ campo: String(campo ?? ""), operador: String(operador ?? ""), valor });
  }
  const naoSuportados = [...new Set(condicoes.filter((condicao) => !campoFiltro(condicao.campo)).map((condicao) => condicao.campo))];
  return { condicoes, invalido, naoSuportados };
}

/** JSON gravado em new_filtrojson; vazio (null no Dataverse) quando não há condição. */
export const serializarFiltro = (condicoes: Condicao[]) => condicoes.length ? JSON.stringify({ condicoes }) : "";

/** Tem algo no filtro (mesmo inválido): conta como "com filtro" na escolha automática. */
export const temFiltro = (filtro: FiltroLido) => filtro.invalido || filtro.condicoes.length > 0;

// ---------- Avaliação ----------

/** Sem diferenciar maiúsculas/minúsculas e sem acento, com trim (como o C#; não junta espaços internos). */
const normalizarTexto = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const ehNumero = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const ehInteiro = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

export function casaCondicao(campos: VeiculoFiltro["campos"], condicao: Condicao): boolean {
  const definicao = campoFiltro(condicao.campo);
  if (!definicao) return false;
  const operador = condicao.operador as Operador;
  if (!OPERADORES[definicao.tipo].includes(operador)) return false;
  const bruto = campos[condicao.campo];
  const valor = condicao.valor;
  switch (definicao.tipo) {
    case "texto": {
      if (typeof valor !== "string") return false;
      const atual = typeof bruto === "string" ? normalizarTexto(bruto) : bruto == null ? "" : normalizarTexto(String(bruto));
      const alvo = normalizarTexto(valor);
      if (!atual) return operador === "diferente";
      if (operador === "igual") return atual === alvo;
      if (operador === "diferente") return atual !== alvo;
      return atual.includes(alvo);
    }
    case "inteiro": {
      const atual = typeof bruto === "number" ? bruto : null;
      if (operador === "entre") {
        if (!Array.isArray(valor) || valor.length !== 2 || !ehInteiro(valor[0]) || !ehInteiro(valor[1])) return false;
        return atual != null && atual >= valor[0] && atual <= valor[1];
      }
      if (!ehInteiro(valor) || atual == null) return false;
      if (operador === "igual") return atual === valor;
      if (operador === "diferente") return atual !== valor;
      if (operador === "maior") return atual > valor;
      return atual < valor;
    }
    case "booleano":
      if (typeof valor !== "boolean") return false;
      return (bruto === true) === valor;
    case "choice": {
      if (!Array.isArray(valor) || !valor.every(ehInteiro)) return false;
      const atual = typeof bruto === "number" ? bruto : null;
      if (atual == null) return operador === "fora";
      return operador === "em" ? valor.includes(atual) : !valor.includes(atual);
    }
  }
}

/** Todas as condições precisam bater (E). Filtro inválido ou com campo fora da allowlist não casa. */
export function casaFiltro(campos: VeiculoFiltro["campos"], filtro: FiltroLido) {
  if (filtro.invalido || filtro.naoSuportados.length) return false;
  return filtro.condicoes.every((condicao) => casaCondicao(campos, condicao));
}

// ---------- Universo e escolha do modelo ----------

/** Elegível para checklist: registro ativo e status diferente de Vendido (vazio conta como diferente). */
export const veiculoElegivel = (veiculo: VeiculoFiltro) => veiculo.statecode === 0 && veiculo.status !== VEICULO_STATUS.vendido;
/** Regra de hoje do padrão (IsOwnActiveVehicle do plugin): Ativo + Próprio. */
export const veiculoProprioAtivo = (veiculo: VeiculoFiltro) =>
  veiculo.statecode === 0 && veiculo.status === VEICULO_STATUS.ativo && veiculo.campos.new_categoriadoveiculo === VEICULO_CATEGORIA_PROPRIO;

const chaveNome = (nome: string) => nome.toUpperCase();
const comparaOrdinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Menor prioridade vence; nulo vai para o fim; desempate por nome (ordinal, sem caixa) e depois id. */
export function compararPrioridade(a: ModeloFiltravel, b: ModeloFiltravel) {
  const pa = a.prioridade ?? PRIORIDADE_ULTIMA;
  const pb = b.prioridade ?? PRIORIDADE_ULTIMA;
  if (pa !== pb) return pa < pb ? -1 : 1;
  return comparaOrdinal(chaveNome(a.nome), chaveNome(b.nome)) || comparaOrdinal(a.id.toLowerCase(), b.id.toLowerCase());
}

/** Padrão da rotina quinzenal: só conta se ativo. */
export const ehPadrao = (modelo: ModeloFiltravel) => modelo.ativo && modelo.padraoQuinzenal;

type Candidato<T> = { modelo: T; filtro: FiltroLido };

/** Modelos que a rotina tenta antes do padrão (ativos, não padrão, com filtro), por prioridade e já com o filtro lido. */
function candidatos<T extends ModeloFiltravel>(modelos: T[]): Candidato<T>[] {
  return modelos.filter((modelo) => modelo.ativo && !modelo.padraoQuinzenal)
    .map((modelo) => ({ modelo, filtro: lerFiltro(modelo.filtroJson) }))
    .filter(({ filtro }) => temFiltro(filtro))
    .sort((a, b) => compararPrioridade(a.modelo, b.modelo));
}

/**
 * Lê os filtros e ordena uma vez; devolve o modelo que a rotina escolhe para cada veículo: o primeiro candidato
 * cujo filtro casa; senão o padrão, se o veículo é próprio e ativo; senão nenhum. Não confere a elegibilidade.
 */
export const criarResolvedor = <T extends ModeloFiltravel>(modelos: T[]) => resolvedor(candidatos(modelos), modelos.find(ehPadrao));

function resolvedor<T extends ModeloFiltravel>(ordem: Candidato<T>[], padrao: T | undefined) {
  return (veiculo: VeiculoFiltro): T | null =>
    ordem.find(({ filtro }) => casaFiltro(veiculo.campos, filtro))?.modelo ?? (padrao && veiculoProprioAtivo(veiculo) ? padrao : null);
}

// ---------- Prévia ----------

export type PreviaFiltro = {
  recebem: { veiculo: VeiculoFiltro; tambem: string[] }[];
  /** Casam com este filtro, mas ficam com um modelo de prioridade maior. */
  ficamComOutro: { veiculo: VeiculoFiltro; modelo: string }[];
  /** Condições do modelo editado ainda sem valor, fora da conta. */
  incompletas: number;
};

/**
 * Quem recebe o modelo editado, com os outros modelos como estão gravados. O editado é avaliado como ativo
 * (a tela avisa à parte quando ele está inativo) e entra no lugar da versão gravada de si mesmo.
 */
export function previaFiltro(editado: ModeloFiltravel, outros: ModeloFiltravel[], veiculos: VeiculoFiltro[]): PreviaFiltro {
  // Condição ainda sem valor ("Marca contém" vazio) não entra na conta: só as completas (e as ilegíveis, que barram tudo).
  const lido = lerFiltro(editado.filtroJson);
  const completas = lido.condicoes.filter((condicao) => !erroCondicao(condicao));
  const incompletas = lido.condicoes.length - completas.length;
  const filtroJson = incompletas && !lido.invalido ? serializarFiltro(completas) : editado.filtroJson;
  const alvo: ModeloFiltravel = { ...editado, ativo: true, filtroJson };
  // Marcado como padrão nesta edição: ele substitui o padrão gravado (a troca só acontece ao salvar).
  const modelos = [...outros.filter((modelo) => (!editado.id || modelo.id !== editado.id) && !(alvo.padraoQuinzenal && ehPadrao(modelo))), alvo];
  const ordem = candidatos(modelos);
  const escolher = resolvedor(ordem, modelos.find(ehPadrao));
  const depois = ordem.slice(ordem.findIndex(({ modelo }) => modelo === alvo) + 1);
  const filtro = lerFiltro(alvo.filtroJson);
  const resultado: PreviaFiltro = { recebem: [], ficamComOutro: [], incompletas };
  for (const veiculo of veiculos.filter(veiculoElegivel)) {
    if (alvo.padraoQuinzenal) {
      if (escolher(veiculo) === alvo) resultado.recebem.push({ veiculo, tambem: [] });
      continue;
    }
    if (!temFiltro(filtro) || !casaFiltro(veiculo.campos, filtro)) continue;
    const vence = escolher(veiculo);
    if (vence === alvo) resultado.recebem.push({ veiculo, tambem: depois.filter((entry) => casaFiltro(veiculo.campos, entry.filtro)).map((entry) => entry.modelo.nome) });
    else if (vence) resultado.ficamComOutro.push({ veiculo, modelo: vence.nome });
  }
  return resultado;
}

// ---------- Texto e validação para o editor ----------

export type OpcaoChoice = { valor: number; rotulo: string };
export type OpcoesFiltro = Record<string, OpcaoChoice[]>;

const formatarInteiro = (value: unknown) => ehNumero(value) ? new Intl.NumberFormat("pt-BR").format(value) : "?";
/** Anos sem separador de milhar ("2022"); hodômetro com ("50.000"). */
const formatarNumero = (campo: string, value: unknown) => campo === "cr40f_hodometro" ? formatarInteiro(value) : ehNumero(value) ? String(value) : "?";

/** Condição como frase: "Marca contém Toyota", "Blindado é Sim", "Categoria é um destes: Próprio, Terceiro". */
export function descreverCondicao(condicao: Condicao, opcoes: OpcoesFiltro = {}) {
  const definicao = campoFiltro(condicao.campo);
  if (!definicao) return `Campo não suportado (${condicao.campo || "sem nome"})`;
  const operador = ROTULO_OPERADOR[condicao.operador as Operador] ?? condicao.operador;
  const valor = condicao.valor;
  if (definicao.tipo === "booleano") return `${definicao.rotulo} é ${valor === true ? "Sim" : valor === false ? "Não" : "?"}`;
  if (definicao.tipo === "choice") {
    const nomes = Array.isArray(valor) ? valor.map((item) => opcoes[condicao.campo]?.find((opcao) => opcao.valor === item)?.rotulo ?? `Valor ${item}`) : [];
    return `${definicao.rotulo} ${operador}: ${nomes.join(", ") || "?"}`;
  }
  if (definicao.tipo === "inteiro" && condicao.operador === "entre") {
    const [min, max] = Array.isArray(valor) ? valor : [];
    return `${definicao.rotulo} entre ${formatarNumero(condicao.campo, min)} e ${formatarNumero(condicao.campo, max)}`;
  }
  return `${definicao.rotulo} ${operador} ${definicao.tipo === "inteiro" ? formatarNumero(condicao.campo, valor) : typeof valor === "string" ? valor.trim() : "?"}`;
}

/** Quem recebe o modelo, em uma linha (lista de Modelos). */
export function resumoFiltro(modelo: ModeloFiltravel, opcoes: OpcoesFiltro = {}) {
  if (ehPadrao(modelo)) return "Próprios e ativos que não se encaixam em outro modelo";
  const filtro = lerFiltro(modelo.filtroJson);
  if (filtro.invalido) return "Filtro ilegível: nenhum veículo recebe";
  return filtro.condicoes.length ? filtro.condicoes.map((condicao) => descreverCondicao(condicao, opcoes)).join(" · ") : "Sem filtro: só quando escolhido ao solicitar";
}

/** Condição nova (ou com campo trocado): primeiro operador do tipo e valor vazio do tipo. */
export function condicaoPara(campo: string): Condicao {
  const definicao = campoFiltro(campo) ?? CAMPOS_FILTRO[0];
  const operador = definicao.tipo === "texto" ? "contem" : OPERADORES[definicao.tipo][0];
  return { campo: definicao.campo, operador, valor: valorVazio(definicao.tipo, operador) };
}

export function valorVazio(tipo: TipoCampo, operador: string): unknown {
  if (tipo === "texto") return "";
  if (tipo === "booleano") return true;
  if (tipo === "choice") return [];
  return operador === "entre" ? [null, null] : null;
}

/** O que falta na condição para salvar (vazio quando pode salvar). Campo não suportado não bloqueia: só avisa. */
export function erroCondicao(condicao: Condicao): string {
  const definicao = campoFiltro(condicao.campo);
  if (!definicao) return "";
  const valor = condicao.valor;
  if (definicao.tipo === "texto") return typeof valor === "string" && valor.trim() ? "" : "Escreva o valor.";
  if (definicao.tipo === "choice") return Array.isArray(valor) && valor.length ? "" : "Escolha pelo menos uma opção.";
  if (definicao.tipo === "inteiro") {
    if (condicao.operador === "entre") {
      const [min, max] = Array.isArray(valor) ? valor : [];
      if (!ehInteiro(min) || !ehInteiro(max)) return "Informe os dois números inteiros.";
      return min > max ? "O primeiro número precisa ser menor ou igual ao segundo." : "";
    }
    return ehInteiro(valor) ? "" : "Informe um número inteiro.";
  }
  return "";
}
