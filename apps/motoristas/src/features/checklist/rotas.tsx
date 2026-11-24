import { ChecklistsScreen, type VistoriaAgora } from "./ChecklistsScreen";
import type { Screen } from "../../types";
import type { ReactNode } from "react";
import type { useChecklists } from "./useChecklists";
import type { ChecklistPedidoManutencao } from "./checklists";
import { configApp } from "../../app/configApp";

type Props = ReturnType<typeof useChecklists> & {
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  /** Preenche "Solicitar manutenção" com os itens Não OK do checklist enviado. */
  preencherManutencao: (pedido: ChecklistPedidoManutencao) => void;
  /** "Fazer vistoria agora"; indefinido para motorista terceiro (sem botão). */
  vistoriaAgora?: VistoriaAgora;
};

// Tela de checklists do veículo.
export function rotasChecklist(screen: Screen, {
  checklistOrigin,
  checklists,
  checklistsStatus,
  preencherManutencao,
  reloadChecklists,
  selectedChecklistId,
  setChecklistOrigin,
  setScreen,
  setSelectedChecklistId,
  vistoriaAgora
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
        vistoriaAgora={vistoriaAgora}
        // Com a manutenção desligada na configuração do App, o checklist termina sem oferecer o atalho.
        onCriarManutencao={configApp.telaLigada("solicitarManutencao") ? (pedido) => { preencherManutencao(pedido); setScreen("solicitarManutencao"); } : undefined}
      />
    );
  }
  return null;
}
