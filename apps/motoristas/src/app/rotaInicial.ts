import { findDetailByParams, type LocalStore } from "../lib/localWorkflow";
import type { DetailData, Screen } from "../types";
import { getHashRouteFallbackScreen, getHashRouteRestoreScreen, screenNeedsHashDetail, type HashRoute } from "./navigation";

// Tela e detalhe iniciais a partir da rota hash (localhost), antes da carga remota.
export function findDetailFromHashRoute(store: LocalStore, route: HashRoute | null) {
  if (!route?.detailId) return null;
  return findDetailByParams([...store.agenda, ...store.history], route.detailId, route.detailType ?? "");
}

export function getInitialScreenFromHashRoute(route: HashRoute, detail: DetailData | null): Screen {
  const restoredScreen = getHashRouteRestoreScreen(route.screen);
  if (screenNeedsHashDetail(restoredScreen) && !detail) {
    return getHashRouteFallbackScreen(restoredScreen);
  }
  return restoredScreen;
}
