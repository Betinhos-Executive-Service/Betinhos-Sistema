import { useState } from "react";
import { isTrueLike } from "../../shared/isTrueLike";
import type { DriverContext } from "../../lib/dataverse";
import type { ToastTone } from "../../components/common/LocalToast";
import type { DetailData, Screen } from "../../types";
import type { ReceiptEntrySource } from "./origem";

type Options = {
  driverContext: DriverContext | null;
  inicial: ReceiptEntrySource;
  isLocalhostRuntime: boolean;
  selectedDetail: DetailData | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Recibo personalizado: permissão do motorista, origem (Home ou serviço) e abertura da tela.
export function useReciboPersonalizado({ driverContext, inicial, isLocalhostRuntime, selectedDetail, setScreen, setToast }: Options) {
  const [receiptEntrySource, setReceiptEntrySource] = useState<ReceiptEntrySource>(() => inicial);
  const receiptDetail = receiptEntrySource === "service" ? selectedDetail ?? undefined : undefined;
  const canGeneratePersonalReceipt =
    isTrueLike(driverContext?.funcionario?.cr40f_gerarrecibopersonalizado) ||
    isLocalhostRuntime;

  const openPersonalReceipt = () => {
    if (!selectedDetail) return;
    setReceiptEntrySource("service");
    setScreen("reciboPersonalizado");
  };

  const openPersonalReceiptFromHome = () => {
    if (!canGeneratePersonalReceipt) {
      setToast("Você não tem permissão para gerar recibo personalizado.");
      return;
    }
    setReceiptEntrySource("home");
    setScreen("reciboPersonalizado");
  };

  return { canGeneratePersonalReceipt, openPersonalReceipt, openPersonalReceiptFromHome, receiptDetail, receiptEntrySource, setReceiptEntrySource };
}
