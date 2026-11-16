import { uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";
import { provaCaptura } from "./provaCaptura.ts";

type Upload = Parameters<typeof uploadMaintenancePhoto>;

/**
 * Envia pelo flow e, com o link na mão, registra a prova da captura sem esperar: falha nela nunca derruba o envio.
 * `destino`: tabela e id real do registro que recebe o arquivo (registro novo: troca o id provisório da sessão).
 */
export async function uploadMediaWithProof(path: Upload[0], dataUrl: Upload[1], fileNameBase: Upload[2], metadata: Upload[3], destino?: { tabela: string; registroId: string }) {
  const link = await uploadMaintenancePhoto(path, dataUrl, fileNameBase, metadata);
  void provaCaptura().registrarArquivo(dataUrl, link, destino);
  return link;
}
