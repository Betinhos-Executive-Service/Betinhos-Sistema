type Props = {
  kind: "comunicado" | "checklist";
  tone: "atencao" | "info" | "sucesso";
  eyebrow: string;
  title: string;
  meta?: string;
  onOpen: () => void;
};

// Aviso compacto da tela Serviços (comunicado ou checklist): ícone no tom do status, selo, título e chevron.
// Fica com cara de aviso para não competir com os cards de serviço.
export function CompactNoticeCard({ kind, tone, eyebrow, title, meta, onOpen }: Props) {
  return (
    <button type="button" className="notice-compact" data-tone={tone} onClick={onOpen}>
      <span className="notice-compact-icon" aria-hidden="true">
        {kind === "comunicado" ? (
          <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4V5Zm3 4h10M7 12h7" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m1 10 2 2 4-4" /></svg>
        )}
      </span>
      <span className="notice-compact-text">
        <small>{eyebrow}</small>
        <strong>{title}</strong>
      </span>
      {meta ? <span className="notice-compact-meta">{meta}</span> : null}
      <svg className="notice-compact-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </button>
  );
}
