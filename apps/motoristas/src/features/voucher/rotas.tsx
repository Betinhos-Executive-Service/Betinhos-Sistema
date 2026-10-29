import type { ExpensePhoto } from "../despesas/expenses.types";
import { getVoucherDraftKey } from "../../app/bootstrap";
import { getServiceTaskBackScreen } from "../../app/detailFlow";
import { saveSignatureLocally, type LocalStore } from "../../lib/localWorkflow";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { ReceiveScreen } from "../recebimento/ReceiveScreen";
import { SignatureScreen } from "./SignatureScreen";
import { VoucherScreen } from "./VoucherScreen";
import type { DetailData, Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import type { ReactNode } from "react";

type Props = {
  canGeneratePersonalReceipt: boolean;
  continueAfterReceive: () => Promise<void>;
  finalizeSelected: (fields: Record<string, string>) => Promise<void>;
  getQrChargeProps: (detail: DetailData) => { qrCharge: { receivableCents: number; paidCents: number; paidByName: string; balanceCents: number; loading: boolean; failed: boolean; resumable: boolean; onOpen: (() => void) | undefined; }; proofWaived: boolean; checkProof: ((photo: ExpensePhoto) => Promise<number | null>) | undefined; };
  openPersonalReceipt: () => void;
  openReceiveCamera: () => void;
  openReceivePreview: (photoId: string) => void;
  receiveProofs: Record<string, ExpensePhoto[]>;
  receiveStepPending: (detail: DetailData) => boolean;
  remoteOperation: RemoteOperation | null;
  saveVoucherDraft: (fields: Record<string, string>) => void;
  selectedDetail: DetailData | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setStore: React.Dispatch<React.SetStateAction<LocalStore>>;
  setToast: (message: string, tone?: ToastTone) => void;
  store: LocalStore;
  voucherDrafts: Record<string, Record<string, string>>;
};

// Telas do voucher: formulário e assinatura do passageiro.
export function rotasVoucher(screen: Screen, {
  canGeneratePersonalReceipt,
  continueAfterReceive,
  finalizeSelected,
  getQrChargeProps,
  openPersonalReceipt,
  openReceiveCamera,
  openReceivePreview,
  receiveProofs,
  receiveStepPending,
  remoteOperation,
  saveVoucherDraft,
  selectedDetail,
  setScreen,
  setStore,
  setToast,
  store,
  voucherDrafts
}: Props): ReactNode | null {
  if (screen === "assinatura" && selectedDetail) {
    return (
      <SignatureScreen
        detail={selectedDetail}
        onBack={() => setScreen("voucher")}
        onConfirm={(signatureDataUrl) => {
          if (signatureDataUrl) {
            setStore((current) => saveSignatureLocally(current, selectedDetail.id, signatureDataUrl));
            setToast("Assinatura salva localmente.");
          }
          setScreen("voucher");
        }}
      />
    );
  }

  if (screen === "voucher" && selectedDetail) {
    if (receiveStepPending(selectedDetail)) {
      return (
        <ReceiveScreen
          detail={selectedDetail}
          photos={receiveProofs[selectedDetail.id] ?? []}
          onAddPhoto={openReceiveCamera}
          onPreviewPhoto={openReceivePreview}
          onBack={() => setScreen("detalhes")}
          onContinue={continueAfterReceive}
          onGeneratePersonalReceipt={openPersonalReceipt}
          canGeneratePersonalReceipt={canGeneratePersonalReceipt}
          submitState={remoteOperation?.phase ?? "idle"}
          {...getQrChargeProps(selectedDetail)}
        />
      );
    }
    return (
      <VoucherScreen
        detail={selectedDetail}
        hasSignature={Boolean(store.signatures[selectedDetail.id])}
        initialDraft={voucherDrafts[getVoucherDraftKey(selectedDetail)]}
        onBack={() => setScreen(getServiceTaskBackScreen(selectedDetail))}
        onOpenSignature={() => setScreen("assinatura")}
        onFinalize={finalizeSelected}
        onDraftChange={saveVoucherDraft}
        submitState={remoteOperation?.phase ?? "idle"}
      />
    );
  }
  return null;
}
