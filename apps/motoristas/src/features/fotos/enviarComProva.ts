import { uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";
import { provaCaptura } from "./provaCaptura.ts";

/** Envia pelo flow e, com o link na mão, registra a prova da captura sem esperar: falha nela nunca derruba o envio. */
export async function uploadMediaWithProof(...args: Parameters<typeof uploadMaintenancePhoto>) {
  const link = await uploadMaintenancePhoto(...args);
  void provaCaptura().registrarArquivo(args[1], link);
  return link;
}
