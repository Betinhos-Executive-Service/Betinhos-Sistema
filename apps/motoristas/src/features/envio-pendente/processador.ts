// Processador da fila: um envio por vez, em ordem de chegada, com trava contra execução dupla e espera crescente entre tentativas.
import type { InfleetVehicleResolution } from "../../lib/serviceVehicleInfleet.ts";
import { classificarErro } from "./classificarErro.ts";
import type { Fila, FilaItem } from "./fila";

// O enviador lança isto quando o carro do serviço precisa da escolha do motorista.
export class PrecisaEscolherCarro extends Error {
  readonly resolution: InfleetVehicleResolution;
  constructor(resolution: InfleetVehicleResolution) {
    super("Escolha o carro usado no serviço.");
    this.name = "PrecisaEscolherCarro";
    this.resolution = resolution;
  }
}

export const MENSAGEM_SESSAO = "Entre de novo para enviar";
const ESPERA_BASE_MS = 15_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

export const esperaDaTentativa = (tentativas: number) => Math.min(ESPERA_MAXIMA_MS, ESPERA_BASE_MS * 2 ** Math.max(0, tentativas - 1));

export type ResultadoProcessamento = { enviados: FilaItem[]; executou: boolean };

type Deps = {
  fila: Fila;
  enviar: (item: FilaItem) => Promise<void>;
  /** Chamado depois do envio confirmado e da remoção da fila. */
  aoEnviar?: (item: FilaItem) => void | Promise<void>;
  aoErro?: (item: FilaItem, error: unknown, classe: "rede" | "sessao" | "negocio" | "carro") => void;
  estaOnline?: () => boolean;
  agora?: () => number;
  /** Trava entre abas/execuções; padrão: navigator.locks quando existe, senão uma flag. */
  comTrava?: <T>(executar: () => Promise<T>) => Promise<T | undefined>;
};

function criarTravaPadrao() {
  let ocupado = false;
  return async <T,>(executar: () => Promise<T>): Promise<T | undefined> => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks?.request) {
      return locks.request("app-motoristas-envio-pendente", { ifAvailable: true }, async (lock) => (lock ? executar() : undefined));
    }
    if (ocupado) return undefined;
    ocupado = true;
    try {
      return await executar();
    } finally {
      ocupado = false;
    }
  };
}

export function createProcessador({ fila, enviar, aoEnviar, aoErro, estaOnline = () => typeof navigator === "undefined" || navigator.onLine !== false, agora = Date.now, comTrava = criarTravaPadrao() }: Deps) {
  /** `forcar` ignora a espera entre tentativas (evento online, app voltou ao primeiro plano). */
  async function processar(forcar = false): Promise<ResultadoProcessamento> {
    const resultado = await comTrava(async () => {
      await fila.sincronizar();
      const enviados: FilaItem[] = [];
      for (const inicial of fila.getSnapshot()) {
        if (!estaOnline()) break;
        if (inicial.estado !== "pendente") continue;
        // Ordem de chegada: o item esperando a próxima tentativa segura os seguintes (a rede é a mesma para todos).
        if (!forcar && (inicial.proximaTentativaEm ?? 0) > agora()) break;
        const tentativas = inicial.tentativas + 1;
        const item = (await fila.atualizar(inicial.id, { estado: "enviando", tentativas })) ?? inicial;
        try {
          await enviar(item);
        } catch (error) {
          if (error instanceof PrecisaEscolherCarro) {
            const parado = await fila.atualizar(item.id, { estado: "precisa-acao", motivo: "carro", vehicleResolution: error.resolution, ultimoErro: error.message });
            aoErro?.(parado ?? item, error, "carro");
            continue;
          }
          const classe = classificarErro(error, estaOnline());
          const mensagem = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error);
          if (classe === "rede") {
            const esperando = await fila.atualizar(item.id, { estado: "pendente", ultimoErro: mensagem, proximaTentativaEm: agora() + esperaDaTentativa(tentativas) });
            aoErro?.(esperando ?? item, error, classe);
            break;
          }
          if (classe === "sessao") {
            const parado = await fila.atualizar(item.id, { estado: "precisa-acao", motivo: "sessao", ultimoErro: MENSAGEM_SESSAO });
            aoErro?.(parado ?? item, error, classe);
            break;
          }
          const falhou = await fila.atualizar(item.id, { estado: "falhou", ultimoErro: mensagem });
          aoErro?.(falhou ?? item, error, classe);
          continue;
        }
        await fila.remover(item.id);
        enviados.push(item);
        await aoEnviar?.(item);
      }
      return enviados;
    });
    return { enviados: resultado ?? [], executou: resultado !== undefined };
  }
  return { processar };
}
