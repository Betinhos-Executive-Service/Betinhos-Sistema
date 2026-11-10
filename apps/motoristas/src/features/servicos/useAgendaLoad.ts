import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PortaDados } from "../../data/porta";
import { useEffect } from "react";
import { getInitialDetail, getInitialParams } from "../../app/bootstrap";
import { getHashRouteFallbackScreen, screenNeedsHashDetail, type HashRoute } from "../../app/navigation";
import { hasDataverseRuntime, type DriverContext } from "../../data/dataverse/cliente";
import { reportAppError } from "../../shared/appErrorLogger";
import { findDetailByParams, type LocalStore } from "../../lib/localWorkflow";
import type { ToastTone } from "../../shared/ui/LocalToast";
import type { LoadingOverlayState } from "../../shared/ui/LoadingOverlay";
import type { DetailData, Screen } from "../../types";
import { findDetailFromHashRoute, getInitialScreenFromHashRoute } from "../../app/rotaInicial";

export type RefreshOptions = {
  silent?: boolean;
};

type Options = {
  completeDataLoadingState: (title: string, message?: string) => Promise<void>;
  comunicadosDriverIdRef: MutableRefObject<string>;
  dados: PortaDados;
  initialHashRouteRef: MutableRefObject<HashRoute | null>;
  isButtonPreviewMode: boolean;
  isReceiptPreviewMode: boolean;
  logAppError: (error: unknown, action: string, phase?: string) => void;
  reloadChecklists: () => Promise<void>;
  reloadComunicados: () => Promise<void>;
  remoteMode: boolean;
  screen: Screen;
  selectedChecklistId: string;
  serviceDeepLinkHandledRef: MutableRefObject<boolean>;
  setDataLoadingState: (loading: LoadingOverlayState | null) => void;
  setDriverContext: Dispatch<SetStateAction<DriverContext | null>>;
  setRemoteMode: Dispatch<SetStateAction<boolean>>;
  setScreen: (screen: Screen) => void;
  setSelectedDetail: Dispatch<SetStateAction<DetailData | null>>;
  setStore: Dispatch<SetStateAction<LocalStore>>;
  setToast: (message: string, tone?: ToastTone) => void;
  store: LocalStore;
};

