import assert from "node:assert/strict";
import test from "node:test";
import { FEATURES, featuresDoModo, telasDoModo } from "../src/app/features.ts";
import { detectarModo } from "../src/app/modo.ts";
import * as checklists from "../src/features/checklist/checklists.ts";
import * as comunicados from "../src/features/comunicados/comunicados.ts";
import * as agenda from "../src/features/servicos/agendaRemota.ts";
import * as checklistRemoto from "../src/features/checklist/remoto.ts";
import * as finalizar from "../src/features/finalizar/remoto.ts";
import * as voucher from "../src/features/voucher/remoto.ts";
import * as recibo from "../src/features/recibo/remoto.ts";
import * as ideias from "../src/features/ideias/remoto.ts";
import { adaptadorDataverse } from "../src/data/dataverse/adaptador.ts";

test("adaptador Dataverse delega cada operacao para a funcao atual, sem embrulho", () => {
  assert.deepEqual(adaptadorDataverse, {
    carregarAgenda: agenda.loadRemoteStore,
    carregarDetalhe: agenda.loadRemoteDetailByParams,
    marcarVisto: agenda.markDetailViewedRemote,
    carregarChecklists: checklists.loadDriverChecklists,
    carregarChecklist: checklists.loadDriverChecklist,
    acaoChecklist: checklists.executeChecklistAction,
    concluirChecklist: checklists.concluirChecklist,
    enviarFotoChecklist: checklistRemoto.uploadChecklistPhotoRemote,
    salvarObservacao: finalizar.saveServiceObservationRemote,
    finalizarServico: finalizar.finalizeServiceRemote,
    salvarVoucher: voucher.saveVoucherRemote,
    salvarRascunhoVoucher: voucher.saveVoucherDraftRemote,
    criarRecibo: recibo.createReceiptRecordRemote,
    enviarPdfRecibo: recibo.uploadReceiptPdfRemote,
    enviarEmailRecibo: recibo.sendReceiptEmailRemote,
    carregarComunicados: comunicados.loadDriverComunicados,
    carregarComunicado: comunicados.loadDriverComunicado,
    acaoComunicado: comunicados.executeComunicadoAction,
    carregarIdeias: ideias.loadMyIdeasRemote,
    criarIdeia: ideias.createIdeaRemote
  });
});

test("web resource continua no modo motorista com todas as features", () => {
  assert.equal(detectarModo(), "motorista");
  assert.equal(featuresDoModo("motorista"), FEATURES);
});

test("modo link libera so as features combinadas com o Renan", () => {
  assert.deepEqual(featuresDoModo("link").map((feature) => feature.id), [
    "servicos", "detalhe", "fotos", "checklist", "finalizar", "voucher", "recibo", "comunicados", "ideias"
  ]);
  const telas = telasDoModo("link");
  for (const bloqueada of ["receber", "cobrancaQr", "gastos", "colisoes", "multas", "historico", "meuCarro", "solicitarManutencao"] as const) {
    assert.equal(telas.has(bloqueada), false, bloqueada);
  }
});

test("cada tela pertence a uma unica feature", () => {
  const telas = FEATURES.flatMap((feature) => feature.telas);
  assert.equal(new Set(telas).size, telas.length);
});
