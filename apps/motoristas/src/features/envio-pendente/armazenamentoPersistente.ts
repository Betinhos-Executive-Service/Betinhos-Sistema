// Pede ao navegador que não apague o armazenamento do app sob pouco espaço (fila de envio e rascunhos de mídia).
// Uma vez por sessão, sem bloquear nem avisar o motorista se negar; só um erro lançado vai para o log.
import { reportAppError } from "../../shared/appErrorLogger.ts";

type StorageLike = { persist?: () => Promise<boolean> };

let pedido = false;

const registrarFalha = (error: unknown) =>
  reportAppError(error, { severity: "warning", source: "app", action: "pedirArmazenamentoPersistente", phase: "storage", notifyUser: false });


export function pedirArmazenamentoPersistente(
  storage: StorageLike | undefined = typeof navigator === "undefined" ? undefined : navigator.storage,
  aoFalhar: (error: unknown) => void = registrarFalha
): Promise<void> {
  if (pedido || !storage?.persist) return Promise.resolve();
  pedido = true;
  return Promise.resolve()
    .then(() => storage.persist!())
    .then(() => undefined, aoFalhar);
}

export function reiniciarPedidoDeArmazenamentoPersistente() {
  pedido = false;
}
