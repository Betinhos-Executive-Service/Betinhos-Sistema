import type { Cfg } from "../tipos";
import { useIdioma } from "../i18n";
import { Mensagem, Telefone } from "../icones";

// Contato da central (WhatsApp e telefone); some quando o servidor não configurou nenhum.
export function Contato({ cfg, hidden }: { cfg: Cfg; hidden?: boolean }) {
  const { t } = useIdioma();
  if (!cfg.telefone && !cfg.whatsapp) return null;
  return (
    <div className="contato" hidden={hidden}>
      {cfg.whatsapp ? <a className="btn btn-primario" href={`https://wa.me/${cfg.whatsapp}`} target="_blank" rel="noopener"><Mensagem /><span>{t("contato.whats")}</span></a> : null}
      {cfg.telefone ? <a className="btn btn-secundario" href={`tel:${cfg.telefone}`}><Telefone /><span>{t("contato.ligar")}</span></a> : null}
    </div>
  );
}
