import { AgendaCard } from "../../shared/ui/AgendaCard";
import { CompactNoticeCard } from "../../shared/ui/CompactNoticeCard";
import { COMUNICADO_TIPO, isComunicadoPending, type ComunicadoDestinatario } from "./comunicados";

type Props = {
  item: ComunicadoDestinatario;
  onOpen: (id: string) => void;
  // "compact": aviso fino da tela Serviços; "card" (padrão): card da lista de Comunicados.
  variant?: "card" | "compact";
};

const TONE = { assinatura: "atencao", informativo: "info", concluido: "sucesso" } as const;

export function ComunicadoAgendaCard({ item, onOpen, variant = "card" }: Props) {
  const pending = isComunicadoPending(item);
  const unread = !item.abertoEm && !item.lidoEm && !item.cienteEm;
  const typeLabel = pending
    ? item.tipo === COMUNICADO_TIPO.ciencia ? "ASSINATURA OBRIGATÓRIA" : "INFORMATIVO"
    : item.cienteEm ? "CIÊNCIA ASSINADA" : "CIÊNCIA REGISTRADA";
  const label = unread ? `NOVO · ${typeLabel}` : typeLabel;
  const state = !pending ? "concluido" : item.tipo === COMUNICADO_TIPO.ciencia ? "assinatura" : "informativo";
  const compact = variant === "compact";
  const time = new Intl.DateTimeFormat("pt-BR", compact
    ? { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }
    : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(item.enviadoEm)).replace(",", "");

  if (compact) {
    return <CompactNoticeCard kind="comunicado" tone={TONE[state]} eyebrow={label} title={item.titulo} meta={time} onOpen={() => onOpen(item.id)} />;
  }

  return (
    <div className="agenda-layout-item comunicado-service-item" data-comunicado-unread={unread ? "true" : undefined} data-comunicado-state={state}>
      <AgendaCard
        item={{
          id: item.id,
          tipo: "SERVICO",
          time,
          label,
          description: item.titulo
        }}
        bodyLabel="Comunicado"
        onOpen={() => onOpen(item.id)}
      />
    </div>
  );
}
