import { useEffect } from "react";
import { useHardwareBackGuard } from "./backGuard";
import { buildHashRoute } from "./navigation";
import { isStandaloneWebResourceRuntime } from "../data/dataverse/cliente";
import type { DetailData, Screen } from "../types";

type Options = {
  hashRoutingActive: boolean;
  previousScreenRef: React.MutableRefObject<Screen>;
  receiptDetail: DetailData | undefined;
  screen: Screen;
  selectedDetail: DetailData | null;
};

// Navegação: lembra a tela anterior (animação), segura o Voltar do celular na URL direta e mantém o hash da URL em dia em localhost.
export function useNavegacao({ hashRoutingActive, previousScreenRef, receiptDetail, screen, selectedDetail }: Options) {
  useEffect(() => {
    previousScreenRef.current = screen;
  }, [screen]);

  // Na URL direta do web resource o gesto Voltar do celular sairia do app.
  useHardwareBackGuard(screen, hashRoutingActive || isStandaloneWebResourceRuntime());

  useEffect(() => {
    if (!hashRoutingActive) return;
    const hashDetail = screen ==="reciboPersonalizado" ? receiptDetail : selectedDetail;
    const nextHash = buildHashRoute(screen, hashDetail ? { id: hashDetail.id, type: hashDetail.type } : null);
    if (window.location.hash === nextHash) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${nextHash}`);
  }, [hashRoutingActive, receiptDetail, screen, selectedDetail]);

}
