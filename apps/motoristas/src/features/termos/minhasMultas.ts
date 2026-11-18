// Multas do motorista como o servidor monta em new_MinhasMultas (MinhasMultas.cs): o app mostra a situação como vem e não recalcula.
import { cleanGuid } from "../comunicados/comunicados.ts";
import { executeCustomApi } from "../../data/dataverse/customApi.ts";
import { formatBrl, isMockTermos } from "./termosMulta.ts";

export type CargaStatus = "loading" | "ready" | "error";
export type GrupoMulta = "precisa" | "andamento" | "encerrada";
export type AcaoMulta = "assinar" | "aceite" | null;
export type StatusParcela = "prevista" | "descontada" | "cancelada";

export type MinhaParcela = {
  numero: number;
  /** Primeiro dia do mês da folha (yyyy-MM-dd). */
  competencia: string | null;
  valor: number;
  status: StatusParcela | string;
};

export type MinhaMulta = {
  id: string;
  auto: string;
  placa: string;
  /** UTC, yyyy-MM-ddTHH:mm:ssZ. */
  dataHora: string | null;
  local: string;
  infracao: string;
  grupo: GrupoMulta;
  situacao: string;
  acao: AcaoMulta;
  termoId: string | null;
  termoStatus: "pendente" | "assinado" | "contestado" | "expirado" | "cancelado" | null;
  /** Dia (yyyy-MM-dd) até o qual o aceite na CNH Digital deve ser feito. */
  prazoAceite: string | null;
  aceiteDeclaradoEm: string | null;
  parcelas: MinhaParcela[];
};

const GRUPOS: GrupoMulta[] = ["precisa", "andamento", "encerrada"];
const texto = (v: unknown) => (typeof v === "string" ? v : "");
const textoOuNulo = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Aceita só o que o app sabe desenhar; item sem id ou com grupo desconhecido é ignorado. */
export function mapMinhaMulta(bruto: unknown): MinhaMulta | null {
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  const grupo = r.grupo as GrupoMulta;
  if (!texto(r.id) || !GRUPOS.includes(grupo)) return null;
  const parcelas = Array.isArray(r.parcelas)
    ? r.parcelas.map((p) => {
      const q = (p ?? {}) as Record<string, unknown>;
      return { numero: Number(q.numero) || 0, competencia: textoOuNulo(q.competencia), valor: Number(q.valor) || 0, status: texto(q.status) };
    })
    : [];
  return {
    id: texto(r.id), auto: texto(r.auto), placa: texto(r.placa), dataHora: textoOuNulo(r.dataHora), local: texto(r.local),
    infracao: texto(r.infracao), grupo, situacao: texto(r.situacao),
    acao: r.acao === "assinar" || r.acao === "aceite" ? r.acao : null,
    termoId: textoOuNulo(r.termoId), termoStatus: (textoOuNulo(r.termoStatus) as MinhaMulta["termoStatus"]),
    prazoAceite: textoOuNulo(r.prazoAceite), aceiteDeclaradoEm: textoOuNulo(r.aceiteDeclaradoEm), parcelas
  };
}

/** O servidor já entrega na ordem certa (aceite mais urgente primeiro, encerradas por fim); aqui só se separa. */
export function agruparMinhasMultas(itens: MinhaMulta[]) {
  return {
    precisa: itens.filter((m) => m.grupo === "precisa"),
    andamento: itens.filter((m) => m.grupo === "andamento"),
    encerrada: itens.filter((m) => m.grupo === "encerrada")
  };
}

/** yyyy-MM-dd para dd/mm, sem passar por Date (evita deslocar o dia pelo fuso). */
export function diaMes(dia: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia ?? "");
  return m ? `${m[3]}/${m[2]}` : "";
}

/** "Parcela 2 de 3 · R$ 65,08 · folha de 12/2026 · prevista". */
export function descreverParcela(parcela: MinhaParcela, total: number) {
  const m = /^(\d{4})-(\d{2})/.exec(parcela.competencia ?? "");
  const folha = m ? ` · folha de ${m[2]}/${m[1]}` : "";
  return `Parcela ${parcela.numero} de ${total} · ${formatBrl(parcela.valor)}${folha} · ${parcela.status}`;
}

