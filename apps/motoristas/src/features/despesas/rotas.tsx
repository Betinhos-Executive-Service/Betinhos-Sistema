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
import type { useGastosCartao } from "./useGastosCartao";
import { GastoCartaoDuplicadoDialog } from "./GastoCartaoDuplicadoDialog";
import { GastosCartaoScreen } from "./GastosCartaoScreen";
import { GastosRelatorioScreen } from "./GastosRelatorioScreen";
import { RankingPostosScreen } from "./RankingPostosScreen";
import { reportAppError } from "../../shared/appErrorLogger";

type Props = ReturnType<typeof useExpenseFlow> & ReturnType<typeof useGastosCartao> & {
  maintenanceCurrentVehicleId: string;
  maintenanceVehicles: MaintenanceRequestVehicleOption[];
  maintenanceVehiclesLoading: boolean;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Telas de gastos: relatório, gastos do cartão a completar, postos perto, e "Registrar gasto" (câmera e prévia do comprovante, leitura rápida, ilegível e formulário).
export function rotasDespesas(screen: Screen, {
  abrirGastoCartao,
  anexarDespesa,
  duplicidadeCartao,
  expenseDraftRef,
  gastoCartaoAtual,
  gastosCartaoPendentes,
  gastosCartaoStatus,
  isExpenseIdle,
  relatorioModelo,
  relatorioPeriodo,
  relatorioStatus,
  reloadGastosCartao,
  reloadRelatorio,
  sairGastoCartao,
  setDuplicidadeCartao,
  setRelatorioPeriodo,
  submitExpenseChecked,
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
        onBack={() => setScreen(!gastoCartaoAtual && isExpenseIdle() ? "gastosRelatorio" : "gastos")}
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
      <>
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
        onBack={() => {
          // Completando um gasto do cartão volta para a lista dele; gasto novo volta para o relatório.
          if (gastoCartaoAtual) sairGastoCartao();
          setScreen(gastoCartaoAtual ? "gastosCartao" : "gastosRelatorio");
        }}
        onSubmit={submitExpenseChecked}
        submitState={expenseSend && expenseSend.phase !== "error" ? "loading" : remoteOperation?.phase ?? "idle"}
        vehicles={maintenanceVehicles}
        vehiclesLoading={maintenanceVehiclesLoading}
        currentVehicleId={maintenanceCurrentVehicleId}
        quickRead={expenseQuickRead}
        quickReadFilled={expenseQuickReadFilled}
        cartaoGasto={gastoCartaoAtual ? { cartaoFinal: gastoCartaoAtual.cartaoFinal, estabelecimento: gastoCartaoAtual.estabelecimento } : undefined}
      />
      {duplicidadeCartao ? (
        <GastoCartaoDuplicadoDialog
          gasto={duplicidadeCartao}
          onComplete={() => abrirGastoCartao(duplicidadeCartao, true)}
          onLaunchAnyway={() => { setDuplicidadeCartao(null); void submitExpense(expenseDraftRef.current); }}
          onClose={() => setDuplicidadeCartao(null)}
        />
      ) : null}
      </>
    );
  }

  if (screen === "gastosCartao") {
    return (
      <GastosCartaoScreen
        items={gastosCartaoPendentes}
        loadStatus={gastosCartaoStatus}
        onBack={() => setScreen("gastosRelatorio")}
        onReload={() => { reloadGastosCartao().catch((error) => reportAppError(error, { severity: "warning", source: "app", action: "listarGastosCartao", notifyUser: false })); }}
        onOpen={(id) => {
          const gasto = gastosCartaoPendentes.find((item) => item.id === id);
          if (gasto) abrirGastoCartao(gasto);
        }}
      />
    );
  }

  if (screen === "gastosRelatorio") {
    return (
      <GastosRelatorioScreen
        modelo={relatorioModelo}
        periodoId={relatorioPeriodo}
        loadStatus={relatorioStatus}
        pendentesCartao={gastosCartaoPendentes.length}
        idsCompletar={new Set(gastosCartaoPendentes.map((gasto) => gasto.id))}
        onCompletarGasto={(id) => { const gasto = gastosCartaoPendentes.find((item) => item.id === id); if (gasto) abrirGastoCartao(gasto); }}
        onPeriodo={setRelatorioPeriodo}
        onBack={() => setScreen("inicio")}
        onReload={() => { void reloadRelatorio(); }}
        onCompletar={() => setScreen("gastosCartao")}
        onAttach={anexarDespesa}
        onPrecoPostos={() => setScreen("rankingPostos")}
      />
    );
  }

  if (screen === "rankingPostos") {
    return <RankingPostosScreen onBack={() => setScreen("gastosRelatorio")} />;
  }
  return null;
}
