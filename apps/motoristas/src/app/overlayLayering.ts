import type { LoadingOverlayState } from "../components/common/LoadingOverlay";

// O aviso de erro crítico precisa ficar legível e clicável: com erro na tela, o overlay de carga some.
export function getVisibleLoadingOverlay(
  loading: LoadingOverlayState | null,
  criticalError: string
): LoadingOverlayState | null {
  return criticalError ? null : loading;
}
