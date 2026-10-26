// Foto do passageiro para o motorista: só pela Custom API new_ObterFotoPassageiro, que valida
// no servidor status Programado, motorista e passageiro. A imagem fica só em memória (blob URL).
import type { DetailData } from "../types";
import { executeCustomApi } from "./customApi.ts";

/** cr40f_status "Programado" da reserva (cr40f_reservadeveculos). */
export const PROGRAMADO_STATUS = 202410005;

export type PassengerPhoto = { mimeType: string; base64: string };

/** Lê new_FotoJson; qualquer coisa fora de { ok: true, mimeType image/*, conteudoBase64 } vira null. */
export function parseFotoJson(raw: unknown): PassengerPhoto | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  const record = (data ?? {}) as { ok?: unknown; mimeType?: unknown; conteudoBase64?: unknown };
  if (record.ok !== true) return null;
  const mimeType = String(record.mimeType ?? "");
  const base64 = String(record.conteudoBase64 ?? "");
  if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType) || !base64) return null;
  return { mimeType, base64 };
}

/** Só serviço Programado pede foto; nos demais o avatar fica na inicial. */
export function canRequestPassengerPhoto(detail: Pick<DetailData, "type" | "dataverse" | "passengers"> | null | undefined) {
  if (!detail || detail.type !== "SERVICO" || !detail.passengers?.length) return false;
  return Number(detail.dataverse?.record?.cr40f_status) === PROGRAMADO_STATUS;
}

export function passengerInitial(name: string) {
  return (name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? "?").toLocaleUpperCase("pt-BR");
}

function base64ToBlob({ mimeType, base64 }: PassengerPhoto) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

// Máximo de 2 chamadas simultâneas à Custom API.
const MAX_CONCURRENT = 2;
let running = 0;
const queue: Array<() => void> = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => queue.push(resolve));
  running += 1;
  try { return await task(); } finally {
    running -= 1;
    queue.shift()?.();
  }
}

export type PhotoFetcher = (reservaId: string, passageiroId: string) => Promise<unknown>;

const cleanId = (value: string) => value.replace(/[{}]/g, "").toLowerCase();

/** Chamada real: devolve o new_FotoJson cru. */
export const fetchFotoJsonRemote: PhotoFetcher = async (reservaId, passageiroId) => {
  const response = await executeCustomApi("new_ObterFotoPassageiro", {
    new_ReservaId: cleanId(reservaId),
    new_PassageiroId: cleanId(passageiroId)
  });
  return response.new_FotoJson;
};

// Mock local: PNG 1x1 em base64 para o primeiro passageiro; "indisponivel" para os demais.
const MOCK_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const fetchFotoJsonMock: PhotoFetcher = async (_reservaId, passageiroId) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return passageiroId.endsWith("-1")
    ? JSON.stringify({ ok: true, mimeType: "image/png", conteudoBase64: MOCK_PNG })
    : JSON.stringify({ ok: false, motivo: "indisponivel" });
};

/**
 * Cache só em memória, por (reserva, passageiro), enquanto a tela está aberta.
 * `dispose()` revoga todos os blob URLs (ao sair da tela, trocar serviço ou status).
 */
export function createPassengerPhotoStore(fetcher: PhotoFetcher) {
  const urls = new Map<string, Promise<string | null>>();
  const created: string[] = [];
  let disposed = false;
  return {
    get(reservaId: string, passageiroId: string): Promise<string | null> {
      const key = `${cleanId(reservaId)}|${cleanId(passageiroId)}`;
      let pending = urls.get(key);
      if (!pending) {
        pending = limited(() => fetcher(reservaId, passageiroId))
          .then((raw) => {
            const photo = parseFotoJson(raw);
            if (!photo || disposed) return null;
            const url = URL.createObjectURL(base64ToBlob(photo));
            created.push(url);
            return url;
          })
          // Negado ou falha: só a inicial, sem mensagem ao motorista.
          .catch(() => null);
        urls.set(key, pending);
      }
      return pending;
    },
    dispose() {
      disposed = true;
      created.splice(0).forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    }
  };
}
