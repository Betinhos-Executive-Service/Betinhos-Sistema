// Boas ideias: mesmo contrato da tabela cr40f_boasideias usada pela Tela Planner (IdeasView).
import { validarVideo } from "../fotos/provaCaptura.ts";

export const IDEA_TITLE_MAX_LENGTH = 100;
export const IDEA_DETAILS_MAX_LENGTH = 2000;

export const IDEA_STATUS = {
  nova: 100000000,
  emAvaliacao: 100000001,
  aprovada: 100000002,
  implementada: 100000003
} as const;

export const IDEA_STATUS_OPTIONS = [
  { value: IDEA_STATUS.nova, label: "Nova", tone: "info" },
  { value: IDEA_STATUS.emAvaliacao, label: "Em avaliação", tone: "process" },
  { value: IDEA_STATUS.aprovada, label: "Aprovada", tone: "success" },
  { value: IDEA_STATUS.implementada, label: "Implementada", tone: "brand" }
] as const;

export type IdeaStatusTone = (typeof IDEA_STATUS_OPTIONS)[number]["tone"];

export const IDEA_ATTACHMENT_MAX = 5;
export const IDEA_MEDIA_TYPE = { foto: 100000000, video: 100000001 } as const;

export type IdeaMediaKind = "foto" | "video";

export type IdeaAttachment = {
  id: string;
  kind: IdeaMediaKind;
  name: string;
  fileName: string;
  link: string;
  order: number;
  sizeBytes: number;
};

export type Idea = {
  id: string;
  title: string;
  details: string;
  status: number;
  createdAt: string;
  attachments: IdeaAttachment[];
};

// Arquivo já validado, pronto para subir.
export type IdeaMediaFile = {
  file: File;
  kind: IdeaMediaKind;
  durationSeconds: number | null;
};

// A tabela de anexos ainda não existe no ambiente: a ideia vale, os arquivos não.
export class IdeaAttachmentsUnavailableError extends Error {
  constructor() {
    super("Os anexos ainda não estão disponíveis neste ambiente.");
    this.name = "IdeaAttachmentsUnavailableError";
  }
}

export type IdeaDraft = {
  title: string;
  details: string;
};

export type IdeaDraftErrors = Partial<Record<keyof IdeaDraft, string>>;

export function getIdeaStatusOption(status: number) {
  return IDEA_STATUS_OPTIONS.find((option) => option.value === status) ?? null;
}

export function validateIdeaDraft(draft: IdeaDraft): IdeaDraftErrors {
  const errors: IdeaDraftErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "Informe o título da ideia.";
  else if (title.length > IDEA_TITLE_MAX_LENGTH) errors.title = `O título deve ter até ${IDEA_TITLE_MAX_LENGTH} caracteres.`;
  if (draft.details.trim().length > IDEA_DETAILS_MAX_LENGTH) {
    errors.details = `A descrição deve ter até ${IDEA_DETAILS_MAX_LENGTH} caracteres.`;
  }
  return errors;
}

export function buildIdeaRecord(draft: IdeaDraft) {
  return {
    cr40f_name: draft.title.trim(),
    cr40f_detalhes: draft.details.trim(),
    cr40f_status: IDEA_STATUS.nova
  };
}

export function normalizeIdeaRecord(record: Record<string, unknown>): Idea {
  const status = Number(record.cr40f_status);
  return {
    id: String(record.cr40f_boasideiasid ?? ""),
    title: String(record.cr40f_name ?? ""),
    details: String(record.cr40f_detalhes ?? ""),
    status: Number.isFinite(status) && record.cr40f_status !== null && record.cr40f_status !== undefined ? status : IDEA_STATUS.nova,
    createdAt: String(record.createdon ?? ""),
    attachments: []
  };
}

export function classifyIdeaFile(file: { type: string; name?: string }): IdeaMediaKind | null {
  const type = file.type.trim().toLowerCase();
  if (type.startsWith("image/")) return "foto";
  if (type.startsWith("video/")) return "video";
  if (!type) {
    const extension = /\.([a-z0-9]+)$/i.exec(file.name ?? "")?.[1]?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension)) return "foto";
    if (["mp4", "mov", "webm", "m4v", "3gp"].includes(extension)) return "video";
  }
  return null;
}

