import assert from "node:assert/strict";
import test from "node:test";
import {
  ANEXO_COMPLETO,
  MIN_EXPLICACAO,
  buildDevolucaoPayload,
  enviarDevolucao,
  estadoDevolucao,
  guardarRascunho,
  lerRascunho,
  motivoParaMotorista,
  validarEnvio,
  type DependenciasEnvio,
  type ProgressoEnvio
} from "../src/features/despesas/devolucao.ts";
import { STATUS_DESPESA, ehPendente, mapDespesaRelatorio, montarRelatorio, type DespesaRelatorio } from "../src/features/despesas/gastosRelatorio.ts";

let seq = 0;
const d = (parcial: Partial<DespesaRelatorio>): DespesaRelatorio => ({
  id: `d${++seq}`, valor: 10, data: "2026-11-10", categoria: "Outros", formaPagamentoId: "", status: STATUS_DESPESA.enviado,
  statusAnexo: 100000002, litros: null, km: null, veiculoId: "", estabelecimento: "", conciliadaCartao: false,
  motivoDevolucao: "", iaMotivos: "", justificativa: "", aguardandoGestor: false, ...parcial
});
const HOJE = "2026-11-20";

// ---------------- selo e ordenação ----------------

test("selo: devolvida pede ação, com o gestor não tem ação e reenviada fica em conferência", () => {
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.precisaCorrigir, motivoDevolucao: "Cupom ilegível." })), "acao");
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.precisaCorrigir, aguardandoGestor: true })), "gestor");
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.enviado, aguardandoGestor: true })), "gestor");
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.enviado, motivoDevolucao: "Cupom ilegível." })), "conferencia");
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.enviado, justificativa: "O posto errou o cupom." })), "conferencia");
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.enviado })), null);
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.validado, motivoDevolucao: "Resolvido." })), null);
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.recusado })), null);
});

test("com o gestor: motivo e selo, mas nenhuma ação para o motorista", () => {
  const comGestor = d({ status: STATUS_DESPESA.precisaCorrigir, aguardandoGestor: true, motivoDevolucao: "Valor diferente.", justificativa: "O posto errou." });
  assert.equal(estadoDevolucao(comGestor), "gestor");
  assert.equal(ehPendente(comGestor), false);
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.precisaCorrigir, motivoDevolucao: "Valor diferente." })), "acao");
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.enviado, motivoDevolucao: "Valor diferente." })), "conferencia", "reenviada: em conferência, sem ações");
  assert.equal(estadoDevolucao(d({ status: STATUS_DESPESA.recusado })), null);
});

test("motivo: usa new_motivodevolucao e cai para cr40f_iamotivos quando vazio", () => {
  assert.equal(motivoParaMotorista(d({ motivoDevolucao: " Valor diferente ", iaMotivos: "IA" })), "Valor diferente");
  assert.equal(motivoParaMotorista(d({ motivoDevolucao: "  ", iaMotivos: "Data diferente" })), "Data diferente");
  assert.equal(motivoParaMotorista(d({})), "");
});

test("mapeia as colunas da devolução do Dataverse", () => {
  const item = mapDespesaRelatorio(
    { cr40f_despesaoperacionalid: "ABC", cr40f_statusoperacional: 100000001, new_motivodevolucao: " Cupom cortado ", cr40f_iamotivos: "IA", new_justificativamotorista: "Foi o posto", new_aguardandogestor: true },
    new Map()
  );
  assert.deepEqual([item.motivoDevolucao, item.iaMotivos, item.justificativa, item.aguardandoGestor], ["Cupom cortado", "IA", "Foi o posto", true]);
  const vazio = mapDespesaRelatorio({ cr40f_despesaoperacionalid: "x", cr40f_statusoperacional: 100000000 }, new Map());
  assert.deepEqual([vazio.motivoDevolucao, vazio.justificativa, vazio.aguardandoGestor], ["", "", false]);
});

test("a devolvida vai para o topo da lista, mesmo de outro mês, e a que está com o gestor não conta como pendência", () => {
  const lista = [
    d({ id: "recente", data: "2026-11-18", status: STATUS_DESPESA.enviado }),
    d({ id: "devolvida", data: "2026-11-02", status: STATUS_DESPESA.precisaCorrigir, motivoDevolucao: "Cupom cortado." }),
    d({ id: "antiga", data: "2026-10-05", status: STATUS_DESPESA.precisaCorrigir, motivoDevolucao: "Valor diferente." }),
    d({ id: "gestor", data: "2026-11-15", status: STATUS_DESPESA.precisaCorrigir, aguardandoGestor: true })
  ];
  const rel = montarRelatorio(lista, "mes", HOJE);
  assert.deepEqual(rel.despesas.slice(0, 2).map((x) => x.id), ["devolvida", "antiga"]);
  assert.deepEqual(rel.despesas.filter(ehPendente).map((x) => x.id), ["devolvida", "antiga"]);
  assert.equal(rel.status.precisaCorrigir, 2);
  assert.equal(rel.quantidade, 3);
});

// ---------------- Explicar: mínimo de 10 caracteres ----------------

