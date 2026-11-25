import { useCallback, useEffect, useRef, useState } from "react";

export interface Passageiro { id: string; primeiroNome: string; temFoto: boolean; temTelefone: boolean; temEmail: boolean; telefoneMascarado?: string; emailMascarado?: string }
export const faltasDe = (p: Passageiro) => [!p.temFoto && "pax.falta.foto", !p.temTelefone && "pax.falta.telefone", !p.temEmail && "pax.falta.email"].filter(Boolean) as string[];
export const base = () => location.pathname.replace(/\/$/, "") + "/passageiros";
export class ErroHttp extends Error { constructor(public status: number) { super(String(status)); } }

// Lista de passageiros do link: 404 = link sem cadastro (sem seção); `aberto` falso = só leitura.
// Atualiza a cada 60 s e ao voltar à aba, exceto com a folha de edição aberta.
export function usePassageiros(pausado: boolean) {
  const [lista, setLista] = useState<Passageiro[]>([]);
  const [aberto, setAberto] = useState(true);
  const [existe, setExiste] = useState(false);
  const [versaoFoto, setVersaoFoto] = useState<Record<string, number>>({});
  const [salvo, setSalvo] = useState<{ id: string; antes: string[] } | null>(null);
  const estado = useRef({ existe: false, aberto: true, carregado: false, pausado });
  estado.current.pausado = pausado;
  const listaRef = useRef(lista);
  listaRef.current = lista;

  const carregar = useCallback(async () => {
    const e = estado.current;
    if (!e.existe && e.carregado) return;
    try {
      const r = await fetch(base(), { cache: "no-store" });
      if (r.status === 404) { e.existe = false; e.carregado = true; setExiste(false); return; }
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      e.existe = true; e.carregado = true; e.aberto = j.aberto !== false;
      setExiste(true); setAberto(e.aberto);
      if (!e.pausado) setLista(j.passageiros || []);
    } catch { /* sem a lista a seção só não aparece; a viagem segue */ }
  }, []);

  useEffect(() => {
    carregar();
    const agir = () => { const e = estado.current; if (!document.hidden && e.existe && e.aberto && !e.pausado) carregar(); };
    const timer = setInterval(agir, 60000);
    document.addEventListener("visibilitychange", agir);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", agir); };
  }, [carregar]);

  async function salvar(id: string, corpo: Record<string, unknown>) {
    const r = await fetch(base() + "/" + id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!r.ok) {
      if (r.status === 409 || r.status === 410) { estado.current.aberto = false; setAberto(false); }
      throw new ErroHttp(r.status);
    }
    const j = await r.json();
    const atual = listaRef.current.find((p) => p.id === id);
    const antes = atual ? faltasDe(atual) : [];
    setLista((l) => l.map((p) => {
      if (p.id !== id) return p;
      return { ...p, ...(j.passageiro || {}), ...(corpo.fotoBase64 ? { temFoto: true } : {}) };
    }));
    if (corpo.fotoBase64) setVersaoFoto((v) => ({ ...v, [id]: Date.now() }));
    setSalvo({ id, antes });
  }
  return { lista, aberto, existe, versaoFoto, salvo, limparSalvo: () => setSalvo(null), salvar };
}
