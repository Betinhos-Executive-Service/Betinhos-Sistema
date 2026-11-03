import { useEffect, useState } from "react";
import { createOne, DATAVERSE, LOCAL_DRIVER_ID } from "../../lib/dataverse";
import { enableWebPush, getWebPushState, type WebPushState } from "../../lib/webPush";

const LABELS: Partial<Record<WebPushState, string>> = {
  ready: "Ativar notificações no celular",
  enabled: "Notificações ativadas neste aparelho",
  denied: "Notificações bloqueadas: libere nas configurações do navegador",
  "needs-install": "Para receber notificações, adicione o app à tela inicial",
  unsupported: "Este aparelho não recebe notificações do app"
};

/** Link discreto do rodapé do Início; some quando o Web Push não está ligado (chave VAPID vazia) ou fora do PWA. */
export function WebPushLink({ driverId }: { driverId?: string }) {
  const [state, setState] = useState<WebPushState>("off");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getWebPushState(driverId).then((next) => { if (active) setState(next); }).catch(() => {});
    return () => { active = false; };
  }, [driverId]);

  const label = LABELS[state];
  if (!label || !driverId || driverId === LOCAL_DRIVER_ID) return null;

  const activate = async () => {
    setBusy(true);
    setFailed(false);
    try {
      if (!(await enableWebPush(driverId, (record) => createOne(DATAVERSE.inscricoesPush, record)))) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setState(await getWebPushState(driverId).catch(() => "unsupported" as WebPushState));
    }
  };

  return (
    <>
      <button type="button" className="concept-tour-link" disabled={busy || state !== "ready"} onClick={activate}>
        {busy ? "Ativando..." : label}
      </button>
      {failed ? <span role="alert" className="concept-tour-link">Notificações não ativadas. Toque de novo e permita no aviso.</span> : null}
    </>
  );
}