// Carga da agenda: carga inicial (Dataverse ou mock), atualização manual/automática (refreshLocal) e reset dos dados locais.
export function useAgendaLoad({ completeDataLoadingState, comunicadosDriverIdRef, dados, initialHashRouteRef, isButtonPreviewMode, isReceiptPreviewMode, logAppError, reloadChecklists, reloadComunicados, remoteMode, screen, selectedChecklistId, serviceDeepLinkHandledRef, setDataLoadingState, setDriverContext, setRemoteMode, setScreen, setSelectedDetail, setStore, setToast, store }: Options) {
  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode) return;
    if (!hasDataverseRuntime()) return;
    let alive = true;
    setRemoteMode(true);
    setDataLoadingState({
      phase: "loading",
      title: "Carregando dados",
      message: "Sincronizando agenda no Dataverse."
    });
    dados.carregarAgenda()
      .then((remote) => {
        if (!alive) return;
        setDataLoadingState(null);
        const remoteStore = { ...store, agenda: remote.agenda, history: remote.history };
        const hashRoute = initialHashRouteRef.current;
        const remoteInitialDetail = hashRoute ? findDetailFromHashRoute(remoteStore, hashRoute) : getInitialDetail(remoteStore);
        setDriverContext(remote.driver);
        comunicadosDriverIdRef.current = remote.driver?.id ?? "";
        reloadComunicados().catch((error) => {
          reportAppError(error, { severity: "warning", source: "app", action: "loadDriverComunicados", phase: "initial" });
          setToast("Não foi possível carregar comunicados. Atualize o aplicativo.", "warning");
        });
        reloadChecklists().catch((error) => {
          reportAppError(error, { severity: "warning", source: "app", action: "loadDriverChecklists", phase: "initial" });
        });
        setStore((current) => ({
          ...current,
          agenda: remote.agenda,
          history: remote.history
        }));
        if (hashRoute) {
          const routedScreen = getInitialScreenFromHashRoute(hashRoute, remoteInitialDetail);
          if (screenNeedsHashDetail(routedScreen)) {
            if (remoteInitialDetail) {
              dados.marcarVisto(remoteInitialDetail).catch((error) => {
                reportAppError(error, {
                  severity: "error",
                  source: "app",
                  action: "markDetailViewedRemote",
                  phase: "hash-route",
                  screen: routedScreen,
                  detailId: remoteInitialDetail.id,
                  detailType: remoteInitialDetail.type
                });
                setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
              });
              setSelectedDetail(remoteInitialDetail);
              setScreen(routedScreen);
              setToast("");
              return;
            }
            if (hashRoute.detailId && hashRoute.detailType) {
              dados.carregarDetalhe(hashRoute.detailId, hashRoute.detailType)
                .then((detail) => {
                  if (!alive) return;
                  if (!detail) {
                    setSelectedDetail(null);
                    setScreen(getHashRouteFallbackScreen(routedScreen));
                    setToast("Serviço do link não encontrado.");
                    return;
                  }
                  dados.marcarVisto(detail).catch((error) => {
                    reportAppError(error, {
                      severity: "error",
                      source: "app",
                      action: "markDetailViewedRemote",
                      phase: "hash-route-remote-detail",
                      screen: routedScreen,
                      detailId: detail.id,
                      detailType: detail.type
                    });
                    setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
                  });
                  setSelectedDetail(detail);
                  setScreen(routedScreen);
                  setToast("");
                })
                .catch((error) => {
                  if (!alive) return;
                  reportAppError(error, {
                    severity: "error",
                    source: "app",
                    action: "loadRemoteDetailByParams",
                    phase: "hash-route",
                    screen: routedScreen
                  });
                  setSelectedDetail(null);
                  setScreen(getHashRouteFallbackScreen(routedScreen));
                  setToast(error instanceof Error ? error.message : "Serviço do link não encontrado.");
                });
              return;
            }
            setSelectedDetail(null);
            setScreen(getHashRouteFallbackScreen(routedScreen));
            setToast("");
            return;
          }
          setSelectedDetail(remoteInitialDetail);
          setScreen(routedScreen);
          setToast("");
          return;
        }
        if (serviceDeepLinkHandledRef.current) {
          // O caminho rápido do push já abriu o serviço (ou Serviços); não sobrescreve a navegação do motorista.
          setToast("");
          return;
        }
        if (remoteInitialDetail) {
          serviceDeepLinkHandledRef.current = true;
          dados.marcarVisto(remoteInitialDetail).catch((error) => {
            reportAppError(error, {
              severity: "error",
              source: "app",
              action: "markDetailViewedRemote",
              phase: "initial-detail",
              screen: "detalhes",
              detailId: remoteInitialDetail.id,
              detailType: remoteInitialDetail.type
            });
            setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
          });
          setSelectedDetail(remoteInitialDetail);
          setScreen("detalhes");
          return;
        }
        const initialParams = getInitialParams();
        if (initialParams.serviceId) {
          serviceDeepLinkHandledRef.current = true;
          dados.carregarDetalhe(initialParams.serviceId, initialParams.type)
            .then((detail) => {
              if (!alive) return;
              if (!detail) {
                setScreen("servicos");
                setToast("Este serviço não está mais na sua agenda.", "warning");
                return;
              }
              dados.marcarVisto(detail).catch((error) => {
                reportAppError(error, {
                  severity: "error",
                  source: "app",
                  action: "markDetailViewedRemote",
                  phase: "deep-link",
                  screen: "detalhes",
                  detailId: detail.id,
                  detailType: detail.type
                });
                setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
              });
              setSelectedDetail(detail);
              setScreen("detalhes");
              setToast("");
            })
            .catch((error) => {
              if (!alive) return;
              reportAppError(error, {
                severity: "error",
                source: "app",
                action: "loadRemoteDetailByParams",
                phase: "initial-deep-link",
                screen
              });
              setToast(error instanceof Error ? error.message : "Serviço remoto não encontrado.");
            });
          return;
        }
        setToast("");
      })
      .catch((error) => {
        if (!alive) return;
        setDataLoadingState(null);
        reportAppError(error, {
          severity: "critical",
          source: "app",
          action: "loadRemoteStore",
          phase: "bootstrap",
          screen
        });
        setRemoteMode(false);
        setToast(error instanceof Error ? error.message : "Falha ao carregar Dataverse.");
      });
    return () => {
      alive = false;
    };
  }, [isButtonPreviewMode, isReceiptPreviewMode]);


  const refreshLocal = async (detailToRefresh?: DetailData, options?: RefreshOptions) => {
    const silent = options?.silent === true;

    if (remoteMode) {
      if (!silent) {
        setDataLoadingState({
          phase: "loading",
          title: "Carregando dados",
          message: "Atualizando dados do Dataverse."
        });
      }
      try {
        const remote = await dados.carregarAgenda();
        setDriverContext(remote.driver);
        comunicadosDriverIdRef.current = remote.driver?.id ?? "";
        setStore((current) => ({ ...current, agenda: remote.agenda, history: remote.history }));
        try {
          await reloadComunicados();
        } catch (error) {
          reportAppError(error, { severity: "warning", source: "app", action: "loadDriverComunicados", phase: "refresh" });
          if (!silent) setToast("Não foi possível atualizar comunicados. Tente novamente.", "warning");
        }
        // Não recarrega com o formulário do checklist aberto: o motorista pode estar enviando fotos.
        if (screen !== "checklists" || !selectedChecklistId) {
          try {
            await reloadChecklists();
          } catch (error) {
            reportAppError(error, { severity: "warning", source: "app", action: "loadDriverChecklists", phase: "refresh" });
          }
        }
        if (detailToRefresh) {
          const refreshedDetail =
            findDetailByParams([...remote.agenda, ...remote.history], detailToRefresh.id, detailToRefresh.type) ??
            await dados.carregarDetalhe(detailToRefresh.dataverse?.id ?? detailToRefresh.id, detailToRefresh.type);
          if (refreshedDetail) setSelectedDetail(refreshedDetail);
        }
        if (!silent) await completeDataLoadingState("Dados atualizados", "Dataverse sincronizado.");
      } catch (error) {
        if (!silent) setDataLoadingState(null);
        logAppError(error, "loadRemoteStore", "refresh");
        if (!silent || error instanceof Error) {
          setToast(error instanceof Error ? error.message : "Falha ao atualizar Dataverse.");
        }
      }
      return;
    }
    setStore((current) => ({ ...current }));
  };

  return {
    refreshLocal
  };
}
