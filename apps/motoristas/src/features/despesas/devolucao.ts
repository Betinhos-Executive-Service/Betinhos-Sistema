import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { updateOne } from "../../data/dataverse/cliente.ts";
import { wait } from "../../shared/wait.ts";
import { uploadExpenseInvoiceRemote } from "./remoto.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";
import { STATUS_DESPESA, ehDevolvidaParaAcao, type DespesaRelatorio } from "./gastosRelatorio.ts";

// Despesa devolvida: o motorista vê o motivo, troca o comprovante e/ou explica, e reenvia para nova conferência.
// Colunas (spec de 10/11/2026, Betinhos-Sistema): new_motivodevolucao, new_justificativamotorista, new_aguardandogestor.
// O valor da despesa fica travado: nada aqui altera cr40f_valor.

export const MIN_EXPLICACAO = 10;
/** cr40f_statusanexo = Completo. */
export const ANEXO_COMPLETO = 100000002;
export const MOTIVO_PADRAO = "O financeiro pediu uma conferência neste gasto. Troque o comprovante ou explique o que aconteceu.";

type CamposDevolucao = Pick<DespesaRelatorio, "status" | "aguardandoGestor" | "motivoDevolucao" | "iaMotivos" | "justificativa">;

/** "acao": motorista deve agir. "gestor": a dúvida está com o gestor. "conferencia": reenviada, aguardando a análise. */
export type EstadoDevolucao = "acao" | "gestor" | "conferencia";

/** Motivo para o motorista: o da devolução; se vazio, o da análise da IA; se também vazio, texto padrão. */
export function motivoParaMotorista(d: Pick<DespesaRelatorio, "motivoDevolucao" | "iaMotivos">) {
  return d.motivoDevolucao.trim() || d.iaMotivos.trim();
}

export function estadoDevolucao(d: CamposDevolucao): EstadoDevolucao | null {
  const emAberto = d.status === STATUS_DESPESA.precisaCorrigir || d.status === STATUS_DESPESA.enviado;
  if (d.aguardandoGestor && emAberto) return "gestor";
  if (ehDevolvidaParaAcao(d)) return "acao";
  // Reenviada: voltou a "Enviado" e ainda guarda o motivo da devolução ou a explicação do motorista.
  if (d.status === STATUS_DESPESA.enviado && (motivoParaMotorista(d) || d.justificativa.trim())) return "conferencia";
  return null;
}

export const SELO_DEVOLUCAO: Record<EstadoDevolucao, { rotulo: string; tom: string }> = {
  acao: { rotulo: "Precisa da sua ação", tom: "atencao" },
  gestor: { rotulo: "Com o gestor", tom: "neutro" },
  conferencia: { rotulo: "Em conferência", tom: "neutro" }
};

// ---------------- Validação ----------------

export type ValidacaoEnvio = { pode: boolean; erro: string };

/** Pelo menos uma ação (foto nova ou explicação). Explicação de 1 a 9 caracteres não passa; em branco vale como "só a foto". */
export function validarEnvio({ explicacao, temFoto }: { explicacao: string; temFoto: boolean }): ValidacaoEnvio {
  const tamanho = explicacao.trim().length;
  if (tamanho > 0 && tamanho < MIN_EXPLICACAO) return { pode: false, erro: `Conte um pouco mais: mínimo de ${MIN_EXPLICACAO} caracteres.` };
  return { pode: tamanho > 0 || temFoto, erro: "" };
}

// ---------------- Payload e envio ----------------

/** Um único PATCH: explicação (se houver), status Enviado e anexo Completo (dispara a nova análise, mesmo sem foto nova). */
export function buildDevolucaoPayload(explicacao: string) {
  const texto = explicacao.trim();
  return {
    ...(texto ? { new_justificativamotorista: texto } : {}),
    cr40f_statusoperacional: STATUS_DESPESA.enviado,
    cr40f_statusanexo: ANEXO_COMPLETO
  };
}

export type FotoNova = { dataUrl: string; fileName: string };
/** Guarda o que já foi feito entre tentativas: numa nova tentativa o comprovante não sobe de novo. */
export type ProgressoEnvio = { anexado: boolean };
export type DependenciasEnvio = {
  subirComprovante: (foto: FotoNova) => Promise<void>;
  atualizarDespesa: (payload: ReturnType<typeof buildDevolucaoPayload>) => Promise<void>;
};

/** Comprovante primeiro (a IA analisa já com o arquivo novo) e depois o PATCH. Qualquer falha propaga; o chamador mantém o texto. */
export async function enviarDevolucao(
  entrada: { explicacao: string; foto: FotoNova | null; progresso: ProgressoEnvio },
  deps: DependenciasEnvio
) {
  const { explicacao, foto, progresso } = entrada;
  if (foto && !progresso.anexado) {
    await deps.subirComprovante(foto);
    progresso.anexado = true;
  }
  await deps.atualizarDespesa(buildDevolucaoPayload(explicacao));
}

/** Dependências reais (Dataverse). `ordem` = próxima posição do comprovante, depois dos que já existem. */
export function dependenciasRemotas({ despesaId, nome, motoristaId, ordem }: { despesaId: string; nome: string; motoristaId: string; ordem: number }): DependenciasEnvio {
  return {
    async subirComprovante(foto) {
      if (isMockGastosCartao()) return simularRede();
      await uploadExpenseInvoiceRemote({ expenseId: despesaId, expenseName: nome || despesaId, motoristaId, dataUrl: foto.dataUrl, fileName: foto.fileName, order: ordem });
    },
    async atualizarDespesa(payload) {
      if (isMockGastosCartao()) return simularRede();
      await updateOne(DATAVERSE.despesasOperacionais, despesaId, payload);
    }
  };
}

/** No mock, `?mockEnvioDevolucao=erro` simula falha de rede (para ver o texto preservado). */
async function simularRede() {
  await wait(500);
  if (new URLSearchParams(window.location.search).get("mockEnvioDevolucao") === "erro") throw new Error("Falha simulada de rede.");
}

// ---------------- Rascunho da explicação ----------------

type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const chaveRascunho = (despesaId: string) => `app-motoristas:devolucao:${despesaId}`;
const armazenamentoPadrao = (): Armazenamento | null => { try { return window.localStorage; } catch { return null; } };

/** O texto digitado sobrevive a falha de rede, fechar o painel e recarregar o app. */
export function lerRascunho(despesaId: string, armazenamento: Armazenamento | null = armazenamentoPadrao()) {
  try { return armazenamento?.getItem(chaveRascunho(despesaId)) ?? ""; } catch { return ""; }
}

export function guardarRascunho(despesaId: string, texto: string, armazenamento: Armazenamento | null = armazenamentoPadrao()) {
  try {
    if (texto) armazenamento?.setItem(chaveRascunho(despesaId), texto);
    else armazenamento?.removeItem(chaveRascunho(despesaId));
  } catch { /* sem armazenamento: o texto segue só no estado da tela */ }
}
