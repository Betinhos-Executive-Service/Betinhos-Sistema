import { useEffect, useRef, useState } from "react";
import { BANDEIRAS } from "../../../src/idiomas.mjs";
import { LISTA_IDIOMAS, useIdioma } from "../i18n";

const Bandeira = ({ id }: { id: string }) => <span className="bandeira" dangerouslySetInnerHTML={{ __html: (BANDEIRAS as Record<string, string>)[id] }} />;

// Seletor de idioma: botão com a bandeira atual e menu com as três. Fecha no clique fora e no Esc.
export function SeletorIdioma({ className = "idioma" }: { className?: string }) {
  const { id, t, mudar } = useIdioma();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null), botao = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    menu.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); botao.current?.focus(); } };
    document.addEventListener("click", fora); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  return (
    <div className={className} id="idioma" ref={caixa}>
      <button type="button" className="qd idioma-botao" id="idioma-botao" ref={botao} aria-haspopup="true" aria-expanded={aberto} aria-controls="idioma-menu" aria-label={t("idioma")} onClick={() => setAberto((a) => !a)}>
        <span className="bandeira" id="idioma-atual" dangerouslySetInnerHTML={{ __html: (BANDEIRAS as Record<string, string>)[id] }} />
      </button>
      <div className="idioma-menu" id="idioma-menu" role="group" aria-label={t("idioma")} ref={menu} hidden={!aberto}>
        {LISTA_IDIOMAS.map((l) => (
          <button key={l.id} type="button" className="idioma-op" data-idioma={l.id} lang={l.local} aria-pressed={l.id === id}
            onClick={() => { mudar(l.id); setAberto(false); botao.current?.focus(); }}>
            <Bandeira id={l.id} /><span>{l.id.toUpperCase()}</span><span className="sr">{l.nome}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
