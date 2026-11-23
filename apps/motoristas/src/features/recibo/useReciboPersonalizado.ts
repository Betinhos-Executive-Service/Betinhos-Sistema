import { useState } from "react";
import { useConfigApp } from "../../app/configApp";
import type { ToastTone } from "../../shared/ui/LocalToast";
import type { DetailData, Screen } from "../../types";
import type { ReceiptEntrySource } from "./origem";

type Options = {
  inicial: ReceiptEntrySource;
  selectedDetail: DetailData | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Recibo personalizado: permissão do motorista, origem (Home ou serviço) e abertura da tela.
export function useReciboPersonalizado({ inicial, selectedDetail, setScreen, setToast }: Options) {
  const [receiptEntrySource, setReceiptEntrySource] = useState<ReceiptEntrySource>(() => inicial);
  const receiptDetail = receiptEntrySource === "service" ? selectedDetail ?? undefined : undefined;
  // Vem da configuração do App por perfil (chave services.personalReceipt), não mais da coluna do funcionário.
  const canGeneratePersonalReceipt = useConfigApp().ligado("services.personalReceipt");

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
