import { useRef, useState } from "react";
import { getInitialDespesaId, getInitialDetail, getInitialGastosCartaoLink, getInitialTermoMultaId, getInitialTreinamentoParticipacaoId, loadStore } from "./bootstrap";
import { parseHashRoute, type HashRoute } from "./navigation";
import { configApp } from "./configApp.ts";
import { findDetailFromHashRoute, getInitialScreenFromHashRoute, telaPermitida } from "./rotaInicial";
import { loadFinalizeDraftAssets } from "../features/finalizar/rascunhos";
import type { LocalStore } from "../lib/localWorkflow";
import type { DetailData, Screen } from "../types";

// Estado de abertura: agenda salva no aparelho (com assinaturas e fotos do rascunho) e a tela inicial pelo hash, detalhe pendente,
// termo de multa, treinamento ou gasto do cartão (deep links do push).
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
  // Link ou push para módulo desligado na configuração do App cai no Início, com aviso (avisoModuloDesligado).
  const initialRef = useRef<{ screen: Screen; bloqueada: boolean } | null>(null);
  if (!initialRef.current) {
    const pedida: Screen = initialHashRouteRef.current
      ? getInitialScreenFromHashRoute(initialHashRouteRef.current, initialHashDetail)
      : (initialDetailRef.current ? "detalhes" : getInitialTermoMultaId() ? "multas" : getInitialTreinamentoParticipacaoId() ? "treinamentos" : (getInitialDespesaId() || getInitialGastosCartaoLink()) ? "gastosCartao" : "inicio");
    const permitida = telaPermitida(pedida, configApp.telaLigada);
    initialRef.current = { screen: permitida, bloqueada: permitida !== pedida };
  }
  const initialScreen: Screen = initialRef.current.screen;
  const avisoModuloDesligado = initialRef.current.bloqueada;
  return { avisoModuloDesligado, initialDetailRef, initialHashDetail, initialHashRouteRef, initialScreen, setStore, store };
}
