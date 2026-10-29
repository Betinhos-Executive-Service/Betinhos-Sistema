// Aba e troca em edição vivem na query da rota do shell: #/funcoes-operacionais?aba=pedido, ?aba=carro&troca={guid}.
// Equivalem às âncoras do WebResource (#/trocar-motorista, #/duplicar-pedido, #/trocas-de-carro/{guid}). Também valem
// os parâmetros antigos `view=`, `mode=edit&id=` e o `data=` (query codificada, padrão de WebResource/custom page).
import type { ViewName } from "./types";

export type Route = { view: ViewName | null; editId: string };

/** Valor de `aba=` de cada visão; Motorista é o padrão e não vai para a URL. */
export const ABA: Record<ViewName, string> = { driver: "motorista", clone: "pedido", vehicle: "carro" };

const ALIASES: Record<string, ViewName> = {
  motorista: "driver",
  "trocar-motorista": "driver",
  driver: "driver",
  pedido: "clone",
  "duplicar-pedido": "clone",
  clone: "clone",
  carro: "vehicle",
  "trocas-de-carro": "vehicle",
  "trocar-carro": "vehicle",
  vehicle: "vehicle"
};

const GUID = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

/** Parâmetros antigos que a tela traduz para `aba`/`troca` e depois tira da URL. */
export const LEGACY_KEYS = ["view", "mode", "id", "data"] as const;

export function viewFromSlug(slug: string | null | undefined): ViewName | null {
  return slug ? ALIASES[slug.trim().toLowerCase()] || null : null;
}

function guid(value: string | null | undefined): string {
  return value && GUID.test(value.trim()) ? value.trim().replace(/[{}]/g, "") : "";
}

/** Query direta mesclada com o conteúdo de `data=`; os parâmetros diretos têm prioridade. */
export function mergeDataParam(query: URLSearchParams): URLSearchParams {
  const merged = new URLSearchParams(query);
  const nested = new URLSearchParams(query.get("data") || "");
  for (const [key, value] of nested) if (!merged.has(key)) merged.set(key, value);
  merged.delete("data");
  return merged;
}

/** Lê aba e troca: `aba`/`troca` primeiro, depois `view` e o legado `mode=edit&id=`. Troca em edição força a aba Carro. */
export function parseRoute(query: URLSearchParams): Route {
  const q = mergeDataParam(query);
  const editId = guid(q.get("troca")) || (q.get("mode") === "edit" ? guid(q.get("id")) : "");
  if (editId) return { view: "vehicle", editId };
  return { view: viewFromSlug(q.get("aba")) || viewFromSlug(q.get("view")), editId: "" };
}

/** Patch da query para a visão (e a troca em edição, só na aba Carro); remove os parâmetros antigos. */
export function routePatch(view: ViewName, editId = ""): Record<string, string | null> {
  return {
    aba: view === "driver" ? null : ABA[view],
    troca: view === "vehicle" && editId ? editId : null,
    view: null,
    mode: null,
    id: null,
    data: null
  };
}

/** A URL atual já representa a rota (sem parâmetros antigos sobrando)? */
export function routeIsCanonical(query: URLSearchParams, view: ViewName, editId = ""): boolean {
  if (LEGACY_KEYS.some((key) => query.has(key))) return false;
  const aba = query.get("aba");
  const expectedAba = view === "driver" ? null : ABA[view];
  return aba === expectedAba && (query.get("troca") || "") === (view === "vehicle" ? editId : "");
}
