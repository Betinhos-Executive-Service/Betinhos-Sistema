import { cleanGuid, GUID_PATTERN } from "../comunicados/comunicados.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { retrieveMultipleAll } from "../../data/dataverse/cliente.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";
import { METAS_GASTOS, STATUS_DESPESA, norm, semaforo, somarDias, type DespesaRelatorio } from "./gastosRelatorio.ts";

// Conferência da despesa no envio: o app calcula os fatos ("sinais") e só chama a IA quando há algum.
// Spec: docs/superpowers/specs/2026-11-05-conferencia-envio-despesa-design.md

export type TipoSinal =
  | "acima_politica"
  | "refeicao_proxima"
  | "abastecimento_proximo"
  | "muitos_cafes"
  | "possivel_duplicidade"
  | "refeicao_sem_servico"
  | "data_diferente_cupom";

export type Sinal = { tipo: TipoSinal; detalhe: string };

/** Gasto sendo enviado. `data` AAAA-MM-DD; `hora` HH:mm do cupom (ou null). */
export type GastoConferido = {
  id?: string;
  categoria: string;
  valor: number;
  data: string;
  hora: string | null;
  litros: number | null;
  km: number | null;
  veiculoId: string;
};

/** Gasto já enviado; `hora` só existe quando o cupom tinha hora legível. */
export type GastoRecente = DespesaRelatorio & { hora?: string | null };

/** Serviço do motorista: saída e retorno previsto em `AAAA-MM-DDTHH:mm` (horário de São Paulo). */
export type ServicoConferido = { saida: string; retorno: string | null; cancelado: boolean };

export const LIMITES = {
  refeicaoHoras: 3,
  abastecimentoHoras: 4,
  abastecimentoKm: 150,
  cafesPorDia: 3
} as const;

const REFEICAO = ["almoco", "jantar"];
const CAFE = ["cafe", "lanche"];
const SEM_SERVICO = [...REFEICAO, ...CAFE];
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (valor: number) => BRL.format(valor).replace(/ /g, " ");
const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const cat = (nome: string) => norm(nome);
const minutos = (data: string, hora: string) => Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10), +hora.slice(0, 2), +hora.slice(3, 5)) / 60000;
const centavos = (valor: number) => Math.round(valor * 100);

/** Distância em horas entre dois gastos; null quando falta a hora de algum (aí vale só "mesmo dia"). */
function horasEntre(a: { data: string; hora?: string | null }, b: { data: string; hora?: string | null }) {
  if (!a.hora || !b.hora) return null;
  return Math.abs(minutos(a.data, a.hora) - minutos(b.data, b.hora)) / 60;
}

/** O serviço toca o dia se sai, volta ou atravessa aquela data (cancelado não conta). */
export function servicoTocaODia(servico: ServicoConferido, data: string) {
  if (servico.cancelado) return false;
  const inicio = servico.saida.slice(0, 10);
  const fim = (servico.retorno || servico.saida).slice(0, 10);
  return inicio <= data && data <= fim;
}

