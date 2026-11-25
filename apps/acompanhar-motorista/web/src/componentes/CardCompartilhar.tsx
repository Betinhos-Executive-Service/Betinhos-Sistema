import { useEffect, useRef, useState } from "react";
import { useIdioma } from "../i18n";
import { Compartilhar } from "../icones";

// Compartilhar o próprio link: folha nativa no celular; no computador copia e avisa (visual + leitor de tela).
export function CardCompartilhar() {
  const { t } = useIdioma();
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function compartilhar() {
    const url = location.origin + location.pathname;
    if (navigator.share) { navigator.share({ title: document.title, url }).catch(() => {}); return; }
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(false), 2000);
    }).catch(() => {});
  }
  return (
    <section className="linha-leve" aria-label={t("cp.titulo")}>
      <div className="ll-texto"><b>{t("cp.titulo")}</b><small>{t("cp.sub")}</small></div>
      <button type="button" className={"btn btn-secundario btn-icone" + (copiado ? " copiado" : "")} id="compartilhar" aria-label={t("compartilhar")} onClick={compartilhar}><Compartilhar /></button>
      <span className="sr" id="copiado" role="status">{copiado ? t("copiado") : ""}</span>
    </section>
  );
}
