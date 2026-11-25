// Idioma da página: escolha salva (localStorage `bt-idioma`) > ?lang= > idioma do navegador > português.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { IDIOMAS, TEXTOS, CORES } from "../../src/idiomas.mjs";

export type IdiomaId = "pt" | "en" | "es";
const TXT = TEXTOS as Record<string, string[]>;
const COR = CORES as Record<string, string[]>;
const IDS = (IDIOMAS as { id: string; nome: string; local: string }[]).map((l) => l.id);
export const LISTA_IDIOMAS = IDIOMAS as { id: IdiomaId; nome: string; local: string }[];

const valido = (x: unknown) => { const v = String(x || "").slice(0, 2).toLowerCase(); return IDS.includes(v) ? (v as IdiomaId) : null; };
function inicial(): IdiomaId {
  try { const s = valido(localStorage.getItem("bt-idioma")); if (s) return s; } catch { /* sem storage */ }
  const q = valido(new URLSearchParams(location.search).get("lang"));
  if (q) return q;
  const nav = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of nav) { const v = valido(l); if (v) return v; }
  return "pt";
}

export type Traduz = (chave: string, vars?: Record<string, string | number | null | undefined>) => string;
interface Ctx { id: IdiomaId; t: Traduz; cor: (c?: string) => string; local: string; mudar: (id: IdiomaId) => void; setTitulo: (chave: string) => void }
const Contexto = createContext<Ctx | null>(null);

export function fazTraduz(id: IdiomaId): Traduz {
  return (chave, vars) => {
    const l = TXT[chave];
    let s = l ? l[IDS.indexOf(id)] : chave;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] == null ? "" : String(vars[k])));
    return s;
  };
}

export function IdiomaProvider({ children, tituloInicial = "titulo.pagina", idInicial }: { children: ReactNode; tituloInicial?: string; idInicial?: IdiomaId }) {
  const [id, setId] = useState<IdiomaId>(idInicial ?? inicial);
  const [tituloChave, setTitulo] = useState(tituloInicial);
  const t = useMemo(() => fazTraduz(id), [id]);
  const local = LISTA_IDIOMAS[IDS.indexOf(id)].local;
  useEffect(() => { document.documentElement.lang = local; }, [local]);
  useEffect(() => { document.title = t(tituloChave); }, [t, tituloChave]);
  const mudar = useCallback((novo: IdiomaId) => {
    if (!valido(novo)) return;
    setId(novo);
    try { localStorage.setItem("bt-idioma", novo); } catch { /* sem storage: vale só nesta visita */ }
  }, []);
  const cor = useCallback((c?: string) => {
    const s = String(c || "").trim(), l = COR[s.toLowerCase()];
    return id === "pt" || !l ? s : l[id === "en" ? 0 : 1];
  }, [id]);
  const valor = useMemo(() => ({ id, t, cor, local, mudar, setTitulo }), [id, t, cor, local, mudar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useIdioma() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useIdioma fora do IdiomaProvider");
  return c;
}