export function calcularSinais({ gasto, leituraData, recentes, servicos }: {
  gasto: GastoConferido;
  /** Data lida no cupom pela leitura rápida (AAAA-MM-DD) ou null. */
  leituraData: string | null;
  recentes: GastoRecente[];
  /** null quando a consulta falhou: a regra de refeição sem serviço fica de fora (não pergunta à toa). */
  servicos: ServicoConferido[] | null;
}): { sinais: Sinal[]; servicoDiaVizinho: string | null } {
  const sinais: Sinal[] = [];
  const categoria = cat(gasto.categoria);
  const outros = recentes.filter((d) => d.id !== gasto.id && d.status !== STATUS_DESPESA.cancelado);

  // Acima da referência, só faixa vermelha (até 5% acima na refeição e 2% no litro não é problema).
  const refeicaoAcima = REFEICAO.includes(categoria) && semaforo(gasto.valor, METAS_GASTOS.refeicao) === "vermelho";
  if (refeicaoAcima) {
    sinais.push({ tipo: "acima_politica", detalhe: `${gasto.categoria} de ${brl(gasto.valor)}; o valor de referência da empresa é ${brl(METAS_GASTOS.refeicao.meta)}` });
  }
  if (categoria === "abastecimento" && gasto.litros && gasto.litros > 0) {
    const porLitro = gasto.valor / gasto.litros;
    if (semaforo(porLitro, METAS_GASTOS.litro) === "vermelho") {
      sinais.push({ tipo: "acima_politica", detalhe: `${brl(porLitro)} por litro; o valor de referência da empresa é ${brl(METAS_GASTOS.litro.meta)}` });
    }
  }

  // Refeição perto de outra (com hora: < 3 h; sem hora: mesma refeição no mesmo dia). Só pergunta quando a refeição
  // atual passou da referência: duas refeições dentro do valor não são problema. Não cita o valor da outra refeição.
  if (refeicaoAcima) {
    const perto = outros.find((d) => {
      if (!REFEICAO.includes(cat(d.categoria))) return false;
      const horas = horasEntre(gasto, d);
      return horas == null ? d.data === gasto.data && cat(d.categoria) === categoria : horas < LIMITES.refeicaoHoras;
    });
    if (perto) sinais.push({ tipo: "refeicao_proxima", detalhe: `Já há outro ${perto.categoria.toLowerCase()} registrado em ${diaMes(perto.data)}${perto.hora ? ` às ${perto.hora}` : ""}` });
  }

  // Abastecimento perto de outro do mesmo veículo (< 4 h ou < 150 km rodados).
  if (categoria === "abastecimento") {
    const perto = outros.find((d) => {
      if (cat(d.categoria) !== "abastecimento" || (gasto.veiculoId && d.veiculoId && d.veiculoId !== gasto.veiculoId)) return false;
      const horas = horasEntre(gasto, d);
      const poucoTempo = horas == null ? d.data === gasto.data : horas < LIMITES.abastecimentoHoras;
      const poucoKm = gasto.km != null && d.km != null && gasto.km >= d.km && gasto.km - d.km < LIMITES.abastecimentoKm;
      return poucoTempo || poucoKm;
    });
    if (perto) {
      const km = gasto.km != null && perto.km != null ? `, ${gasto.km - perto.km} km depois` : "";
      sinais.push({ tipo: "abastecimento_proximo", detalhe: `Abastecimento de ${brl(perto.valor)} em ${diaMes(perto.data)}${perto.hora ? ` às ${perto.hora}` : ""}${km}` });
    }
  }

  // Mais de 3 cafés/lanches no dia, contando este.
  if (CAFE.includes(categoria)) {
    const total = outros.filter((d) => d.data === gasto.data && CAFE.includes(cat(d.categoria))).length + 1;
    if (total > LIMITES.cafesPorDia) sinais.push({ tipo: "muitos_cafes", detalhe: `${total} cafés ou lanches em ${diaMes(gasto.data)}` });
  }

  // Mesmo valor e mesma data de um gasto já enviado.
  const igual = outros.find((d) => d.data === gasto.data && centavos(d.valor) === centavos(gasto.valor));
  if (igual) sinais.push({ tipo: "possivel_duplicidade", detalhe: `${igual.categoria} de ${brl(igual.valor)} já enviado em ${diaMes(igual.data)}` });

  // Refeição/café sem serviço no dia; sugere o dia vizinho com serviço.
  let servicoDiaVizinho: string | null = null;
  if (servicos && SEM_SERVICO.includes(categoria) && !servicos.some((s) => servicoTocaODia(s, gasto.data))) {
    servicoDiaVizinho = [somarDias(gasto.data, -1), somarDias(gasto.data, 1)].find((dia) => servicos.some((s) => servicoTocaODia(s, dia))) ?? null;
    sinais.push({ tipo: "refeicao_sem_servico", detalhe: `Sem serviço em ${diaMes(gasto.data)}${servicoDiaVizinho ? `; há serviço em ${diaMes(servicoDiaVizinho)}` : ""}` });
  }

  // Data digitada diferente da lida no cupom.
  if (leituraData && leituraData !== gasto.data) {
    sinais.push({ tipo: "data_diferente_cupom", detalhe: `Data informada ${diaMes(gasto.data)}, no cupom ${diaMes(leituraData)}` });
  }

  return { sinais, servicoDiaVizinho };
}

