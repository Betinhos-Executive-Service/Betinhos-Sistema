import { executeCustomApi } from "../../data/dataverse/customApi.ts";

// Nota de condução da Infleet (Custom API new_NotaInfleet). Fora do Dataverse usa dados fictícios.
export type Comportamento = { chave: string; rotulo: string; nota: number };
export type MesNota = { ano: number; mes: number; nota: number; km: number };
export type NotaInfleet =
  | { situacao: "ok"; inicio: string; fim: string; km: number; nota: number; comportamentos: Comportamento[]; meses: MesNota[] }
  | { situacao: "em_formacao"; inicio: string; fim: string; km: number; comportamentos: Comportamento[]; meses: MesNota[] }
  | { situacao: "sem_cadastro" };
export type Faixa = { rotulo: "Ótima" | "Boa" | "Atenção"; tom: "otima" | "boa" | "atencao" };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const erroResposta = () => new Error("Resposta inesperada da nota.");

const num = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? valor : 0);
const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");

export function lerNotaInfleet(json: string): NotaInfleet {
  let bruto: Record<string, unknown>;
  try { bruto = JSON.parse(json) as Record<string, unknown>; } catch { throw erroResposta(); }
  if (!bruto || bruto.schema !== 1) throw erroResposta();
  if (bruto.situacao === "sem_cadastro") return { situacao: "sem_cadastro" };
  if (bruto.situacao !== "ok" && bruto.situacao !== "em_formacao") throw erroResposta();
  const periodo = (bruto.periodo ?? {}) as Record<string, unknown>;
  const comportamentos = (Array.isArray(bruto.comportamentos) ? bruto.comportamentos : []).map((item: Record<string, unknown>) => ({
    chave: texto(item.chave), rotulo: texto(item.rotulo), nota: num(item.nota)
  }));
  const meses = (Array.isArray(bruto.meses) ? bruto.meses : []).map((item: Record<string, unknown>) => ({
    ano: num(item.ano), mes: num(item.mes), nota: num(item.nota), km: num(item.km)
  }));
  const base = { inicio: texto(periodo.inicio), fim: texto(periodo.fim), km: num(bruto.km), comportamentos, meses };
  if (bruto.situacao === "em_formacao") return { situacao: "em_formacao", ...base };
  if (typeof bruto.nota !== "number") throw erroResposta();
  return { situacao: "ok", ...base, nota: bruto.nota };
}

export function faixaDaNota(nota: number): Faixa {
  const n = Math.round(nota);
  if (n >= 90) return { rotulo: "Ótima", tom: "otima" };
  if (n >= 75) return { rotulo: "Boa", tom: "boa" };
  return { rotulo: "Atenção", tom: "atencao" };
}

export function oQueMelhorar(comportamentos: Comportamento[]): Comportamento[] {
  return comportamentos.filter((c) => c.nota < 90).sort((a, b) => a.nota - b.nota).slice(0, 2);
}

// Dica curta para o motorista saber o que fazer em cada comportamento da Infleet.
export const DICAS: Record<string, string> = {
  hardBraking: "Mantenha distância e freie com antecedência.",
  hardCornering: "Reduza antes de entrar na curva.",
  hardAcceleration: "Acelere aos poucos ao sair.",
  deviceOverspeed: "Respeite o limite da via.",
  deviceIdle: "Desligue o motor nas paradas longas."
};

// Pontos (arredondados) que faltam para a próxima faixa; null quando já é Ótima.
export function proximaFaixa(nota: number): { rotulo: "Ótima" | "Boa"; faltam: number } | null {
  const n = Math.round(nota);
  if (n >= 90) return null;
  return n >= 75 ? { rotulo: "Ótima", faltam: 90 - n } : { rotulo: "Boa", faltam: 75 - n };
}

// Diferença entre o último mês e o anterior, em pontos arredondados.
export function variacaoMensal(meses: MesNota[]): { pontos: number; mesAnterior: MesNota } | null {
  if (meses.length < 2) return null;
  const [anterior, atual] = meses.slice(-2);
  return { pontos: Math.round(atual.nota) - Math.round(anterior.nota), mesAnterior: anterior };
}

export function rotuloMes(ano: number, mes: number): string {
  return `${MESES[mes - 1] ?? ""}/${String(ano % 100).padStart(2, "0")}`;
}

const isMockNotaInfleet = () => ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");

const MOCK: NotaInfleet = {
  situacao: "ok", inicio: "2026-08-21", fim: "2026-11-19", km: 5156.2, nota: 82.9,
  comportamentos: [
    { chave: "hardBraking", rotulo: "Frenagem brusca", nota: 67 },
    { chave: "hardCornering", rotulo: "Curva brusca", nota: 78.4 },
    { chave: "hardAcceleration", rotulo: "Aceleração brusca", nota: 90.5 },
    { chave: "deviceOverspeed", rotulo: "Excesso de velocidade", nota: 96 },
    { chave: "deviceIdle", rotulo: "Motor ocioso", nota: 100 }
  ],
  meses: [
    { ano: 2026, mes: 6, nota: 71.2, km: 2310 },
    { ano: 2026, mes: 7, nota: 76.5, km: 2840 },
    { ano: 2026, mes: 8, nota: 80.1, km: 3120 },
    { ano: 2026, mes: 9, nota: 84.3, km: 2975 },
    { ano: 2026, mes: 10, nota: 88.7, km: 3402 },
    { ano: 2026, mes: 11, nota: 92.4, km: 1220 }
  ]
};

export async function carregarNotaInfleet(): Promise<NotaInfleet> {
  if (isMockNotaInfleet()) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const caso = new URLSearchParams(window.location.search).get("mockNota");
    if (caso === "erro") throw new Error("Falha simulada.");
    if (caso === "sem") return { situacao: "sem_cadastro" };
    if (caso === "formacao") return { situacao: "em_formacao", inicio: "2026-08-21", fim: "2026-11-19", km: 32.4, comportamentos: [], meses: [] };
    const valor = Number(caso);
    return caso && Number.isFinite(valor) ? { ...MOCK, nota: valor } : MOCK;
  }
  const resposta = await executeCustomApi("new_NotaInfleet", {});
  return lerNotaInfleet(String(resposta.new_Result ?? ""));
}
