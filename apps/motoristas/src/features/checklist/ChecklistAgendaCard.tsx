import { AgendaCard } from "../../shared/ui/AgendaCard";
import { CompactNoticeCard } from "../../shared/ui/CompactNoticeCard";
import { checklistCardTexto, isChecklistPending, type ChecklistVeiculo } from "./checklists";

type Props = {
  item: ChecklistVeiculo;
  onOpen: (id: string) => void;
  // "compact": aviso fino da tela Serviços; "card" (padrão): card da lista de Checklists.
  variant?: "card" | "compact";
};

function formatShortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
}

// Mesmo card da agenda (como o de comunicado) na lista de Checklists; em Serviços usa a variante compacta.
export function ChecklistAgendaCard({ item, onOpen, variant = "card" }: Props) {
  const pending = isChecklistPending(item);
  const { label, descricao } = checklistCardTexto(item);
  const when = pending ? formatShortDate(item.solicitadoEm) : formatShortDate(item.concluidoEm);

  if (variant === "compact") {
    return <CompactNoticeCard kind="checklist" tone={pending ? "atencao" : "sucesso"} eyebrow={label} title={descricao} meta={when} onOpen={() => onOpen(item.id)} />;
  }

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
