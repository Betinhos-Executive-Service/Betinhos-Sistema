import { useEffect } from "react";
import { reportAppError } from "../../shared/appErrorLogger";
import { isMockComunicados } from "./comunicados";
import type { ToastTone } from "../../shared/ui/LocalToast";
import type { Screen } from "../../types";
import type { useComunicados } from "./useComunicados";

type Options = {
  comunicadosLista: ReturnType<typeof useComunicados>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Deep link de comunicado já carregado na lista abre a tela; no mock de comunicados a lista carrega na abertura.
export function useComunicadoDeepLink({ comunicadosLista, setScreen, setToast }: Options) {
  const { comunicados, comunicadosStatus, pendingComunicadoDeepLinkRef, reloadComunicados, setSelectedComunicadoId } = comunicadosLista;

  useEffect(() => {
    const deepLinkId = pendingComunicadoDeepLinkRef.current;
    if (!deepLinkId || comunicadosStatus !== "ready") return;
    pendingComunicadoDeepLinkRef.current = "";
    if (!comunicados.some((item) => item.id.toLowerCase() === deepLinkId)) return;
    setSelectedComunicadoId(comunicados.find((item) => item.id.toLowerCase() === deepLinkId)?.id ?? "");
    setScreen("comunicados");
  }, [comunicados, comunicadosStatus]);

  useEffect(() => {
    if (!isMockComunicados()) return;
    reloadComunicados().catch((error) => {
      reportAppError(error, { severity: "warning", source: "app", action: "loadMockComunicados" });
      setToast("Não foi possível carregar os comunicados de teste. Confira o painel de comunicados indicado em ?mockApiPort=.", "warning");
    });
  }, []);
}
