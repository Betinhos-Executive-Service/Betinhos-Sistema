import { useCallback, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PortaDados } from "../../data/porta";
import type { ExpensePhoto } from "../despesas/expenses";
import { findFirstPendingServiceDetail, getVoucherDraftKey, isSameDetail } from "../../app/bootstrap";
import { cancelServiceRemote, finalizeExchangeRemote, finalizeMaintenanceRemote, resolveServiceVehicleRemote } from "./remoto";
import { loadActiveFleetRemote } from "../meu-carro/remoto";
import { getDriverContext, type DriverContext } from "../../data/dataverse/cliente";
import { APP_OPERATION_ERROR_MESSAGE, reportAppError } from "../../shared/appErrorLogger";
import {
  cancelDetailLocally,
  finalizeDetailLocally,
  removeAgendaDetail,
  type LocalStore
} from "../../lib/localWorkflow";
import type { ToastTone } from "../../shared/ui/LocalToast";
import type { MaintenanceFinalizeDraft } from "./FinalizeScreen";
import {
  buildInfleetServiceVehiclePatch,
  needsDriverChoice,
  type DriverVehicleChoice,
  type FleetVehicle,
  type InfleetVehicleResolution
} from "../../lib/serviceVehicleInfleet";
import { isThirdPartyDriver } from "../meu-carro/myVehicle";
import { createMockFleetLoader, MOCK_FLEET, pickMockInfleetScenario, resolveMockServiceVehicle } from "../../lib/serviceVehicleInfleetMock";
import type { DetailData, Screen } from "../../types";
import { exchangeUserError } from "../servicos/trocaErros";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import { wait } from "../../shared/wait";
import { getDetailDraftKey, loadServiceObservationDrafts, loadVoucherDrafts } from "./rascunhos";
import { EMPTY_MAINTENANCE_FINALIZE_DRAFT } from "./rascunhoManutencao";

type Options = {
  blockIfNotFirstPending: (detail?: DetailData | null) => boolean;
  completingClearTimerRef: MutableRefObject<number | null>;
  dados: PortaDados;
  driverContext: DriverContext | null;
  logAppError: (error: unknown, action: string, phase?: string) => void;
  receiveProofs: Record<string, ExpensePhoto[]>;
  receiveStepPending: (detail: DetailData) => boolean;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  selectedDetail: DetailData | null;
  setCompletingDetailKey: Dispatch<SetStateAction<string>>;
  setCriticalError: (message: string) => void;
  setReceiveProofs: Dispatch<SetStateAction<Record<string, ExpensePhoto[]>>>;
  setReceiveUploadedCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setRemoteOperation: (operation: RemoteOperation | null) => void;
  setScreen: (screen: Screen) => void;
  setSelectedDetail: Dispatch<SetStateAction<DetailData | null>>;
  setStore: Dispatch<SetStateAction<LocalStore>>;
  setToast: (message: string, tone?: ToastTone) => void;
  store: LocalStore;
};

