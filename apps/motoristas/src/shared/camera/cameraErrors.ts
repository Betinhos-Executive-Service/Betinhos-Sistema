// Traduz falhas do getUserMedia para orientação em português que o motorista consegue seguir.
export function describeCameraError(error: unknown) {
  const name = error instanceof Error || (typeof DOMException !== "undefined" && error instanceof DOMException)
    ? (error as Error).name
    : "";

  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "O celular bloqueou a câmera para o app. Toque em Permitir quando ele perguntar ou libere em Ajustes › Apps › (Power Apps ou o navegador, Chrome/Safari) › Permissões › Câmera e toque em Tentar de novo.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera foi encontrada neste aparelho.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "A câmera está em uso por outro app. Feche a outra câmera e toque em Tentar de novo.";
  }
  return "Não foi possível abrir a câmera. Toque em Tentar de novo.";
}
