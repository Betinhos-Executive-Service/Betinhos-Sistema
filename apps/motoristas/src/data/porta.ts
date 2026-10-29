import type * as checklists from "../features/checklist/checklists";
import type * as comunicados from "../features/comunicados/comunicados";
import type * as dataverse from "../lib/dataverse";
import type * as ideias from "../features/ideias/remoto";

// Contrato de dados do app: as operações que as telas podem pedir, com nome de negócio.
// Hoje só o adaptador Dataverse implementa (motoristas e terceiros fixos no web resource).
// O adaptador do Worker (parceiro esporádico via link) implementará o mesmo contrato e
// validará o token a cada operação. Por isso a porta lista operações, não consultas OData livres.
// Cobre só o que o modo link usa; o resto do app fala direto com o Dataverse.
// As assinaturas vêm das funções atuais para o contrato não divergir delas.
export type PortaDados = {
  carregarAgenda: typeof dataverse.loadRemoteStore;
  carregarDetalhe: typeof dataverse.loadRemoteDetailByParams;
  marcarVisto: typeof dataverse.markDetailViewedRemote;
  carregarChecklists: typeof checklists.loadDriverChecklists;
  carregarChecklist: typeof checklists.loadDriverChecklist;
  acaoChecklist: typeof checklists.executeChecklistAction;
  concluirChecklist: typeof checklists.concluirChecklist;
  enviarFotoChecklist: typeof dataverse.uploadChecklistPhotoRemote;
  salvarObservacao: typeof dataverse.saveServiceObservationRemote;
  finalizarServico: typeof dataverse.finalizeServiceRemote;
  salvarVoucher: typeof dataverse.saveVoucherRemote;
  salvarRascunhoVoucher: typeof dataverse.saveVoucherDraftRemote;
  criarRecibo: typeof dataverse.createReceiptRecordRemote;
  enviarPdfRecibo: typeof dataverse.uploadReceiptPdfRemote;
  enviarEmailRecibo: typeof dataverse.sendReceiptEmailRemote;
  carregarComunicados: typeof comunicados.loadDriverComunicados;
  carregarComunicado: typeof comunicados.loadDriverComunicado;
  acaoComunicado: typeof comunicados.executeComunicadoAction;
  carregarIdeias: typeof ideias.loadMyIdeasRemote;
  criarIdeia: typeof ideias.createIdeaRemote;
};
