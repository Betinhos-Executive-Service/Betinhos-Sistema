import { lerPdfAssinado, registrarMeuAditivo } from "./termosMulta";

type Destino = "inicio";

/**
 * Tela avulsa do aditivo: confirmar (servidor registrou o PDF) e voltar são coisas diferentes.
 * Só a confirmação tira o cartão da Home; "Voltar" apenas navega e o cartão continua até o servidor responder que há aditivo.
 */
export function acoesTelaAditivo(
  onAditivoConfirmado: () => void,
  setScreen: (destino: Destino) => void
): { onConfirmado: () => void; onBack: () => void } {
  return { onConfirmado: onAditivoConfirmado, onBack: () => setScreen("inicio") };
}

/** Lê o PDF devolvido pelo gov.br, registra no servidor e só então avisa a confirmação; qualquer falha sobe sem avisar. */
export async function enviarAditivoAssinado(
  file: File,
  onConfirmado?: () => void,
  deps: { ler: (file: File) => Promise<string>; registrar: (base64: string) => Promise<void> } = { ler: lerPdfAssinado, registrar: registrarMeuAditivo }
): Promise<void> {
  await deps.registrar(await deps.ler(file));
  onConfirmado?.();
}
