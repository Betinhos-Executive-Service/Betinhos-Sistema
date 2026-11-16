// Envio de um item da fila ao Dataverse: resolve o carro (Infleet), grava com o horário capturado no aparelho e deixa o reenvio idempotente.
import type { FinalizePayload } from "../finalizar/remoto";
import { needsDriverChoice, type InfleetVehicleResolution } from "../../lib/serviceVehicleInfleet.ts";
import type { FilaItem } from "./fila";
import { PrecisaEscolherCarro } from "./processador.ts";

export type DependenciasEnvio = {
  salvarVoucher: (payload: FinalizePayload) => Promise<unknown>;
  finalizarServico: (payload: FinalizePayload) => Promise<unknown>;
  resolverVeiculo: (dataverseId: string) => Promise<InfleetVehicleResolution>;
  /** Motorista terceiro não usa a Infleet nem escolhe carro. */
  ehTerceiro: () => Promise<boolean>;
  /** Grava no item o link do voucher lido antes do primeiro POST. */
  guardarLinkAnterior?: (item: FilaItem, link: string) => Promise<void>;
};

export function criarEnviador(deps: DependenciasEnvio) {
  return async (item: FilaItem): Promise<void> => {
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
