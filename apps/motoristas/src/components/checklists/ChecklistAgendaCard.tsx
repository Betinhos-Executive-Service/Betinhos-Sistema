import { AgendaCard } from "../services/AgendaCard";
import { checklistCardTexto, isChecklistPending, type ChecklistVeiculo } from "../../lib/checklists";

type Props = {
  item: ChecklistVeiculo;
  onOpen: (id: string) => void;
};

function formatShortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
}

// Mesmo card da agenda (como o de comunicado): o checklist aparece em Serviços enquanto pendente.
export function ChecklistAgendaCard({ item, onOpen }: Props) {
  const pending = isChecklistPending(item);
  const { label, descricao } = checklistCardTexto(item);
  const when = pending ? formatShortDate(item.solicitadoEm) : formatShortDate(item.concluidoEm);

  return (
    <div className="agenda-layout-item checklist-service-item" data-checklist-state={pending ? "pendente" : "concluido"}>
      <AgendaCard
        item={{
          id: item.id,
          tipo: "SERVICO",
          time: when,
          label,
          description: descricao
        }}
        bodyLabel="Checklist"
        onOpen={() => onOpen(item.id)}
      />
    </div>
  );
}
