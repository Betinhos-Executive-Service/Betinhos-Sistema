import { lerPdfAssinado, registrarMeuAditivo } from "./termosMulta";

/** Lê o PDF devolvido pelo gov.br, registra no servidor e só então avisa a confirmação; qualquer falha sobe sem avisar. */
export async function enviarAditivoAssinado(
  file: File,
  onConfirmado?: () => void,
  deps: { ler: (file: File) => Promise<string>; registrar: (base64: string) => Promise<void> } = { ler: lerPdfAssinado, registrar: registrarMeuAditivo }
): Promise<void> {
  await deps.registrar(await deps.ler(file));
  onConfirmado?.();
}
