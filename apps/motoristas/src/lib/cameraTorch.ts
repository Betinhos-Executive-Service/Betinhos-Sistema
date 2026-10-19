/**
 * Lanterna da câmera ao vivo. Só existe quando o track declara `torch` nas capabilities (comum faltar em WebView e na
 * câmera frontal); nesse caso a tela nem mostra o botão.
 */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

export function supportsTorch(track: MediaStreamTrack | null | undefined) {
  if (!track || typeof track.getCapabilities !== "function") return false;
  try {
    return (track.getCapabilities() as TorchCapabilities).torch === true;
  } catch {
    return false;
  }
}

/** Liga ou desliga a lanterna; devolve false se o aparelho recusar. */
export async function setTorch(track: MediaStreamTrack | null | undefined, on: boolean) {
  if (!track) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as TorchConstraintSet] });
    return true;
  } catch {
    return false;
  }
}

/** Para a câmera desligando antes a lanterna acesa (sair da tela, trocar de câmera, depois da captura). */
export function stopStreamTracks(stream: MediaStream | null | undefined, torchOn: boolean) {
  if (!stream) return;
  if (torchOn) void setTorch(stream.getVideoTracks()[0], false);
  stream.getTracks().forEach((track) => track.stop());
}
