import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PortaDados } from "../../data/porta";
import { useEffect } from "react";
import { getInitialParams } from "../../app/bootstrap";
import { hasDataverseRuntime } from "../../data/dataverse/cliente";
import { reportAppError } from "../../shared/appErrorLogger";
import type { ToastTone } from "../../shared/ui/LocalToast";
import type { DetailData, Screen } from "../../types";

type Options = {
  dados: PortaDados;
  initialDetailRef: MutableRefObject<DetailData | null>;
  isButtonPreviewMode: boolean;
  isReceiptPreviewMode: boolean;
  pendingServiceDeepLinkRef: MutableRefObject<ReturnType<typeof getInitialParams>>;
  serviceDeepLinkHandledRef: MutableRefObject<boolean>;
  setScreen: (screen: Screen) => void;
  setSelectedDetail: Dispatch<SetStateAction<DetailData | null>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Deep link de serviço vindo do push: abre o detalhe em paralelo com a carga da agenda.
export function useServiceDeepLink({ dados, initialDetailRef, isButtonPreviewMode, isReceiptPreviewMode, pendingServiceDeepLinkRef, serviceDeepLinkHandledRef, setScreen, setSelectedDetail, setToast }: Options) {
  // Deep link de serviço vindo do push (form OnLoad -> data=servicoId=...&tipo=...): busca o detalhe
  // em paralelo com loadRemoteStore e abre assim que chega. Se o serviço saiu da agenda do motorista
  // (ex.: "Serviço retirado da agenda"), cai em Serviços em vez de mostrar erro.
  useEffect(() => {
    const { serviceId, type } = pendingServiceDeepLinkRef.current;
    if (!serviceId || isButtonPreviewMode || isReceiptPreviewMode || !hasDataverseRuntime()) return;
    // Detalhe já presente no cache local: a tela inicial já é "detalhes"; o fluxo pós-carga atualiza.
    if (initialDetailRef.current) return;
    let alive = true;
    dados.carregarDetalhe(serviceId, type)
      .then((detail) => {
        if (!alive || serviceDeepLinkHandledRef.current) return;
        serviceDeepLinkHandledRef.current = true;
        if (!detail) {
          setSelectedDetail(null);
          setScreen("servicos");
          setToast("Este serviço não está mais na sua agenda.", "warning");
          return;
        }
        dados.marcarVisto(detail).catch((error) => {
          reportAppError(error, { severity: "error", source: "app", action: "markDetailViewedRemote", phase: "push-deep-link", screen: "detalhes", detailId: detail.id, detailType: detail.type });
        });
        setSelectedDetail(detail);
        setScreen("detalhes");
      })
      .catch((error) => {
        // Sem acesso ao registro (ex.: serviço retirado do motorista) ou falha de rede: o fluxo pós-carga decide.
        reportAppError(error, { severity: "warning", source: "app", action: "loadRemoteDetailByParams", phase: "push-deep-link-fast" });
      });
    return () => { alive = false; };
  }, []);

}
