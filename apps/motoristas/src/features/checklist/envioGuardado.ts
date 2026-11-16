// Checklist guardado no aparelho: sobe as fotos que faltam e conclui. Cada foto enviada é gravada na hora (`gravarEnviadas`),
// então uma queda no meio continua das fotos já salvas; concluir é idempotente no plugin (checklist já concluído não muda).
import { buildChecklistRespostasJson, checklistPhotoItems, type ChecklistDraft, type ChecklistFotoEnviada } from "./checklists.ts";
import type { ChecklistGuardado } from "../envio-pendente/fila.ts";

export type DependenciasChecklist = {
  enviarFoto: (args: { checklistId: string; placa: string; solicitadoEm: string; itemLabel: string; order: number; dataUrl: string }) => Promise<ChecklistFotoEnviada>;
  concluir: (checklistId: string, respostasJson: string) => Promise<unknown>;
  /** Persiste os links já enviados (no item da fila) antes de seguir para a próxima foto. */
  gravarEnviadas: (enviadas: NonNullable<ChecklistDraft["enviadas"]>) => Promise<void>;
};

export async function enviarChecklistGuardado(guardado: ChecklistGuardado, deps: DependenciasChecklist) {
  let working: ChecklistDraft = guardado.draft;
  const fila = checklistPhotoItems(guardado.itens, working)
    .flatMap((item) => (working.fotos[item.chave] ?? []).map((photo, index) => ({ item, photo, order: index + 1 })));
  for (const { item, photo, order } of fila) {
    if (working.enviadas?.[photo.id]) continue;
    const enviada = await deps.enviarFoto({ checklistId: guardado.checklistId, placa: guardado.placa, solicitadoEm: guardado.solicitadoEm, itemLabel: item.rotulo, order, dataUrl: photo.dataUrl });
    working = { ...working, enviadas: { ...(working.enviadas ?? {}), [photo.id]: enviada } };
    await deps.gravarEnviadas(working.enviadas ?? {});
  }
  const enviadas: Record<string, ChecklistFotoEnviada[]> = {};
  for (const { item, photo } of fila) {
    const enviada = working.enviadas?.[photo.id];
    if (enviada) enviadas[item.chave] = [...(enviadas[item.chave] ?? []), enviada];
  }
  await deps.concluir(guardado.checklistId, buildChecklistRespostasJson(guardado.itens, working, enviadas));
}
