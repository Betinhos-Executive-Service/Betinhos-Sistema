// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { useEffect, useRef } from 'react'


export const attachmentPreviewCache = new Map();

export function isImageAttachment(attachment: any) {
  return (
    String(attachment?.mimeType || "")
      .toLowerCase()
      .startsWith("image/") ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(String(attachment?.name || ""))
  );
}

export function isPdfAttachment(attachment: any) {
  return (
    String(attachment?.mimeType || "").toLowerCase() === "application/pdf" ||
    /\.pdf$/i.test(String(attachment?.name || ""))
  );
}

export function attachmentCacheKey(attachment: any) {
  return (
    attachment?.sharePointId ||
    attachment?.fileLocator ||
    attachment?.path ||
    attachment?.name
  );
}

export function toAttachmentFiles(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value.length === "number" && !value.name)
    return Array.from(value).filter(Boolean);
  return [value];
}

export function fileToDataUrl(file: any) {
  if (!file) return Promise.resolve("");
  if (typeof FileReader === "undefined") return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(
        reader.error || new Error("Não foi possível preparar o arquivo local."),
      );
    reader.readAsDataURL(file);
  });
}

export function filesFromClipboard(event: any) {
  const clipboard = event.clipboardData;
  const files = Array.from(clipboard?.files || []).filter(Boolean);
  if (files.length) return files;
  return Array.from(clipboard?.items || [])
    .filter((item) => (item as any).kind === "file")
    .map((item) => (item as any).getAsFile?.())
    .filter(Boolean);
}

// Ctrl+V sem foco em campo: o evento nasce no <body> e não chega ao onPaste do drawer.
// Só o handler registrado por último (modal mais acima) recebe o colar.
export const documentPasteHandlers: any[] = [];
export function useDocumentPaste(handler: any) {
  const handlerRef = useRef<any>(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const entry = (event: any) => handlerRef.current(event);
    documentPasteHandlers.push((entry as any));
    const listener = (event: any) => {
      if (documentPasteHandlers[documentPasteHandlers.length - 1] !== entry) return;
      // O onPaste do React (no #root) roda antes e já chama preventDefault quando anexa.
      if (event.defaultPrevented) return;
      entry(event);
    };
    document.addEventListener("paste", listener);
    return () => {
      document.removeEventListener("paste", listener);
      const index = documentPasteHandlers.indexOf((entry as any));
      if (index >= 0) documentPasteHandlers.splice(index, 1);
    };
  }, []);
}

export function createDraftAttachment(file: any, prefix = "draft") {
  const previewUrl = globalThis.URL?.createObjectURL
    ? globalThis.URL.createObjectURL(file)
    : "";
  return {
    id: `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    previewUrl,
    file,
    syncStatus: "pending",
  };
}

export function releaseDraftAttachment(attachment: any) {
  if (
    attachment?.previewUrl?.startsWith("blob:") &&
    globalThis.URL?.revokeObjectURL
  )
    globalThis.URL.revokeObjectURL(attachment.previewUrl);
}

export function mergeAttachmentDetailsIntoState(state: any, taskId: any, details: any) {
  if (!details?.taskId) return details;
  return {
    ...state,
    tasks: state.tasks.map((item: any) =>
      item.id === taskId
        ? {
            ...item,
            ...details,
            detailsLoaded: true,
            detailsLoading: false,
            detailsError: "",
          }
        : item,
    ),
  };
}

export function formatAttachmentSize(size: any) {
  const bytes = Number(size || 0);
  if (!bytes) return "Tamanho não informado";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function attachmentTypeLabel(attachment: any) {
  const mimeType = String(attachment?.mimeType || "").toLowerCase();
  const name = String(attachment?.name || "").toLowerCase();
  if (
    mimeType.startsWith("image/") ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(name)
  )
    return "Imagem";
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (/spreadsheet|excel/.test(mimeType) || /\.(csv|xls|xlsx)$/.test(name))
    return "Planilha";
  if (/presentation|powerpoint/.test(mimeType) || /\.(ppt|pptx)$/.test(name))
    return "Apresentação";
  if (/zip|compressed/.test(mimeType) || /\.(7z|rar|zip)$/.test(name))
    return "Arquivo compactado";
  return "Arquivo";
}
