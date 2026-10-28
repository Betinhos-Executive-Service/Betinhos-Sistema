import { concluirChecklist, executeChecklistAction, loadDriverChecklist, loadDriverChecklists } from "../../lib/checklists.ts";
import { executeComunicadoAction, loadDriverComunicado, loadDriverComunicados } from "../../lib/comunicados.ts";
import {
  createIdeaRemote,
  createReceiptRecordRemote,
  finalizeServiceRemote,
  loadMyIdeasRemote,
  loadRemoteDetailByParams,
  loadRemoteStore,
  markDetailViewedRemote,
  saveServiceObservationRemote,
  saveVoucherDraftRemote,
  saveVoucherRemote,
  sendReceiptEmailRemote,
  uploadChecklistPhotoRemote,
  uploadReceiptPdfRemote
} from "../../lib/dataverse.ts";
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
