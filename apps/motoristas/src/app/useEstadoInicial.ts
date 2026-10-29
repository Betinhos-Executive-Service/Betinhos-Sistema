import { useRef, useState } from "react";
import { getInitialDetail, getInitialTermoMultaId, loadStore } from "./bootstrap";
import { parseHashRoute, type HashRoute } from "./navigation";
import { findDetailFromHashRoute, getInitialScreenFromHashRoute } from "./rotaInicial";
import { loadFinalizeDraftAssets } from "../features/finalizar/rascunhos";
import type { LocalStore } from "../lib/localWorkflow";
import type { DetailData, Screen } from "../types";

// Estado de abertura: agenda salva no aparelho (com assinaturas e fotos do rascunho) e a tela inicial pelo hash, detalhe pendente ou termo de multa.
export function useEstadoInicial(hashRoutingActive: boolean) {
  const [store, setStore] = useState<LocalStore>(() => {
    const localStore = loadStore();
    const savedAssets = loadFinalizeDraftAssets();
    return {
      ...localStore,
      signatures: { ...localStore.signatures, ...savedAssets.signatures },
      photos: { ...localStore.photos, ...savedAssets.photos }
    };
  });
  const initialHashRouteRef = useRef<HashRoute | null>(hashRoutingActive ? parseHashRoute(window.location.hash) : null);
  const initialHashDetail = initialHashRouteRef.current ? findDetailFromHashRoute(store, initialHashRouteRef.current) : null;
  const initialDetailRef = useRef<DetailData | null>(initialHashRouteRef.current ? initialHashDetail : getInitialDetail(store));
  const initialScreen: Screen = initialHashRouteRef.current
    ? getInitialScreenFromHashRoute(initialHashRouteRef.current, initialHashDetail)
    : (initialDetailRef.current ? "detalhes" : getInitialTermoMultaId() ? "multas" : "inicio");
  return { initialDetailRef, initialHashDetail, initialHashRouteRef, initialScreen, setStore, store };
}
