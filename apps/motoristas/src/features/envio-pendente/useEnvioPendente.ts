import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PortaDados } from "../../data/porta";
import { getDriverContext } from "../../data/dataverse/cliente";
import { getVoucherDraftKey } from "../../app/bootstrap";
import { finalizeDetailLocally, removeAgendaDetail, type LocalStore } from "../../lib/localWorkflow";
import type { DriverVehicleChoice, FleetVehicle, InfleetVehicleResolution } from "../../lib/serviceVehicleInfleet";
import { MOCK_FLEET } from "../../lib/serviceVehicleInfleetMock";
import { wait } from "../../shared/wait";
import type { ToastTone } from "../../shared/ui/LocalToast";
import type { ExpensePhoto } from "../despesas/expenses";
import { finalizeExchangeRemote, finalizeMaintenanceRemote, resolveServiceVehicleRemote } from "../finalizar/remoto";
import { checklistDraftKey } from "../checklist/checklists";
import { clearMediaDraft } from "../fotos/mediaDraftStore";
import { removerDaAgendaOffline } from "../servicos/agendaOffline";
import { loadActiveFleetRemote } from "../meu-carro/remoto";
import { isThirdPartyDriver } from "../meu-carro/myVehicle";
import { criarEnviador } from "./enviador";
import { filaDeEnvio, type FilaItem } from "./fila";
import { createProcessador } from "./processador";
import { useFilaEnvio } from "./useFilaEnvio";

type Options = {
  /** Fila ligada: Dataverse real ou mock local. */
  ativo: boolean;
  askVehicleChoice: (resolution: InfleetVehicleResolution, loadFleet: () => Promise<FleetVehicle[]>) => Promise<DriverVehicleChoice | null>;
  dados: PortaDados;
  /** Chamado depois que um checklist guardado é concluído, para a lista de checklists atualizar. */
  aoConcluirChecklist?: () => void;
  remoteMode: boolean;
  setReceiveProofs: Dispatch<SetStateAction<Record<string, ExpensePhoto[]>>>;
  setReceiveUploadedCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setStore: Dispatch<SetStateAction<LocalStore>>;
  setToast: (message: string, tone?: ToastTone) => void;
  setVoucherDrafts: Dispatch<SetStateAction<Record<string, Record<string, string>>>>;
};

const INTERVALO_MS = 60_000;

const MENSAGEM_ENVIADO: Record<FilaItem["tipo"], (titulo: string) => string> = {
  voucher: (titulo) => `Voucher da ${titulo} enviado`,
  servico: (titulo) => `Serviço da ${titulo} finalizado`,
  manutencao: (titulo) => `Manutenção da ${titulo} enviada`,
  troca: (titulo) => `Troca da ${titulo} confirmada`,
  checklist: (titulo) => `Checklist do ${titulo} enviado`
};

const subscribeOnline = (aviso: () => void) => {
  window.addEventListener("online", aviso);
  window.addEventListener("offline", aviso);
  return () => {
    window.removeEventListener("online", aviso);
    window.removeEventListener("offline", aviso);
  };
};
const getOnline = () => navigator.onLine !== false;

const semChave = <T,>(mapa: Record<string, T>, chave: string) => {
  if (!(chave in mapa)) return mapa;
  const proximo = { ...mapa };
  delete proximo[chave];
  return proximo;
};

