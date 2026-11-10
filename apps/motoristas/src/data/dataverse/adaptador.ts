import { concluirChecklist, executeChecklistAction, loadDriverChecklist, loadDriverChecklists } from "../../features/checklist/checklists.ts";
import { executeComunicadoAction, loadDriverComunicado, loadDriverComunicados } from "../../features/comunicados/comunicados.ts";
import { createReceiptRecordRemote, sendReceiptEmailRemote, uploadReceiptPdfRemote } from "../../features/recibo/remoto.ts";
import { finalizeServiceRemote, saveServiceObservationRemote } from "../../features/finalizar/remoto.ts";
import { loadRemoteDetailByParams, loadRemoteStore, markDetailViewedRemote } from "../../features/servicos/agendaRemota.ts";
import { saveVoucherDraftRemote, saveVoucherRemote } from "../../features/voucher/remoto.ts";
import { uploadChecklistPhotoRemote } from "../../features/checklist/remoto.ts";
import { createIdeaRemote, loadMyIdeasRemote } from "../../features/ideias/remoto.ts";
import type { PortaDados } from "../porta.ts";

// Adaptador do web resource (Xrm.WebApi, URL direta ou mock em localhost).
// Por enquanto só delega para o código atual; as funções migram para cá aos poucos.
export const adaptadorDataverse: PortaDados = {
  carregarAgenda: loadRemoteStore,
  carregarDetalhe: loadRemoteDetailByParams,
  marcarVisto: markDetailViewedRemote,
  carregarChecklists: loadDriverChecklists,
  carregarChecklist: loadDriverChecklist,
  acaoChecklist: executeChecklistAction,
  concluirChecklist,
  enviarFotoChecklist: uploadChecklistPhotoRemote,
  salvarObservacao: saveServiceObservationRemote,
  finalizarServico: finalizeServiceRemote,
  salvarVoucher: saveVoucherRemote,
  salvarRascunhoVoucher: saveVoucherDraftRemote,
  criarRecibo: createReceiptRecordRemote,
  enviarPdfRecibo: uploadReceiptPdfRemote,
  enviarEmailRecibo: sendReceiptEmailRemote,
  carregarComunicados: loadDriverComunicados,
  carregarComunicado: loadDriverComunicado,
  acaoComunicado: executeComunicadoAction,
  carregarIdeias: loadMyIdeasRemote,
  criarIdeia: createIdeaRemote
};
