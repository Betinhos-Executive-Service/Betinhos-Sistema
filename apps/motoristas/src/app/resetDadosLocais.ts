import { STORAGE_KEY, initialStore } from "./bootstrap";
import { clearAllChaptersSeen } from "./tour";
import { clearMediaDraft } from "../features/fotos/mediaDraftStore";
import { revokePhotoPreviewUrls } from "../features/fotos/envioMidia";
import { createEmptyCollisionDraft } from "../features/colisao/collisions";
import {
  FINALIZE_DRAFT_ASSETS_STORAGE_KEY,
  SERVICE_OBSERVATION_DRAFTS_KEY,
  VOUCHER_DRAFTS_STORAGE_KEY
} from "../features/finalizar/rascunhos";
import { EMPTY_MAINTENANCE_REQUEST_DRAFT } from "../features/manutencao/rascunho";
import { EMPTY_EXPENSE_DRAFT } from "../features/despesas/rascunho";
import { EMPTY_MAINTENANCE_FINALIZE_DRAFT } from "../features/finalizar/rascunhoManutencao";
import type { LocalStore } from "../lib/localWorkflow";
import type { ToastTone } from "../shared/ui/LocalToast";
import type { RemoteOperation } from "../shared/ui/FlowProgressOverlay";
import type { ReceiptEntrySource } from "../features/recibo/origem";
import type { DetailData, Screen } from "../types";
import type { useCollisionFlow } from "../features/colisao/useCollisionFlow";
import type { useExpenseFlow } from "../features/despesas/useExpenseFlow";
import type { useFinalizeFlow } from "../features/finalizar/useFinalizeFlow";
import type { useMaintenanceFinalizePhoto } from "../features/finalizar/useMaintenanceFinalizePhoto";
import type { useMaintenanceRequestFlow } from "../features/manutencao/useMaintenanceRequestFlow";
import type { useReceiveFlow } from "../features/recebimento/useReceiveFlow";
import type { useFilaServicos } from "../features/servicos/useFilaServicos";

type Options = {
  colisao: ReturnType<typeof useCollisionFlow>;
  completingClearTimerRef: React.MutableRefObject<number | null>;
  despesas: ReturnType<typeof useExpenseFlow>;
  fila: ReturnType<typeof useFilaServicos>;
  finalizar: ReturnType<typeof useFinalizeFlow>;
  fotoManutencao: ReturnType<typeof useMaintenanceFinalizePhoto>;
  isLocalhostRuntime: boolean;
  manutencao: ReturnType<typeof useMaintenanceRequestFlow>;
  recebimento: ReturnType<typeof useReceiveFlow>;
  remoteMode: boolean;
  setCompletingDetailKey: React.Dispatch<React.SetStateAction<string>>;
  setCriticalError: (message: string) => void;
  setReceiptEntrySource: React.Dispatch<React.SetStateAction<ReceiptEntrySource>>;
  setRemoteOperation: React.Dispatch<React.SetStateAction<RemoteOperation | null>>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setSelectedDetail: React.Dispatch<React.SetStateAction<DetailData | null>>;
  setStore: React.Dispatch<React.SetStateAction<LocalStore>>;
  setToast: (message: string, tone?: ToastTone) => void;
  tourDriverId: string;
};

// Botão "Resetar dados locais" (só localhost no mock): para timers, solta as prévias e apaga agenda, rascunhos e anexos do navegador.
export function resetDadosLocais({
  colisao,
  completingClearTimerRef,
  despesas,
  fila,
  finalizar,
  fotoManutencao,
  isLocalhostRuntime,
  manutencao,
  recebimento,
  remoteMode,
  setCompletingDetailKey,
  setCriticalError,
  setReceiptEntrySource,
  setRemoteOperation,
  setScreen,
  setSelectedDetail,
  setStore,
  setToast,
  tourDriverId
}: Options) {
  if (remoteMode || !isLocalhostRuntime) return;
  const confirmed = window.confirm("Resetar dados locais, rascunhos e anexos salvos neste navegador?");
  if (!confirmed) return;

  if (finalizar.voucherDraftTimerRef.current) {
    window.clearTimeout(finalizar.voucherDraftTimerRef.current);
    finalizar.voucherDraftTimerRef.current = null;
  }
  if (finalizar.finalizeTimerRef.current) {
    window.clearTimeout(finalizar.finalizeTimerRef.current);
    finalizar.finalizeTimerRef.current = null;
  }
  if (completingClearTimerRef.current) {
    window.clearTimeout(completingClearTimerRef.current);
    completingClearTimerRef.current = null;
  }
  if (fila.queueHighlightTimerRef.current) {
    window.clearTimeout(fila.queueHighlightTimerRef.current);
    fila.queueHighlightTimerRef.current = null;
  }

  revokePhotoPreviewUrls(despesas.expensePhotos);
  Object.values(recebimento.receiveProofs).forEach((photos) => revokePhotoPreviewUrls(photos));
  revokePhotoPreviewUrls(colisao.collisionPhotos);
  revokePhotoPreviewUrls(manutencao.maintenanceRequestPhotos);
  fotoManutencao.clearMaintenanceFinalizePhotoDraft();
  manutencao.clearMaintenanceRequestPhotoDraftState();
  despesas.clearExpensePhotoDraftState();
  recebimento.clearReceivePhotoDraftState();
  colisao.clearCollisionPhotoDraftState();

  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(VOUCHER_DRAFTS_STORAGE_KEY);
  localStorage.removeItem(FINALIZE_DRAFT_ASSETS_STORAGE_KEY);
  localStorage.removeItem(SERVICE_OBSERVATION_DRAFTS_KEY);
  if (tourDriverId) clearAllChaptersSeen(localStorage, tourDriverId);
  void clearMediaDraft();

  setStore(initialStore());
  setSelectedDetail(null);
  setScreen("inicio");
  setReceiptEntrySource("home");
  finalizar.setVoucherDrafts({});
  finalizar.setServiceObservationDrafts({});
  recebimento.setReceiveProofs({});
  recebimento.setReceiveUploadedCounts({});
  despesas.setExpensePhotos([]);
  despesas.setExpensePreviewPhotoId("");
  colisao.setCollisionDraft(createEmptyCollisionDraft());
  colisao.setCollisionPhotos([]);
  colisao.setCollisionPreviewPhotoId("");
  manutencao.setMaintenanceRequestPhotos([]);
  manutencao.setMaintenanceRequestPreviewPhotoId("");
  fotoManutencao.setMaintenanceExistingPreview(false);
  manutencao.setMaintenanceRequestDraft({ ...EMPTY_MAINTENANCE_REQUEST_DRAFT });
  despesas.setExpenseDraft({ ...EMPTY_EXPENSE_DRAFT });
  despesas.resetExpenseQuickRead();
  finalizar.setMaintenanceFinalizeDraft({ ...EMPTY_MAINTENANCE_FINALIZE_DRAFT });
  fotoManutencao.setPhotoDraft(null);
  fotoManutencao.setPhotoDraftPreviewUrl("");
  fotoManutencao.setPhotoDraftRawBlob(null);
  fotoManutencao.setPhotoDraftIsVideo(false);
  setRemoteOperation(null);
  setCriticalError("");
  setCompletingDetailKey("");
  fila.setQueueHighlightDetailKey("");
  setToast("Dados locais resetados.");
}
