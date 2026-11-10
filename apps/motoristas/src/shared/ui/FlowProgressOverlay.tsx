// Overlay de processo remoto em andamento (finalização, envio), com o título e a etapa atual.
export type RemoteOperation = {
  title: string;
  message: string;
  detailId?: string;
  phase: "loading" | "success";
};

export function FlowProgressOverlay({ operation }: { operation: RemoteOperation }) {
  return (
    <div className="flow-progress-overlay" role="status" aria-live="polite" aria-label={operation.title}>
      <div className={`flow-progress-card is-${operation.phase}`}>
        <div className="flow-progress-track" aria-hidden="true">
          <span />
        </div>
        <div className="flow-progress-kicker">{operation.detailId ?? "Processo remoto"}</div>
        <h2>{operation.title}</h2>
        <p>{operation.message}</p>
        <div className="flow-progress-note">Mantenha esta tela aberta.</div>
      </div>
    </div>
  );
}
