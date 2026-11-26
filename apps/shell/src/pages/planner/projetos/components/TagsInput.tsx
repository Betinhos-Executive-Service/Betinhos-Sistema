// Tags livres do projeto: Enter ou vírgula cria, Backspace no campo vazio tira a última, sugestões das tags já usadas.
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { MAX_TAG, MAX_TAGS, addTag, corDaTag } from "../domain/tags";

type Props = { value: string[]; onChange: (tags: string[]) => void; sugestoes: string[]; disabled?: boolean };

export function TagsInput({ value, onChange, sugestoes, disabled }: Props) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cheio = value.length >= MAX_TAGS;
  const q = texto.trim().toLocaleLowerCase("pt-BR");
  const usadas = new Set(value.map((t) => t.toLocaleLowerCase("pt-BR")));
  const opcoes = sugestoes.filter((t) => !usadas.has(t.toLocaleLowerCase("pt-BR")) && (!q || t.toLocaleLowerCase("pt-BR").includes(q))).slice(0, 8);

  const mostrarSugestoes = aberto && !disabled && !cheio && opcoes.length > 0;

  const criar = (t: string) => { onChange(addTag(value, t)); setTexto(""); };

  return (
    <div className="pj-tags" onFocus={() => setAberto(true)}
      onBlur={(event) => { if (event.currentTarget.contains(event.relatedTarget as Node)) return; setAberto(false); if (texto.trim()) criar(texto); }}>
      <div className="pj-tags__campo" onClick={() => inputRef.current?.focus()}>
        {value.map((t) => (
          <span key={t} className={`pj-tag pj-tag--${corDaTag(t)}`}>
            {t}
            <button type="button" disabled={disabled} aria-label={`Remover a tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={12} /></button>
          </span>
        ))}
        <input ref={inputRef} value={texto} maxLength={MAX_TAG} disabled={disabled || cheio} aria-label="Nova tag"
          placeholder={cheio ? `Até ${MAX_TAGS} tags` : value.length ? "Mais uma tag" : "Ex.: Frota, Financeiro"}
          onChange={(event) => {
            const v = event.target.value;
            if (v.includes(",")) { const partes = v.split(","); const resto = partes.pop() ?? ""; onChange(partes.reduce(addTag, value)); setTexto(resto); return; }
            setTexto(v);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); if (texto.trim()) criar(texto); }
            else if (event.key === "Backspace" && !texto && value.length) onChange(value.slice(0, -1));
            // preventDefault: o Esc do <dialog> nativo (Drawer) é a ação padrão do keydown; só stopPropagation não segura.
            else if (event.key === "Escape" && mostrarSugestoes) { event.preventDefault(); event.stopPropagation(); setAberto(false); }
          }} />
      </div>
      {mostrarSugestoes && (
        <div className="pj-tags__sug" role="group" aria-label="Tags já usadas">
          {opcoes.map((t) => (
            <button key={t} type="button" className={`pj-tag pj-tag--${corDaTag(t)} pj-tag--sug`} onMouseDown={(event) => event.preventDefault()} onClick={() => criar(t)}>+ {t}</button>
          ))}
        </div>
      )}
    </div>
  );
}