// Envia o que o motorista finalizou sem conexão: ao abrir o app, quando a rede volta, ao voltar para o app e a cada minuto enquanto houver pendente.
export function useEnvioPendente(options: Options) {
  const ref = useRef(options);
  ref.current = options;
  const itens = useFilaEnvio();
  const online = useSyncExternalStore(subscribeOnline, getOnline);

  const processadorRef = useRef<ReturnType<typeof createProcessador> | null>(null);
  processadorRef.current ??= createProcessador({
    fila: filaDeEnvio,
    enviar: (() => {
      const remoto = criarEnviador({
        salvarVoucher: (payload) => ref.current.dados.salvarVoucher(payload),
        finalizarServico: (payload) => ref.current.dados.finalizarServico(payload),
        finalizarManutencao: finalizeMaintenanceRemote,
        confirmarTroca: finalizeExchangeRemote,
        enviarFotoChecklist: (args) => ref.current.dados.enviarFotoChecklist(args),
        concluirChecklist: (id, respostasJson) => ref.current.dados.concluirChecklist(id, respostasJson),
        guardarFotosChecklist: async (item, enviadas) => {
          if (item.checklist) await filaDeEnvio.atualizar(item.id, { checklist: { ...item.checklist, draft: { ...item.checklist.draft, enviadas } } });
        },
        resolverVeiculo: resolveServiceVehicleRemote,
        guardarLinkAnterior: (item, linkAnterior) => filaDeEnvio.atualizar(item.id, { linkAnterior }).then(() => undefined),
        ehTerceiro: async () => isThirdPartyDriver((await getDriverContext())?.funcionario)
      });
      // Mock local: envio simulado para provar a fila sem Dataverse.
      return (item: FilaItem) => (ref.current.remoteMode ? remoto(item) : wait(1200).then(() => undefined));
    })(),
    aoEnviar: (item) => {
      try {
        const { aoConcluirChecklist, dados, remoteMode, setReceiveProofs, setReceiveUploadedCounts, setStore, setToast, setVoucherDrafts } = ref.current;
        const { detail } = item;
        if (!detail) {
          // Checklist: o rascunho do formulário já cumpriu o papel; a lista recarrega para mostrar o concluído.
          void clearMediaDraft(checklistDraftKey(item.checklist?.checklistId ?? item.detailId)).catch(() => undefined);
          setToast(MENSAGEM_ENVIADO.checklist(item.titulo), "success");
          aoConcluirChecklist?.();
          return;
        }
        removerDaAgendaOffline(detail.id);
        setVoucherDrafts((atual) => semChave(atual, getVoucherDraftKey(detail)));
        setReceiveProofs((atual) => semChave(atual, detail.id));
        setReceiveUploadedCounts((atual) => semChave(atual, detail.id));
        setStore((atual) => {
          const signatures = semChave(atual.signatures, detail.id);
          const photos = semChave(atual.photos, detail.id);
          return remoteMode
            ? { ...atual, agenda: removeAgendaDetail(atual.agenda, detail), signatures, photos }
            : { ...finalizeDetailLocally(atual, detail, item.fields), signatures, photos };
        });
        setToast(MENSAGEM_ENVIADO[item.tipo](item.titulo), "success");
        if (remoteMode) {
          // O envio já foi confirmado: a recarga só traz o resto da agenda e nunca devolve este serviço.
          dados.carregarAgenda()
            .then((remote) => setStore((atual) => ({ ...atual, agenda: removeAgendaDetail(remote.agenda, detail), history: remote.history })))
            .catch(() => undefined);
        }
      } catch {
        // A fila já removeu o item; falha ao atualizar a tela não pode parar os próximos envios.
      }
    }
  });

  const rodar = useCallback((forcar: boolean) => {
    void processadorRef.current?.processar(forcar).catch(() => undefined);
  }, []);

  useEffect(() => {
    void filaDeEnvio.carregar().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!options.ativo) return;
    rodar(true);
    const aoVoltarRede = () => rodar(true);
    const aoVoltarAoApp = () => { if (document.visibilityState === "visible") rodar(true); };
    const intervalo = window.setInterval(() => {
      if (filaDeEnvio.getSnapshot().some((item) => item.estado === "pendente")) rodar(false);
    }, INTERVALO_MS);
    window.addEventListener("online", aoVoltarRede);
    document.addEventListener("visibilitychange", aoVoltarAoApp);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("online", aoVoltarRede);
      document.removeEventListener("visibilitychange", aoVoltarAoApp);
    };
  }, [options.ativo, rodar]);

  const tentarDeNovo = useCallback(async (item: FilaItem) => {
    await filaDeEnvio.atualizar(item.id, { estado: "pendente", motivo: undefined, ultimoErro: undefined, proximaTentativaEm: undefined });
    rodar(true);
  }, [rodar]);

  const escolherCarro = useCallback(async (item: FilaItem) => {
    if (!item.vehicleResolution) return;
    const { askVehicleChoice, remoteMode } = ref.current;
    const choice = await askVehicleChoice(item.vehicleResolution, remoteMode ? loadActiveFleetRemote : async () => MOCK_FLEET);
    if (!choice) return;
    await filaDeEnvio.atualizar(item.id, { vehicleChoice: choice, estado: "pendente", motivo: undefined, ultimoErro: undefined, proximaTentativaEm: undefined });
    rodar(true);
  }, [rodar]);

  // Descartar devolve o serviço à agenda como estava (assinatura e rascunho continuam no aparelho).
  const descartar = useCallback((item: FilaItem) => filaDeEnvio.remover(item.id), []);

  return { descartar, escolherCarro, itens, online, rodar, tentarDeNovo };
}

export type EnvioPendente = ReturnType<typeof useEnvioPendente>;
