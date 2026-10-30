import type * as checklists from "../features/checklist/checklists";
import type * as comunicados from "../features/comunicados/comunicados";
import type * as agenda from "../features/servicos/agendaRemota";
import type * as checklistRemoto from "../features/checklist/remoto";
import type * as finalizar from "../features/finalizar/remoto";
import type * as voucher from "../features/voucher/remoto";
import type * as recibo from "../features/recibo/remoto";
import type * as ideias from "../features/ideias/remoto";

// Contrato de dados do app: as operações que as telas podem pedir, com nome de negócio.
// Hoje só o adaptador Dataverse implementa (motoristas e terceiros fixos no web resource).
// O adaptador do Worker (parceiro esporádico via link) implementará o mesmo contrato e
// validará o token a cada operação. Por isso a porta lista operações, não consultas OData livres.
// Cobre só o que o modo link usa; o resto do app fala direto com o Dataverse.
// As assinaturas vêm das funções atuais para o contrato não divergir delas.
export type PortaDados = {
  carregarAgenda: typeof agenda.loadRemoteStore;
  carregarDetalhe: typeof agenda.loadRemoteDetailByParams;
  marcarVisto: typeof agenda.markDetailViewedRemote;
  carregarChecklists: typeof checklists.loadDriverChecklists;
  carregarChecklist: typeof checklists.loadDriverChecklist;
  acaoChecklist: typeof checklists.executeChecklistAction;
  concluirChecklist: typeof checklists.concluirChecklist;
  enviarFotoChecklist: typeof checklistRemoto.uploadChecklistPhotoRemote;
  salvarObservacao: typeof finalizar.saveServiceObservationRemote;
  finalizarServico: typeof finalizar.finalizeServiceRemote;
  salvarVoucher: typeof voucher.saveVoucherRemote;
  salvarRascunhoVoucher: typeof voucher.saveVoucherDraftRemote;
  criarRecibo: typeof recibo.createReceiptRecordRemote;
  enviarPdfRecibo: typeof recibo.uploadReceiptPdfRemote;
  enviarEmailRecibo: typeof recibo.sendReceiptEmailRemote;
  carregarComunicados: typeof comunicados.loadDriverComunicados;
  carregarComunicado: typeof comunicados.loadDriverComunicado;
  acaoComunicado: typeof comunicados.executeComunicadoAction;
  carregarIdeias: typeof ideias.loadMyIdeasRemote;
  criarIdeia: typeof ideias.createIdeaRemote;
};
