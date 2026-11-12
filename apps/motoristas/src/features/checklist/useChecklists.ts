import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { getInitialChecklistId } from "../../app/bootstrap";
import type { PortaDados } from "../../data/porta";
import { hasDataverseRuntime } from "../../data/dataverse/cliente";
import { reportAppError } from "../../shared/appErrorLogger";
import type { Screen } from "../../types";
import type { ChecklistsLoadStatus } from "./ChecklistsScreen";
import { isMockChecklists, type ChecklistVeiculo } from "./checklists";

type Options = {
  dados: PortaDados;
  // Motorista logado (o mesmo dos comunicados).
  driverIdRef: MutableRefObject<string>;
  previewMode: boolean;
  setScreen: (screen: Screen) => void;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Lista de checklists do motorista, seleção, origem da navegação e deep link do push.
export function useChecklists({ dados, driverIdRef, previewMode, setScreen, setToast }: Options) {
  const [checklists, setChecklists] = useState<ChecklistVeiculo[]>([]);
  const [checklistsStatus, setChecklistsStatus] = useState<ChecklistsLoadStatus>(() => isMockChecklists() || hasDataverseRuntime() ? "loading" : "ready");
  const [selectedChecklistId, setSelectedChecklistId] = useState("");
  const [checklistOrigin, setChecklistOrigin] = useState<"servicos" | "">("");
  const pendingChecklistDeepLinkRef = useRef(getInitialChecklistId());

  const reloadChecklists = useCallback(async () => {
    try {
      setChecklists(await dados.carregarChecklists(driverIdRef.current));
      setChecklistsStatus("ready");
    } catch (error) {
      setChecklistsStatus((current) => current === "ready" ? current : "error");
      throw error;
    }
  }, []);

  // Deep link do push de checklist: abre o checklist apontado sem esperar a agenda.
  useEffect(() => {
    const deepLinkId = pendingChecklistDeepLinkRef.current;
    if (!deepLinkId || previewMode) return;
    if (!hasDataverseRuntime() && !isMockChecklists()) return;
    let alive = true;
    dados.carregarChecklist(deepLinkId)
      .then((item) => {
        if (!alive || pendingChecklistDeepLinkRef.current !== deepLinkId) return;
        pendingChecklistDeepLinkRef.current = "";
        if (!item) {
          setScreen("checklists");
          setToast("Este checklist não está mais com você.", "warning");
          return;
        }
        setChecklists((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]);
        setSelectedChecklistId(item.id);
        setScreen("checklists");
      })
      .catch((error) => {
        reportAppError(error, { severity: "warning", source: "app", action: "loadDriverChecklist", phase: "deep-link" });
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isMockChecklists()) return;
    reloadChecklists().catch((error) => {
      reportAppError(error, { severity: "warning", source: "app", action: "loadMockChecklists" });
    });
  }, []);

  return { checklists, checklistsStatus, selectedChecklistId, setSelectedChecklistId, checklistOrigin, setChecklistOrigin, reloadChecklists };
}