// ---------------- Serviços do motorista para a conferência ----------------

/** cr40f_status "Cancelado" (202410002). "Cancelado com Ressalvas" conta como serviço: o motorista pode ter ido. */
export const STATUS_SERVICO_CANCELADO = 202410002;
const CATEGORIA_SERVICO = 100000000;
const SP = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** ISO do Dataverse (UTC) para `AAAA-MM-DDTHH:mm` em São Paulo; vazio vira null. */
export function paraHorarioSaoPaulo(iso: unknown) {
  const texto = iso == null ? "" : String(iso);
  const data = new Date(texto);
  return texto && !Number.isNaN(data.getTime()) ? SP.format(data).replace(" ", "T") : null;
}

/** Serviços do motorista com saída de [véspera, dia seguinte] (00:00 de São Paulo = 03:00 UTC). */
export function filtroServicosConferencia(motoristaId: string, data: string) {
  const id = cleanGuid(motoristaId);
  if (!GUID_PATTERN.test(id)) throw new Error("Motorista não identificado para conferir o gasto.");
  return `_cr40f_motorista_value eq ${id} and new_categoriadoitem eq ${CATEGORIA_SERVICO} and _cr40f_om_value eq null and _cr40f_ot_value eq null`
    + ` and cr40f_dataehorriodesada ge ${somarDias(data, -1)}T03:00:00Z and cr40f_dataehorriodesada lt ${somarDias(data, 2)}T03:00:00Z`;
}

export function mapServicoConferencia(row: Record<string, unknown>): ServicoConferido | null {
  const saida = paraHorarioSaoPaulo(row.cr40f_dataehorriodesada);
  return saida ? { saida, retorno: paraHorarioSaoPaulo(row.cr40f_horrioprevistoderetorno), cancelado: Number(row.cr40f_status) === STATUS_SERVICO_CANCELADO } : null;
}

export async function carregarServicosConferencia(motoristaId: string, data: string): Promise<ServicoConferido[]> {
  if (isMockGastosCartao()) {
    // Mock local: serviço só na véspera, para a refeição de hoje cair em "sem serviço" com sugestão do dia anterior.
    if (new URLSearchParams(window.location.search).get("mockConferencia") === "sem-servico") return [{ saida: `${somarDias(data, -1)}T09:00`, retorno: `${somarDias(data, -1)}T17:00`, cancelado: false }];
    return [{ saida: `${data}T08:00`, retorno: `${data}T18:00`, cancelado: false }];
  }
  const { entities } = await retrieveMultipleAll(DATAVERSE.geral, `$select=cr40f_dataehorriodesada,cr40f_horrioprevistoderetorno,cr40f_status&$filter=${filtroServicosConferencia(motoristaId, data)}`);
  return entities.map((row) => mapServicoConferencia(row as Record<string, unknown>)).filter((s): s is ServicoConferido => s != null);
}

// ---------------- Gravação na despesa ----------------

/** Choice new_conferenciaenvio (scripts/provision-conferencia-envio-schema.ps1). */
export const CONFERENCIA_OPCAO = { sem_duvida: 100000000, duvida_respondida: 100000001, indisponivel: 100000002, sem_sinal: 100000003 } as const;

export type ConferenciaEnvio = {
  resultado: keyof typeof CONFERENCIA_OPCAO;
  motivos: TipoSinal[];
  pergunta?: string;
  justificativa?: string;
  /** Hora do cupom (HH:mm) lida pela leitura rápida. */
  hora: string | null;
};

