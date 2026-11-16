// Envio de um item da fila ao Dataverse: resolve o carro (Infleet), grava com o horário capturado no aparelho e deixa o reenvio idempotente.
import type { FinalizePayload } from "../finalizar/remoto";
import { needsDriverChoice, type InfleetVehicleResolution } from "../../lib/serviceVehicleInfleet.ts";
import { enviarChecklistGuardado, type DependenciasChecklist } from "../checklist/envioGuardado.ts";
import type { FilaItem } from "./fila";
import { PrecisaEscolherCarro } from "./processador.ts";

export type DependenciasEnvio = {
  salvarVoucher: (payload: FinalizePayload) => Promise<unknown>;
  finalizarServico: (payload: FinalizePayload) => Promise<unknown>;
  finalizarManutencao: (payload: FinalizePayload) => Promise<unknown>;
  confirmarTroca: (payload: FinalizePayload) => Promise<unknown>;
  enviarFotoChecklist: DependenciasChecklist["enviarFoto"];
  concluirChecklist: DependenciasChecklist["concluir"];
  /** Grava no item os links das fotos do checklist já enviadas. */
  guardarFotosChecklist?: (item: FilaItem, enviadas: NonNullable<NonNullable<FilaItem["checklist"]>["draft"]["enviadas"]>) => Promise<void>;
  resolverVeiculo: (dataverseId: string) => Promise<InfleetVehicleResolution>;
  /** Motorista terceiro não usa a Infleet nem escolhe carro. */
  ehTerceiro: () => Promise<boolean>;
  /** Grava no item o link do voucher lido antes do primeiro POST. */
  guardarLinkAnterior?: (item: FilaItem, link: string) => Promise<void>;
};

export function criarEnviador(deps: DependenciasEnvio) {
  return async (item: FilaItem): Promise<void> => {
    if (item.tipo === "checklist") {
      if (!item.checklist) throw new Error("Checklist guardado sem dados.");
      await enviarChecklistGuardado(item.checklist, {
        enviarFoto: deps.enviarFotoChecklist,
        concluir: deps.concluirChecklist,
        gravarEnviadas: (enviadas) => deps.guardarFotosChecklist?.(item, enviadas) ?? Promise.resolve()
      });
      return;
    }
    if (!item.detail) throw new Error("Envio guardado sem o detalhe do serviço.");
    // Manutenção e troca não usam o carro da Infleet: seguem direto, conferindo o estado remoto antes (reenvio).
    if (item.tipo === "manutencao" || item.tipo === "troca") {
      const reenvio: FinalizePayload = { detail: item.detail, fields: item.fields, signatureDataUrl: item.signatureDataUrl, photos: item.photos, finalizadoEm: item.finalizadoEm, reenvio: true };
      await (item.tipo === "manutencao" ? deps.finalizarManutencao(reenvio) : deps.confirmarTroca(reenvio));
      return;
    }
    let { vehicleResolution, vehicleChoice, skipVehicle } = item;
    if (!skipVehicle) {
      if (!vehicleResolution) {
        if (await deps.ehTerceiro()) skipVehicle = true;
        else vehicleResolution = await deps.resolverVeiculo(item.dataverseId);
      }
      // Sem escolha anterior do motorista e abaixo do limite da Infleet: o indicador leva ao diálogo de escolha.
      if (vehicleResolution && needsDriverChoice(vehicleResolution) && !vehicleChoice) throw new PrecisaEscolherCarro(vehicleResolution);
    }
    const payload: FinalizePayload = {
      detail: item.detail,
      fields: item.fields,
      signatureDataUrl: item.signatureDataUrl,
      photos: item.photos,
      vehicleResolution,
      vehicleChoice,
      skipVehicle,
      finalizadoEm: item.finalizadoEm,
      linkAnterior: item.linkAnterior,
      onLinkAnterior: (link) => deps.guardarLinkAnterior?.(item, link)
    };
    if (item.tipo === "voucher") await deps.salvarVoucher(payload);
    else await deps.finalizarServico(payload);
  };
}
