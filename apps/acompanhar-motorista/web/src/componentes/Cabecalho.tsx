import { useEffect, useRef, useState } from "react";
import { useIdioma } from "../i18n";
import { Compartilhar } from "../icones";
import { SeletorIdioma } from "./SeletorIdioma";

// Compartilhar: folha nativa no celular; no computador copia o link e avisa (visual + leitor de tela).
export function Cabecalho({ reserva }: { reserva: string | null }) {
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
    <>
      <header className="cab">
        <div className="cab-marca"><img className="logo-solta" src="/logo-b-128.png" alt="Betinhos Executive Service" width={40} height={40} /><div><b>BETINHOS</b><small>Executive Service</small></div></div>
        <div className="cab-lado">
          <span className="reserva" id="reserva" hidden={!reserva}>{reserva}</span>
          <SeletorIdioma />
          <button type="button" className={"qd" + (copiado ? " copiado" : "")} id="compartilhar" aria-label={t("compartilhar")} onClick={compartilhar}><Compartilhar /></button>
        </div>
      </header>
      <span className="sr" id="copiado" role="status">{copiado ? t("copiado") : ""}</span>
    </>
  );
}