/** Campos a juntar no payload de criação da despesa ou no PATCH de completar gasto do cartão. */
export function camposConferencia(conferencia: ConferenciaEnvio) {
  const campos: Record<string, unknown> = {
    new_conferenciaenvio: CONFERENCIA_OPCAO[conferencia.resultado],
    new_conferenciamotivos: conferencia.motivos.join(",").slice(0, 400)
  };
  if (conferencia.pergunta?.trim()) campos.new_conferenciapergunta = conferencia.pergunta.trim().slice(0, 2000);
  if (conferencia.justificativa?.trim()) campos.new_conferenciajustificativa = conferencia.justificativa.trim().slice(0, 4000);
  if (conferencia.hora && /^([01]\d|2[0-3]):[0-5]\d$/.test(conferencia.hora)) campos.new_horagasto = conferencia.hora;
  return campos;
}

// ---------------- Chamada ao flow ----------------

export const JUSTIFICATIVA_MINIMA = 10;
export const TIMEOUT_CONFERENCIA_MS = 12_000;

export type RespostaConferenciaFlow = { resultado: "sem_duvida" } | { resultado: "duvida"; pergunta: string; motivos: TipoSinal[] } | null;

/** Resposta do flow; qualquer coisa fora do contrato vira null (= indisponível, envia sem perguntar). */
export function lerRespostaConferencia(body: unknown): RespostaConferenciaFlow {
  const r = body as { ok?: unknown; resultado?: unknown; pergunta?: unknown; motivos?: unknown } | null;
  if (!r || r.ok !== true) return null;
  if (r.resultado === "sem_duvida") return { resultado: "sem_duvida" };
  if (r.resultado !== "duvida" || typeof r.pergunta !== "string" || r.pergunta.trim().length < 10) return null;
  const motivos = Array.isArray(r.motivos) ? r.motivos.filter((m): m is TipoSinal => typeof m === "string") : [];
  return { resultado: "duvida", pergunta: r.pergunta.trim(), motivos };
}

/** Corpo enviado ao flow: só o necessário (sem nome de passageiro/cliente). */
export function montarCorpoConferencia({ gasto, descricao, leituraData, sinais, servicoDiaVizinho, recentes }: {
  gasto: GastoConferido; descricao: string; leituraData: string | null; sinais: Sinal[]; servicoDiaVizinho: string | null; recentes: GastoRecente[];
}) {
  return {
    gasto: { categoria: gasto.categoria, valor: gasto.valor, data: gasto.data, hora: gasto.hora, litros: gasto.litros, km: gasto.km, descricao: descricao.slice(0, 1000) },
    leitura: leituraData ? { data: leituraData } : null,
    metas: METAS_GASTOS,
    sinais,
    servico_dia_vizinho: servicoDiaVizinho,
    recentes: recentes
      .filter((d) => d.id !== gasto.id && d.status !== STATUS_DESPESA.cancelado && d.data >= somarDias(gasto.data, -7) && d.data <= somarDias(gasto.data, 1))
      .slice(0, 40)
      .map((d) => ({ categoria: d.categoria, valor: d.valor, data: d.data, hora: d.hora ?? null, litros: d.litros, km: d.km }))
  };
}

/** Mock local (`?mockConferencia=sem|erro`; padrão: dúvida com os detalhes dos sinais). */
export async function respostaConferenciaMock(sinais: Sinal[]) {
  await new Promise((resolve) => setTimeout(resolve, 900));
  const modo = new URLSearchParams(window.location.search).get("mockConferencia");
  if (modo === "erro") return { ok: false, erro: "conferencia_indisponivel" };
  if (modo === "sem") return { ok: true, resultado: "sem_duvida", pergunta: null, motivos: [] };
  return { ok: true, resultado: "duvida", pergunta: `${sinais.map((s) => s.detalhe).join(". ")}. Pode explicar o que aconteceu?`, motivos: sinais.map((s) => s.tipo) };
}
