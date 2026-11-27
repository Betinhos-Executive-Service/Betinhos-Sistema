// Aparência das colunas do quadro (ícone, chave de cor e dica), usada no quadro e no detalhe.
import { CircleCheck, Eye, Lightbulb, PauseCircle, Wrench, type LucideIcon } from "lucide-react";
import { BOARD_COLUMNS } from "../../domain/projectsBoard";
import { STATUS } from "../domain/choices";

export const COLUMN_STYLE: Record<number, { key: string; icon: LucideIcon; hint: string }> = {
  [STATUS.ideia]: { key: "idea", icon: Lightbulb, hint: "Anotada, ainda sem forma" },
  [STATUS.andamento]: { key: "build", icon: Wrench, hint: "Em construção" },
  [STATUS.validacao]: { key: "review", icon: Eye, hint: "Pronta para conferir" },
  [STATUS.concluida]: { key: "live", icon: CircleCheck, hint: "Entregue e em uso" },
  [STATUS.pausada]: { key: "paused", icon: PauseCircle, hint: "Parada por enquanto" },
};

export const labelOf = (status: number) => BOARD_COLUMNS.find((c) => c.value === status)?.label ?? "Ideia";
