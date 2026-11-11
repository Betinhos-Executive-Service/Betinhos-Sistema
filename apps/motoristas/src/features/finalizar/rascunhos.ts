import type { ExpensePhoto } from "../despesas/expenses";
import { reportAppError } from "../../shared/appErrorLogger";
import type { LocalStore } from "../../lib/localWorkflow";
import type { DetailData } from "../../types";

// Rascunhos guardados no aparelho (localStorage) até o serviço ser enviado:
// observação, voucher, assinatura, fotos da finalização e comprovantes de recebimento.
export const VOUCHER_DRAFTS_STORAGE_KEY = "app-motoristas-voucher-drafts-v1";
export const FINALIZE_DRAFT_ASSETS_STORAGE_KEY = "app-motoristas-finalize-draft-assets-v1";
export const SERVICE_OBSERVATION_DRAFTS_KEY = "app-motoristas-service-observation-drafts-v1";

export type PersistedReceiveProof = Omit<ExpensePhoto, "previewUrl" | "rawBlob">;

export type PersistedFinalizeDraftAssets = {
  signatures: Record<string, string>;
  photos: LocalStore["photos"];
  receiveProofs: Record<string, PersistedReceiveProof[]>;
};

export function getDetailDraftKey(detail: DetailData) {
  return `${detail.type}:${detail.dataverse?.id ?? detail.id}`;
}

export function loadServiceObservationDrafts(storage: Storage = window.localStorage): Record<string, string> {
  try {
    const raw = storage.getItem(SERVICE_OBSERVATION_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => key && typeof value === "string")
      .map(([key, value]) => [key, value] as const);
    return Object.fromEntries(entries) as Record<string, string>;
  } catch (error) {
    reportAppError(error, { severity: "warning", source: "app", action: "loadServiceObservationDrafts", phase: "localStorage", notifyUser: false });
    return {};
  }
}

export function loadVoucherDrafts(storage: Storage = window.localStorage): Record<string, Record<string, string>> {
  try {
    const raw = storage.getItem(VOUCHER_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => key && value && typeof value === "object" && !Array.isArray(value))
      .map(([key, value]) => {
        const draftEntries = Object.entries(value as Record<string, unknown>)
          .filter(([fieldKey, fieldValue]) => fieldKey && typeof fieldValue === "string")
          .map(([fieldKey, fieldValue]) => [fieldKey, fieldValue] as const);
        return [key, Object.fromEntries(draftEntries) as Record<string, string>] as const;
      });
    return Object.fromEntries(
      entries
    ) as Record<string, Record<string, string>>;
  } catch (error) {
    reportAppError(error, { severity: "warning", source: "app", action: "loadVoucherDrafts", phase: "localStorage", notifyUser: false });
    return {};
  }
}

export function loadFinalizeDraftAssets(storage: Storage = window.localStorage): PersistedFinalizeDraftAssets {
  try {
    const raw = storage.getItem(FINALIZE_DRAFT_ASSETS_STORAGE_KEY);
    if (!raw) return { signatures: {}, photos: {}, receiveProofs: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedFinalizeDraftAssets>;
    return {
      signatures: parsed.signatures && typeof parsed.signatures === "object" ? parsed.signatures : {},
      photos: parsed.photos && typeof parsed.photos === "object" ? parsed.photos : {},
      receiveProofs: parsed.receiveProofs && typeof parsed.receiveProofs === "object" ? parsed.receiveProofs : {}
    };
  } catch (error) {
    reportAppError(error, { severity: "warning", source: "app", action: "loadFinalizeDraftAssets", phase: "localStorage", notifyUser: false });
    return { signatures: {}, photos: {}, receiveProofs: {} };
  }
}

export function serializeReceiveProofs(receiveProofs: Record<string, ExpensePhoto[]>): Record<string, PersistedReceiveProof[]> {
  return Object.fromEntries(
    Object.entries(receiveProofs).map(([detailId, photos]) => [
      detailId,
      photos
        .filter((photo) => Boolean(photo.dataUrl))
        .map(({ previewUrl: _previewUrl, rawBlob: _rawBlob, ...photo }) => photo)
    ])
  );
}