test("Explicar exige pelo menos 10 caracteres; em branco vale como só a foto", () => {
  assert.equal(MIN_EXPLICACAO, 10);
  assert.equal(validarEnvio({ explicacao: "curto", temFoto: false }).pode, false);
  assert.equal(validarEnvio({ explicacao: "curto", temFoto: true }).pode, false, "texto curto bloqueia mesmo com foto");
  assert.match(validarEnvio({ explicacao: "curto", temFoto: false }).erro, /10 caracteres/);
  assert.equal(validarEnvio({ explicacao: "123456789", temFoto: false }).pode, false);
  assert.equal(validarEnvio({ explicacao: "1234567890", temFoto: false }).pode, true);
  assert.equal(validarEnvio({ explicacao: "  123456789  ", temFoto: false }).pode, false, "espaços não contam");
  assert.deepEqual(validarEnvio({ explicacao: "", temFoto: true }), { pode: true, erro: "" });
  assert.equal(validarEnvio({ explicacao: "", temFoto: false }).pode, false, "sem ação, sem envio");
});

// ---------------- payload do PATCH ----------------

test("PATCH único: justificativa (se houver), status Enviado e anexo Completo, sem mexer no valor", () => {
  assert.deepEqual(buildDevolucaoPayload("  O posto emitiu o cupom com o valor errado.  "), {
    new_justificativamotorista: "O posto emitiu o cupom com o valor errado.",
    cr40f_statusoperacional: 100000000,
    cr40f_statusanexo: 100000002
  });
  assert.deepEqual(buildDevolucaoPayload("   "), { cr40f_statusoperacional: 100000000, cr40f_statusanexo: ANEXO_COMPLETO });
  assert.equal("cr40f_valor" in buildDevolucaoPayload("qualquer explicação"), false);
});

// ---------------- envio e falha de rede ----------------

const FOTO = { dataUrl: "data:image/jpeg;base64,AAAA", fileName: "cupom.jpg" };
function dependencias(falhas: { upload?: number; patch?: number } = {}) {
  const chamadas: string[] = [];
  const patches: Record<string, unknown>[] = [];
  let restoUpload = falhas.upload ?? 0;
  let restoPatch = falhas.patch ?? 0;
  const deps: DependenciasEnvio = {
    async subirComprovante() { chamadas.push("upload"); if (restoUpload-- > 0) throw new Error("rede"); },
    async atualizarDespesa(payload) { chamadas.push("patch"); if (restoPatch-- > 0) throw new Error("rede"); patches.push(payload); }
  };
  return { deps, chamadas, patches };
}

test("envio com foto e texto: sobe o comprovante antes do PATCH, uma vez cada", async () => {
  const { deps, chamadas, patches } = dependencias();
  const progresso: ProgressoEnvio = { anexado: false };
  await enviarDevolucao({ explicacao: "O posto errou o valor do cupom.", foto: FOTO, progresso }, deps);
  assert.deepEqual(chamadas, ["upload", "patch"]);
  assert.equal(patches[0].new_justificativamotorista, "O posto errou o valor do cupom.");
  assert.equal(progresso.anexado, true);
});

test("envio só com texto não sobe anexo e ainda manda o PATCH (nova análise da IA)", async () => {
  const { deps, chamadas, patches } = dependencias();
  await enviarDevolucao({ explicacao: "O posto errou o valor do cupom.", foto: null, progresso: { anexado: false } }, deps);
  assert.deepEqual(chamadas, ["patch"]);
  assert.equal(patches[0].cr40f_statusanexo, ANEXO_COMPLETO);
});

test("falha de rede no PATCH propaga, mantém o texto e a nova tentativa não reenvia o anexo", async () => {
  const { deps, chamadas, patches } = dependencias({ patch: 1 });
  const progresso: ProgressoEnvio = { anexado: false };
  const entrada = { explicacao: "O posto errou o valor do cupom.", foto: FOTO, progresso };
  await assert.rejects(enviarDevolucao(entrada, deps), /rede/);
  assert.equal(progresso.anexado, true, "anexo já subiu e fica marcado");
  assert.equal(entrada.explicacao, "O posto errou o valor do cupom.", "o texto segue intacto");
  assert.equal(patches.length, 0);
  await enviarDevolucao(entrada, deps);
  assert.deepEqual(chamadas, ["upload", "patch", "patch"]);
  assert.equal(patches.length, 1);
});

test("falha no upload não dispara o PATCH e a nova tentativa sobe de novo", async () => {
  const { deps, chamadas } = dependencias({ upload: 1 });
  const progresso: ProgressoEnvio = { anexado: false };
  const entrada = { explicacao: "", foto: FOTO, progresso };
  await assert.rejects(enviarDevolucao(entrada, deps), /rede/);
  assert.equal(progresso.anexado, false);
  assert.deepEqual(chamadas, ["upload"]);
  await enviarDevolucao(entrada, deps);
  assert.deepEqual(chamadas, ["upload", "upload", "patch"]);
});

test("o texto digitado fica guardado no aparelho e some depois do envio", () => {
  const memoria = new Map<string, string>();
  const armazenamento = { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v), removeItem: (k: string) => void memoria.delete(k) };
  assert.equal(lerRascunho("abc", armazenamento), "");
  guardarRascunho("abc", "Explicação em andamento", armazenamento);
  assert.equal(lerRascunho("abc", armazenamento), "Explicação em andamento");
  assert.equal(lerRascunho("outra", armazenamento), "");
  guardarRascunho("abc", "", armazenamento);
  assert.equal(lerRascunho("abc", armazenamento), "");
  const quebrado = { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); }, removeItem() { throw new Error("bloqueado"); } };
  assert.equal(lerRascunho("abc", quebrado), "");
  assert.doesNotThrow(() => guardarRascunho("abc", "texto", quebrado));
  assert.equal(lerRascunho("abc", null), "");
});
