import type { Cfg } from "../tipos";
import { useIdioma } from "../i18n";
import { Mensagem, Telefone } from "../icones";

// Central 24h (WhatsApp e telefone), em linha leve; some quando o servidor não configurou nenhum contato.
export function Contato({ cfg, hidden }: { cfg: Cfg; hidden?: boolean }) {
  const { t } = useIdioma();
  if (!cfg.telefone && !cfg.whatsapp) return null;
  return (
    <section className="linha-leve contato" hidden={hidden} aria-label={t("central.titulo")}>
      <div className="ll-texto"><b>{t("central.titulo")}</b><small>{t("central.sub")}</small></div>
      <div className="ll-acoes">
        {cfg.telefone ? <a className="btn btn-secundario btn-icone" href={`tel:${cfg.telefone}`} aria-label={t("contato.ligar")}><Telefone /></a> : null}
        {cfg.whatsapp ? <a className="btn btn-secundario btn-icone" href={`https://wa.me/${cfg.whatsapp}`} target="_blank" rel="noopener" aria-label={t("contato.whats")}><Mensagem /></a> : null}
      </div>
    </section>
  );
}