// Finalização do serviço: rascunhos de observação e voucher, escolha do carro (Infleet), finalizar, cancelar no local e entrada nas telas de voucher/finalizar.
export function useFinalizeFlow({ blockIfNotFirstPending, completingClearTimerRef, dados, driverContext, logAppError, receiveProofs, receiveStepPending, remoteMode, remoteOperation, selectedDetail, setCompletingDetailKey, setCriticalError, setReceiveProofs, setReceiveUploadedCounts, setRemoteOperation, setScreen, setSelectedDetail, setStore, setToast, store }: Options) {
  const [vehicleChoiceRequest, setVehicleChoiceRequest] = useState<{
    resolution: InfleetVehicleResolution;
    resolve: (choice: DriverVehicleChoice | null) => void;
    loadFleet: () => Promise<FleetVehicle[]>;
  } | null>(null);
  const [voucherDrafts, setVoucherDrafts] = useState<Record<string, Record<string, string>>>(() => loadVoucherDrafts());
  const [serviceObservationDrafts, setServiceObservationDrafts] = useState<Record<string, string>>(() => loadServiceObservationDrafts());
  const [maintenanceFinalizeDraft, setMaintenanceFinalizeDraft] = useState<MaintenanceFinalizeDraft>({ ...EMPTY_MAINTENANCE_FINALIZE_DRAFT });
  const finalizeTimerRef = useRef<number | null>(null);
  const voucherDraftTimerRef = useRef<number | null>(null);

  const getServiceObservationDraft = (detail: DetailData | null) => detail ? serviceObservationDrafts[getDetailDraftKey(detail)] ?? "" : "";

  const saveSelectedServiceObservation = async (observation: string) => {
    if (!selectedDetail || selectedDetail.type !== "SERVICO") return;
    const draftKey = getDetailDraftKey(selectedDetail);
    setServiceObservationDrafts((current) => ({ ...current, [draftKey]: observation }));
    if (remoteMode) await dados.salvarObservacao(selectedDetail, observation);
  };

  // Abre a escolha do carro e espera a resposta do motorista (null = voltou sem escolher).
  const askVehicleChoice = (resolution: InfleetVehicleResolution, loadFleet: () => Promise<FleetVehicle[]>) =>
    new Promise<DriverVehicleChoice | null>((resolve) => setVehicleChoiceRequest({ resolution, resolve, loadFleet }));

  const closeVehicleChoice = useCallback((choice: DriverVehicleChoice | null) => {
    setVehicleChoiceRequest((current) => {
      current?.resolve(choice);
      return null;
    });
  }, []);
  const cancelVehicleChoice = useCallback(() => closeVehicleChoice(null), [closeVehicleChoice]);

  const finalizeSelected = async (fields: Record<string, string>) => {
    if (!selectedDetail || remoteOperation) return;
    const detailToFinalize = selectedDetail;
    const agendaBeforeFinalize = store.agenda;
    const receiveProofCount = receiveProofs[detailToFinalize.id]?.length ?? 0;
    const finalFields =
      receiveProofCount > 0
        ? { ...fields, "Comprovantes de Recebimento": `${receiveProofCount} comprovante(s) anexado(s).` }
        : fields;
    const detailKey = `${detailToFinalize.type}:${detailToFinalize.id}`;
    const voucherDraftKey = getVoucherDraftKey(detailToFinalize);
    const isVoucher = detailToFinalize.type === "SERVICO" && ("Horario Inicial" in finalFields || "Horário Inicial" in finalFields);
    if (blockIfNotFirstPending(detailToFinalize)) return;

    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    if (completingClearTimerRef.current) window.clearTimeout(completingClearTimerRef.current);

    if (remoteMode) {
      const operationTitle =
        detailToFinalize.type === "SERVICO" && isVoucher
          ? "Enviando voucher"
          : detailToFinalize.type === "MANUTENCAO"
            ? "Enviando manutenção"
            : detailToFinalize.type === "TROCA"
              ? "Finalizando troca"
              : "Finalizando serviço";
      const setProgress = (message: string) => {
        setRemoteOperation({
          title: operationTitle,
          message,
          detailId: detailToFinalize.id,
          phase: "loading"
        });
      };
      const setSuccess = (message: string) => {
        setRemoteOperation({
          title: operationTitle,
          message,
          detailId: detailToFinalize.id,
          phase: "success"
        });
      };
      try {
        setProgress("Conferindo fila no Dataverse.");
        const remoteBeforeFinalize = await dados.carregarAgenda();
        const remoteFirstPendingDetail = detailToFinalize.type === "SERVICO"
          ? findFirstPendingServiceDetail(remoteBeforeFinalize.agenda)
          : undefined;
        setStore((current) => ({ ...current, agenda: remoteBeforeFinalize.agenda, history: remoteBeforeFinalize.history }));

        if (remoteFirstPendingDetail && !isSameDetail(remoteFirstPendingDetail, detailToFinalize)) {
          setRemoteOperation(null);
          setToast("Conclua os itens anteriores da fila antes de prosseguir.");
          setSelectedDetail(null);
          setScreen("servicos");
          return;
        }

        // Infleet decide o carro do serviço; abaixo de 85% o motorista escolhe. Falha da Infleet não bloqueia.
        let vehicleResolution: InfleetVehicleResolution | undefined;
        let vehicleChoice: DriverVehicleChoice | null = null;
        let skipVehicle = false;
        if (detailToFinalize.type === "SERVICO" && detailToFinalize.dataverse?.id) {
          setProgress("Conferindo o carro na Infleet.");
          const driver = driverContext ?? await getDriverContext();
          if (isThirdPartyDriver(driver?.funcionario)) {
            // Terceiro não usa a Infleet nem escolhe carro: a finalização não grava o veículo.
            skipVehicle = true;
          } else {
            vehicleResolution = await resolveServiceVehicleRemote(detailToFinalize.dataverse.id);
            if (needsDriverChoice(vehicleResolution)) {
              setRemoteOperation(null);
              vehicleChoice = await askVehicleChoice(vehicleResolution, loadActiveFleetRemote);
              if (!vehicleChoice) return;
              setProgress("Registrando o carro escolhido.");
            }
          }
        }

        const signatureDataUrl = store.signatures[detailToFinalize.id];
        const photos = store.photos[detailToFinalize.id];
        if (detailToFinalize.type === "SERVICO" && isVoucher) {
          await dados.salvarVoucher({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress, vehicleResolution, vehicleChoice, skipVehicle });
        } else if (detailToFinalize.type === "SERVICO") {
          await dados.finalizarServico({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress, vehicleResolution, vehicleChoice, skipVehicle });
        } else if (detailToFinalize.type === "MANUTENCAO") {
          await finalizeMaintenanceRemote({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress });
        } else if (detailToFinalize.type === "TROCA") {
          await finalizeExchangeRemote({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress });
        }
        setSuccess("Enviado com sucesso.");
        await wait(720);
      } catch (error) {
        logAppError(error, "finalizeSelected", detailToFinalize.type);
        setRemoteOperation(null);
        if (isVoucher) {
          setVoucherDrafts((current) => ({ ...current, [voucherDraftKey]: finalFields }));
        }
        if (detailToFinalize.type === "TROCA") setToast(exchangeUserError(error), "error");
        else setCriticalError(APP_OPERATION_ERROR_MESSAGE);
        return;
      }

      setStore((current) => {
        const signatures = { ...current.signatures };
        const photos = { ...current.photos };
        delete signatures[detailToFinalize.id];
        delete photos[detailToFinalize.id];
        return { ...current, signatures, photos };
      });
      setReceiveProofs((current) => {
        if (!current[detailToFinalize.id]) return current;
        const next = { ...current };
        delete next[detailToFinalize.id];
        return next;
      });
    } else if (detailToFinalize.type === "SERVICO") {
      // Mock local: simula a Infleet para testar a UI sem Dataverse. Cenário por ?mockInfleet=.
      const scenario = pickMockInfleetScenario(detailToFinalize.id);
      setRemoteOperation({ title: "Finalizando serviço", message: "Conferindo o carro na Infleet.", detailId: detailToFinalize.id, phase: "loading" });
      const resolution = await resolveMockServiceVehicle(scenario);
      setRemoteOperation(null);
      let choice: DriverVehicleChoice | null = null;
      if (needsDriverChoice(resolution)) {
        const loadMockFleet = createMockFleetLoader(scenario);
        // Terceiro sem carro cadastrado: a lista dele vem vazia e o diálogo oferece a frota ativa.
        choice = await askVehicleChoice(resolution, resolution.motivo === "motorista-terceiro"
          ? async () => {
              const mine = await loadMockFleet();
              return mine.length > 0 ? mine : MOCK_FLEET;
            }
          : loadMockFleet);
        if (!choice) return;
        if (resolution.motivo === "motorista-terceiro") choice = { ...choice, origem: "terceiro" };
      }
      const patch = buildInfleetServiceVehiclePatch(resolution, choice, (vehicleId) => vehicleId);
      const outcome = resolution.decisao === "automatico"
        ? `automático: ${resolution.escolhido?.placa} (${resolution.escolhido?.percentual}%)`
        : `escolhido pelo motorista (${choice?.origem === "frota" ? "frota" : choice?.origem === "terceiro" ? "carros do terceiro" : "carros da janela"}): ${choice?.placa}`;
      console.info("[mock Infleet]", scenario, patch);
      setToast(`Teste Infleet (${scenario}) · ${outcome}`, "success");
    }

    setCompletingDetailKey(detailKey);
    setVoucherDrafts((current) => {
      if (!current[voucherDraftKey]) return current;
      const next = { ...current };
      delete next[voucherDraftKey];
      return next;
    });
    if (detailToFinalize.type === "MANUTENCAO") {
      setMaintenanceFinalizeDraft({ serviceDone: "", value: "", payment: "", cidadeId: "", establishment: "", notes: "" });
    }
    setSelectedDetail(null);
    setScreen("servicos");

    finalizeTimerRef.current = window.setTimeout(() => {
      if (remoteMode) {
        setStore((current) => ({
          ...current,
          agenda: removeAgendaDetail(current.agenda, detailToFinalize)
        }));
      } else {
        setStore((current) => finalizeDetailLocally(current, detailToFinalize, finalFields));
        setReceiveProofs((current) => {
          if (!current[detailToFinalize.id]) return current;
          const next = { ...current };
          delete next[detailToFinalize.id];
          return next;
        });
        setReceiveUploadedCounts((current) => {
          if (!current[detailToFinalize.id]) return current;
          const next = { ...current };
          delete next[detailToFinalize.id];
          return next;
        });
      }
      setRemoteOperation(null);
      finalizeTimerRef.current = null;
      setCompletingDetailKey("");
      completingClearTimerRef.current = null;

      if (!remoteMode) return;

      void Promise.race([
        dados.carregarAgenda(),
        wait(8000).then(() => {
          throw new Error("Falha ao confirmar a atualização da agenda no Dataverse.");
        })
      ])
        .then((remote) => {
          setStore((current) => ({
            ...current,
            agenda: removeAgendaDetail(remote.agenda, detailToFinalize),
            history: remote.history
          }));
          setReceiveProofs((current) => {
            if (!current[detailToFinalize.id]) return current;
            const next = { ...current };
            delete next[detailToFinalize.id];
            return next;
          });
          setReceiveUploadedCounts((current) => {
            if (!current[detailToFinalize.id]) return current;
            const next = { ...current };
            delete next[detailToFinalize.id];
            return next;
          });
        })
        .catch((error) => {
          reportAppError(error, {
            source: "app", action: "finalizeSelected", phase: "confirm-agenda-after-finalize", screen: "servicos",
            detailId: detailToFinalize.id, detailType: detailToFinalize.type,
            payload: { dataverseId: detailToFinalize.dataverse?.id, timeoutMs: 8000, restoredToAgenda: true }, notifyUser: false
          });
          setStore((current) => ({
            ...current,
            agenda: current.agenda.some((item) => item.detail?.id === detailToFinalize.id && item.detail?.type === detailToFinalize.type)
              ? current.agenda
              : agendaBeforeFinalize
          }));
          setCriticalError(
            `${error instanceof Error ? error.message : "Falha ao atualizar a agenda."} O serviço voltou para a galeria. Finalize novamente.`
          );
        });
    }, 1650);
  };

  const cancelSelected = async (reason: string) => {
    if (!selectedDetail || remoteOperation) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setToast("Informe o motivo do cancelamento.");
      return;
    }
    const detailToCancel = selectedDetail;
    if (detailToCancel.type === "TROCA") {
      reportAppError(new Error("[FORBIDDEN_LIFECYCLE] Motorista não pode cancelar troca."), {
        severity: "warning",
        source: "app",
        action: "cancelSelected",
        detailId: detailToCancel.id,
        detailType: detailToCancel.type
      });
      setToast("Cancelamento de troca deve ser solicitado à Operação.", "warning");
      setScreen("servicos");
      return;
    }
    if (remoteMode) {
      try {
        setRemoteOperation({
          title: "Enviando cancelamento",
          message: "Atualizando status no Dataverse.",
          detailId: detailToCancel.id,
          phase: "loading"
        });
        await cancelServiceRemote(detailToCancel, trimmedReason);
        setRemoteOperation({
          title: "Enviando cancelamento",
          message: "Enviado com sucesso.",
          detailId: detailToCancel.id,
          phase: "success"
        });
        await wait(720);
        setSelectedDetail(null);
        setScreen("servicos");
        setToast("Cancelamento enviado para analise.");
        setReceiveProofs((current) => {
          if (!current[detailToCancel.id]) return current;
          const next = { ...current };
          delete next[detailToCancel.id];
          return next;
        });
        setReceiveUploadedCounts((current) => {
          if (!current[detailToCancel.id]) return current;
          const next = { ...current };
          delete next[detailToCancel.id];
          return next;
        });
        dados.carregarAgenda()
          .then((remote) => setStore((current) => ({ ...current, agenda: remote.agenda, history: remote.history })))
          .catch((error) => {
            reportAppError(error, {
              severity: "error",
              source: "app",
              action: "loadRemoteStore",
              phase: "after-cancel",
              screen: "servicos",
              detailId: detailToCancel.id,
              detailType: detailToCancel.type
            });
            setToast(error instanceof Error ? error.message : "Cancelado, mas falhou ao atualizar a agenda.");
          })
          .finally(() => {
            setRemoteOperation(null);
          });
        return;
      } catch (error) {
        logAppError(error, "cancelSelected", detailToCancel.type);
        setRemoteOperation(null);
        setToast(error instanceof Error ? error.message : "Falha ao cancelar no Dataverse.");
        return;
      }
    }
    const next = cancelDetailLocally(store, detailToCancel, trimmedReason);
    setStore(next);
    setReceiveProofs((current) => {
      if (!current[detailToCancel.id]) return current;
      const copy = { ...current };
      delete copy[detailToCancel.id];
      return copy;
    });
    setReceiveUploadedCounts((current) => {
      if (!current[detailToCancel.id]) return current;
      const copy = { ...current };
      delete copy[detailToCancel.id];
      return copy;
    });
    setSelectedDetail(null);
    setScreen("servicos");
    setToast("Cancelado localmente.");
  };

  const saveVoucherDraft = (fields: Record<string, string>) => {
    if (!selectedDetail || selectedDetail.type !== "SERVICO") return;
    const detail = selectedDetail;
    setVoucherDrafts((current) => {
      const draftKey = getVoucherDraftKey(detail);
      if (Object.keys(fields).length === 0) {
        if (!current[draftKey]) return current;
        const next = { ...current };
        delete next[draftKey];
        return next;
      }
      return {
        ...current,
        [draftKey]: fields
      };
    });

    if (!remoteMode) return;
    if (voucherDraftTimerRef.current) window.clearTimeout(voucherDraftTimerRef.current);
    voucherDraftTimerRef.current = window.setTimeout(() => {
      dados.salvarRascunhoVoucher(detail, fields).catch((error) => {
        reportAppError(error, {
          severity: "error",
          source: "app",
          action: "saveVoucherDraftRemote",
          phase: "debounced-save",
          screen: "voucher",
          detailId: detail.id,
          detailType: detail.type
        });
        setToast(error instanceof Error ? error.message : "Falha ao salvar rascunho do voucher.");
      });
    }, 450);
  };

  const openVoucherFlow = () => {
    if (!selectedDetail) return;
    if (blockIfNotFirstPending(selectedDetail)) return;
    if (receiveStepPending(selectedDetail)) {
      setScreen("receber");
      return;
    }
    setScreen("voucher");
  };

  const openFinalizeFlow = (serviceObservation?: string) => {
    if (!selectedDetail) return;
    const detailForFlow = selectedDetail;
    if (selectedDetail.type === "SERVICO" && serviceObservation !== undefined) {
      setServiceObservationDrafts((current) => ({ ...current, [getDetailDraftKey(selectedDetail)]: serviceObservation }));
    }
    if (blockIfNotFirstPending(detailForFlow)) return;
    if (receiveStepPending(detailForFlow)) {
      setScreen("receber");
      return;
    }
    setScreen("finalizar");
  };

  const openLocalCancelFlow = () => {
    if (!selectedDetail) return;
    if (blockIfNotFirstPending(selectedDetail)) return;
    setScreen("canceladoLocal");
  };

  return {
    cancelSelected,
    cancelVehicleChoice,
    closeVehicleChoice,
    finalizeSelected,
    finalizeTimerRef,
    getServiceObservationDraft,
    maintenanceFinalizeDraft,
    openFinalizeFlow,
    openLocalCancelFlow,
    openVoucherFlow,
    saveSelectedServiceObservation,
    saveVoucherDraft,
    setMaintenanceFinalizeDraft,
    setServiceObservationDrafts,
    setVoucherDrafts,
    vehicleChoiceRequest,
    voucherDraftTimerRef,
    voucherDrafts
  };
}