/** Motivo da recusa de um arquivo para a ideia, ou "" quando pode entrar. `currentCount` = arquivos já escolhidos. */
export function validateIdeaMedia(
  currentCount: number,
  file: { type: string; name?: string; size: number },
  durationSeconds: number | null
) {
  const label = file.name ? `"${file.name}": ` : "";
  if (currentCount >= IDEA_ATTACHMENT_MAX) return `${label}cada ideia aceita até ${IDEA_ATTACHMENT_MAX} arquivos. Remova um para escolher outro.`;
  const kind = classifyIdeaFile(file);
  if (!kind) return `${label}só fotos e vídeos podem ser anexados.`;
  if (kind === "video") {
    const reason = validarVideo({ duracaoSegundos: durationSeconds, tamanhoBytes: file.size }, { exigirDuracao: true });
    if (reason) return `${label}${reason}`;
  }
  return "";
}

export function ideaAttachmentLabel(kind: IdeaMediaKind) {
  return kind === "video" ? "Vídeo" : "Foto";
}

/** "2 fotos · 1 vídeo"; vazio sem anexos. */
export function summarizeAttachments(attachments: Array<{ kind: IdeaMediaKind }>) {
  const photos = attachments.filter((item) => item.kind === "foto").length;
  const videos = attachments.filter((item) => item.kind === "video").length;
  const parts: string[] = [];
  if (photos) parts.push(`${photos} ${photos === 1 ? "foto" : "fotos"}`);
  if (videos) parts.push(`${videos} ${videos === 1 ? "vídeo" : "vídeos"}`);
  return parts.join(" · ");
}

/** Registro de cr40f_boasideiaanexos sem o bind do lookup (cr40f_ideia), que a camada remota acrescenta. */
export function buildIdeaAttachmentRecord(input: { ideaTitle: string; kind: IdeaMediaKind; order: number; fileName: string; link: string; sizeBytes: number }) {
  return {
    cr40f_name: `${ideaAttachmentLabel(input.kind)} ${input.order} - ${input.ideaTitle.trim()}`.slice(0, 100),
    cr40f_link: input.link,
    cr40f_nomearquivo: input.fileName,
    cr40f_tipomidia: IDEA_MEDIA_TYPE[input.kind],
    cr40f_ordem: input.order,
    cr40f_tamanhobytes: Math.max(0, Math.round(input.sizeBytes))
  };
}

/** O link vem de um campo que o motorista consegue gravar: só http(s) vira href (nunca javascript: ou data:). */
export function safeAttachmentLink(value: unknown) {
  const link = String(value ?? "").trim();
  return /^https?:\/\//i.test(link) ? link : "";
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp"
};

/** Tipo do arquivo para o envio: o do navegador ou, quando vem vazio (algumas galerias), o da extensão. */
export function ideaFileMimeType(file: { type: string; name?: string }, kind: IdeaMediaKind) {
  const type = file.type.trim().toLowerCase();
  if (type) return type;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name ?? "")?.[1]?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? (kind === "video" ? "video/mp4" : "image/jpeg");
}

export function normalizeIdeaAttachmentRecord(record: Record<string, unknown>): IdeaAttachment {
  const order = Number(record.cr40f_ordem);
  const size = Number(record.cr40f_tamanhobytes);
  return {
    id: String(record.cr40f_boasideiaanexoid ?? ""),
    kind: Number(record.cr40f_tipomidia) === IDEA_MEDIA_TYPE.video ? "video" : "foto",
    name: String(record.cr40f_name ?? ""),
    fileName: String(record.cr40f_nomearquivo ?? ""),
    link: safeAttachmentLink(record.cr40f_link),
    order: Number.isFinite(order) ? order : 0,
    sizeBytes: Number.isFinite(size) ? size : 0
  };
}

/** Erro do Dataverse para tabela inexistente (ainda sem a migration no ambiente). */
export function isMissingEntityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /0x80060888|could not find (an )?(entity|resource)|resource not found for the segment|does not exist|not a valid entity|entity.{0,40}not found/i.test(message);
}

export function formatIdeaDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(date);
}
