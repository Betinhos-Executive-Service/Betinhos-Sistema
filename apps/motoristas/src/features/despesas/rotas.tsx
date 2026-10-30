import type { MaintenanceRequestVehicleOption } from "../manutencao/remoto";
import { expenseFlowView } from "./receiptQuickRead";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { ExpenseScreen } from "./ExpenseScreen";
import { MediaCaptureScreen } from "../fotos/MediaCaptureScreen";
import { ReceiptReadingScreen } from "./ReceiptReadingScreen";
import { ReceiptIllegibleScreen } from "./ReceiptIllegibleScreen";
import { MaintenancePhotoPreviewScreen } from "../fotos/MaintenancePhotoPreviewScreen";
import type { Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import type { ReactNode } from "react";
import type { useExpenseFlow } from "./useExpenseFlow";

type Props = ReturnType<typeof useExpenseFlow> & {
  maintenanceCurrentVehicleId: string;
  maintenanceVehicles: MaintenanceRequestVehicleOption[];
  maintenanceVehiclesLoading: boolean;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Telas de "Registrar gasto": câmera e prévia do comprovante, leitura rápida, ilegível e formulário.
export function rotasDespesas(screen: Screen, {
  cancelExpenseQuickRead,
  clearExpensePhotoDraftState,
  confirmExpensePhoto,
  deleteExpensePhoto,
  expenseDateTouchedRef,
  expenseDraft,
  expensePhotoDraft,
  expensePhotoIsVideo,
  expensePhotoPreviewUrl,
  expensePhotos,
  expensePreviewPhotoId,
  expenseQuickRead,
  expenseQuickReadFilled,
  expenseQuickReadFilling,
  expenseQuickReadPhoto,
  expenseReferenceData,
  expenseReferenceError,
  expenseReferenceLoading,
  expenseSend,
  expenseUploadMode,
  expenseUploadReady,
  expenseUploadStatuses,
  handleExpenseUploadAction,
  maintenanceCurrentVehicleId,
  maintenanceVehicles,
  maintenanceVehiclesLoading,
  openExpenseCamera,
  openExpensePreview,
  openExpenseVideoPreview,
  remoteMode,
  remoteOperation,
  retakeQuickReadPhoto,
  setExpenseDraft,
  setExpensePhotoDraft,
  setExpensePhotoDurationLabel,
  setExpensePhotoIsVideo,
  setExpensePhotoPosterUrl,
  setExpensePhotoPreviewUrl,
  setExpensePhotoRawBlob,
  setExpensePreviewPhotoId,
  setScreen,
  setToast,
  submitExpense
}: Props): ReactNode | null {
  if (screen === "fotoGasto") {
    return (
      <MediaCaptureScreen
        kind="NOTAFISCAL"
        title="Comprovante"
        onBack={() => setScreen("gastos")}
        onCapture={(photoDataUrl) => {
          setExpensePhotoDraft(photoDataUrl);
          setExpensePhotoPreviewUrl("");
          setExpensePhotoPosterUrl("");
          setExpensePhotoDurationLabel("");
          setExpensePhotoRawBlob(null);
          setExpensePhotoIsVideo(false);
          setExpensePreviewPhotoId("");
          setScreen("previewFotoGasto");
        }}
        onCaptureVideo={openExpenseVideoPreview}
        onSwitchCamera={() => setToast("Câmera alternada localmente.")}
      />
    );
  }

  if (screen === "previewFotoGasto") {
    return (
      <MaintenancePhotoPreviewScreen
        kind="NOTAFISCAL"
        title="Comprovante"
        prompt={expensePhotoIsVideo ? "O vídeo está correto?" : "O comprovante está inteiro e legível?"}
        photoDataUrl={expensePhotoDraft}
        isVideo={expensePhotoIsVideo}
        videoPreviewUrl={expensePhotoPreviewUrl}
        onBack={() => {
          clearExpensePhotoDraftState();
          setExpensePreviewPhotoId("");
          setScreen("gastos");
        }}
        onRetake={openExpenseCamera}
        onDelete={expensePreviewPhotoId ? deleteExpensePhoto : undefined}
        onConfirm={confirmExpensePhoto}
        confirmLabel={expensePreviewPhotoId ? "Voltar" : expensePhotoIsVideo ? "Confirmar" : "Usar esta foto"}
        retakeLabel={expensePhotoIsVideo ? undefined : "Tirar outra"}
        deleteOnly={Boolean(expensePreviewPhotoId)}
      />
    );
  }

  if (screen === "gastos" && expenseFlowView(expenseQuickRead) === "leitura") {
    return (
      <ReceiptReadingScreen photoDataUrl={expenseQuickReadPhoto} filling={expenseQuickReadFilling} onCancel={cancelExpenseQuickRead} />
    );
  }

  if (screen === "gastos" && expenseFlowView(expenseQuickRead) === "ilegivel") {
    return (
      <ReceiptIllegibleScreen photoDataUrl={expenseQuickReadPhoto} onRetake={retakeQuickReadPhoto} onBack={cancelExpenseQuickRead} />
    );
  }

  if (screen === "gastos") {
    return (
      <ExpenseScreen
        uploads={expenseUploadStatuses.map(({ submission, status }) => ({ id: submission.expenseId, draft: submission.draft, status }))}
        onUploadAction={handleExpenseUploadAction}
        submitDisabled={remoteMode && (expenseUploadMode === "pending" || (expenseUploadMode === "async" && !expenseUploadReady))}
        draft={expenseDraft}
        photos={expensePhotos}
        referenceData={expenseReferenceData}
        referenceLoading={expenseReferenceLoading}
        referenceError={!remoteMode ? "Visualização local. Para gravar, abra o app publicado no Model-driven." : expenseReferenceError}
        onDraftChange={(draft) => {
          if (draft.dataGasto !== expenseDraft.dataGasto) expenseDateTouchedRef.current = true;
          setExpenseDraft(draft);
        }}
        onAddPhoto={openExpenseCamera}
        onPreviewPhoto={openExpensePreview}
        onBack={() => setScreen("inicio")}
        onSubmit={submitExpense}
        submitState={expenseSend && expenseSend.phase !== "error" ? "loading" : remoteOperation?.phase ?? "idle"}
        vehicles={maintenanceVehicles}
        vehiclesLoading={maintenanceVehiclesLoading}
        currentVehicleId={maintenanceCurrentVehicleId}
        quickRead={expenseQuickRead}
        quickReadFilled={expenseQuickReadFilled}
      />
    );
  }
  return null;
}
