/**
 * Câmera ao vivo para documentos (comprovante): stream 4:3 em alta resolução, igual ao formato da foto do sensor.
 * Sem isso o WebView escolhe 1920x1080 (16:9) e a foto em retrato sai 9:16, cortando cerca de 25% do campo de visão.
 * Só usa `ideal` (nunca `min`/`exact`), então não gera OverconstrainedError; se o aparelho recusar, cai no fallback.
 */
export const DOCUMENT_PHOTO_ASPECT = 4 / 3;
const DOCUMENT_WIDTH = 1920;
const DOCUMENT_HEIGHT = 1440;

type CameraMode = "environment" | "user";

export function getDocumentStreamConstraints(mode: CameraMode): MediaTrackConstraints {
  return {
    facingMode: mode,
    aspectRatio: { ideal: DOCUMENT_PHOTO_ASPECT },
    width: { ideal: DOCUMENT_WIDTH },
    height: { ideal: DOCUMENT_HEIGHT }
  };
}

/** Constraints reaplicadas no track (perfil e foco contínuo) sem perder o 4:3. */
export function getDocumentTrackConstraints(mode: CameraMode, frameRate: number, continuousFocus: boolean): MediaTrackConstraints {
  const constraints: MediaTrackConstraints & { focusMode?: ConstrainDOMString } = {
    facingMode: { ideal: mode },
    aspectRatio: { ideal: DOCUMENT_PHOTO_ASPECT },
    width: { ideal: DOCUMENT_WIDTH },
    height: { ideal: DOCUMENT_HEIGHT },
    frameRate: { ideal: frameRate, max: frameRate }
  };
  if (continuousFocus) constraints.focusMode = { ideal: "continuous" };
  return constraints;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** "1440x1920 (3:4)" a partir de track.getSettings(), para diagnóstico. */
export function describeStreamSize(settings: { width?: number; height?: number }) {
  const width = Math.round(Number(settings.width ?? 0));
  const height = Math.round(Number(settings.height ?? 0));
  if (!width || !height) return "desconhecido";
  const d = gcd(width, height);
  return `${width}x${height} (${width / d}:${height / d})`;
}

type FrameSize = { width: number; height: number };

/** Diferença máxima aceita entre as proporções (maior lado / menor lado) da foto e da prévia. */
const FRAMING_TOLERANCE = 0.02;

const longToShort = ({ width, height }: FrameSize) => Math.max(width, height) / Math.min(width, height);

/**
 * Comprovante: decide entre a foto do sensor (ImageCapture.takePhoto) e o quadro inteiro do vídeo.
 * Alguns WebViews Android devolvem no takePhoto uma foto 16:9 mesmo com o stream 4:3, cortando as
 * laterais do que o motorista viu na prévia. A foto só é usada se tiver a mesma proporção da prévia
 * (em qualquer orientação); senão vale o quadro do vídeo, que é exatamente o que apareceu na tela.
 */
export function chooseDocumentCaptureSource(photo: FrameSize, preview: FrameSize): "photo" | "frame" {
  if (!(preview.width > 0 && preview.height > 0)) return "photo";
  if (!(photo.width > 0 && photo.height > 0)) return "frame";
  const diff = Math.abs(longToShort(photo) - longToShort(preview)) / longToShort(preview);
  return diff <= FRAMING_TOLERANCE ? "photo" : "frame";
}
