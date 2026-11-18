import { useSyncExternalStore } from "react";
import { filaDeEnvio } from "./fila";

/** Itens da fila de envio do aparelho, atualizados na tela quando mudam. */
export const useFilaEnvio = () => useSyncExternalStore(filaDeEnvio.subscribe, filaDeEnvio.getSnapshot);
