import { ChecklistsScreen } from "./ChecklistsScreen";
import type { Screen } from "../../types";
import type { ReactNode } from "react";
import type { useChecklists } from "./useChecklists";

type Props = ReturnType<typeof useChecklists> & {
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Tela de checklists do veículo.
export function rotasChecklist(screen: Screen, {
  checklistOrigin,
  checklists,
  checklistsStatus,
  reloadChecklists,
  selectedChecklistId,
  setChecklistOrigin,
  setScreen,
  setSelectedChecklistId
}: Props): ReactNode | null {
  if (screen === "checklists") {
    return (
      <ChecklistsScreen
        items={checklists}
        selectedId={selectedChecklistId}
        onSelectedIdChange={setSelectedChecklistId}
        onBack={() => { setChecklistOrigin(""); setScreen("inicio"); }}
        onCloseDetail={checklistOrigin === "servicos" ? () => { setSelectedChecklistId(""); setChecklistOrigin(""); setScreen("servicos"); } : undefined}
        onReload={reloadChecklists}
        loadStatus={checklistsStatus}
      />
    );
  }
  return null;
}