/** "14:32" no fuso de Brasília, para a faixa de modo offline. */
export function horaDoCache(salvoEm: string) {
  return new Date(salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export const SEM_CONEXAO_TEXTO = "Sem conexão, tente de novo";
export const textoAceite = (auto: string, prazo: string | null) =>
  `Abra a CNH Digital, vá em Infrações e aceite a indicação da multa ${auto}${prazo ? ` até ${diaMes(prazo)}` : ""}.`;

// ---------------- Dados ----------------

let mockMultas: MinhaMulta[] | null = null;
function getMockMultas() {
  mockMultas ??= [
    { id: "aaaaaaaa-0000-4000-8000-000000000001", auto: "A000000001", placa: "TST1A23", dataHora: "2026-11-05T17:30:00Z", local: "Av. Exemplo, 100 (fictício)", infracao: "Infração fictícia A", grupo: "precisa", situacao: "Assine o termo da multa", acao: "assinar", termoId: "55555555-5555-4555-8555-555555555555", termoStatus: "pendente", prazoAceite: null, aceiteDeclaradoEm: null, parcelas: [] },
    { id: "aaaaaaaa-0000-4000-8000-000000000002", auto: "A000000002", placa: "TST4B56", dataHora: "2026-11-08T11:10:00Z", local: "Rua Exemplo, 200 (fictício)", infracao: "Infração fictícia B", grupo: "precisa", situacao: "Aceite a indicação na CNH Digital", acao: "aceite", termoId: null, termoStatus: null, prazoAceite: "2026-11-25", aceiteDeclaradoEm: null, parcelas: [] },
    { id: "aaaaaaaa-0000-4000-8000-000000000003", auto: "A000000003", placa: "TST7C89", dataHora: "2026-10-12T09:00:00Z", local: "Rod. Exemplo, km 10 (fictício)", infracao: "Infração fictícia C", grupo: "andamento", situacao: "Descontando 1 de 3", acao: null, termoId: "77777777-7777-4777-8777-777777777777", termoStatus: "assinado", prazoAceite: null, aceiteDeclaradoEm: null, parcelas: [{ numero: 1, competencia: "2026-11-01", valor: 65.08, status: "descontada" }, { numero: 2, competencia: "2026-12-01", valor: 65.08, status: "prevista" }, { numero: 3, competencia: "2027-01-01", valor: 65.08, status: "prevista" }] },
    { id: "aaaaaaaa-0000-4000-8000-000000000004", auto: "A000000004", placa: "TST1A23", dataHora: "2026-08-20T18:30:00Z", local: "Av. Exemplo, 300 (fictício)", infracao: "Infração fictícia D", grupo: "encerrada", situacao: "Encerrada", acao: null, termoId: null, termoStatus: null, prazoAceite: null, aceiteDeclaradoEm: null, parcelas: [] }
  ];
  return mockMultas;
}

/** Multas do motorista logado (Function new_MinhasMultas); o servidor filtra pelo login. */
export async function listarMinhasMultas(): Promise<MinhaMulta[]> {
  if (isMockTermos()) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return getMockMultas().map((m) => ({ ...m }));
  }
  const resposta = await executeCustomApi("new_MinhasMultas", {}, { funcao: true });
  const bruto = JSON.parse(String(resposta.new_MultasJson ?? "[]")) as unknown;
  if (!Array.isArray(bruto)) throw new Error("Resposta de multas inválida.");
  return bruto.map(mapMinhaMulta).filter((m): m is MinhaMulta => m !== null);
}

/** Registra que o motorista aceitou na CNH Digital; o gestor confere depois. Repetir é inofensivo no servidor. */
export async function declararAceite(multaId: string): Promise<void> {
  if (isMockTermos()) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const alvo = getMockMultas().find((m) => m.id === multaId);
    if (!alvo) throw new Error("Esta multa não é sua.");
    Object.assign(alvo, { grupo: "andamento", situacao: "Aceite em conferência", acao: null, aceiteDeclaradoEm: new Date().toISOString().slice(0, 10) });
    return;
  }
  await executeCustomApi("new_DeclararAceiteMulta", { new_MultaId: cleanGuid(multaId) });
}
