import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { LoadingOverlayState } from "../../components/common/LoadingOverlay";
import { getInitialComunicadoId } from "../../app/bootstrap";
import type { PortaDados } from "../../data/porta";
import { hasDataverseRuntime } from "../../lib/dataverse";
import { reportAppError } from "../../lib/appErrorLogger";
import type { Screen } from "../../types";
import type { ComunicadosLoadStatus } from "./ComunicadosScreen";
import { isMockComunicados, type ComunicadoDestinatario } from "./comunicados";

type Options = {
  dados: PortaDados;
  // Guarda o motorista logado para recarregar sem depender do estado ainda não aplicado.
  driverIdRef: MutableRefObject<string>;
  previewMode: boolean;
  setScreen: (screen: Screen) => void;
  setDataLoadingState: (loading: LoadingOverlayState | null) => void;
};

// Comunicados do motorista, seleção, origem da navegação e deep link do push.
export function useComunicados({ dados, driverIdRef, previewMode, setScreen, setDataLoadingState }: Options) {
  const [comunicados, setComunicados] = useState<ComunicadoDestinatario[]>([]);
  const [comunicadosStatus, setComunicadosStatus] = useState<ComunicadosLoadStatus>(() => isMockComunicados() || hasDataverseRuntime() ? "loading" : "ready");
  const [selectedComunicadoId, setSelectedComunicadoId] = useState("");
  // Tela de origem ao abrir um comunicado direto (ex.: aba Serviços), para o Voltar retornar a ela.
  const [comunicadoOrigin, setComunicadoOrigin] = useState<"servicos" | "">("");
  const pendingComunicadoDeepLinkRef = useRef(getInitialComunicadoId());

  const reloadComunicados = useCallback(async () => {
    try {
      setComunicados(await dados.carregarComunicados(driverIdRef.current));
      setComunicadosStatus("ready");
    } catch (error) {
      // Mantém a lista já carregada; só exibe o estado de erro quando nunca houve carga.
      setComunicadosStatus((current) => current === "ready" ? current : "error");
      throw error;
    }
  }, []);

  // Deep link do push: busca só esse destinatário em paralelo com a agenda e abre o comunicado
  // assim que ele chega, sem esperar loadRemoteStore nem a lista completa. A lista completa, ao
  // chegar, substitui o item provisório; se esta busca falhar, o efeito abaixo segue como fallback.
  useEffect(() => {
    const deepLinkId = pendingComunicadoDeepLinkRef.current;
    if (!deepLinkId || previewMode) return;
    if (!hasDataverseRuntime() && !isMockComunicados()) return;
    let alive = true;
    dados.carregarComunicado(deepLinkId)
      .then((item) => {
        if (!alive || !item || pendingComunicadoDeepLinkRef.current !== deepLinkId) return;
        pendingComunicadoDeepLinkRef.current = "";
        setComunicados((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]);
        setSelectedComunicadoId(item.id);
        setScreen("comunicados");
        setDataLoadingState(null);
      })
      .catch((error) => {
        reportAppError(error, { severity: "warning", source: "app", action: "loadDriverComunicado", phase: "deep-link" });
      });
    return () => { alive = false; };
  }, []);

  return {
    comunicados,
    comunicadosStatus,
    selectedComunicadoId,
    setSelectedComunicadoId,
    comunicadoOrigin,
    setComunicadoOrigin,
    pendingComunicadoDeepLinkRef,
    reloadComunicados
  };
}
