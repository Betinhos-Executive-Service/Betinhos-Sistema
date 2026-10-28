import { useEffect, useRef, useState } from "react";
import { getDocumentStreamConstraints } from "../../lib/cameraConstraints";
import { describeCameraError } from "../../lib/cameraErrors";
import { capturarSelfieJpeg } from "./termosMulta";

type Props = { value: string; onChange: (base64: string) => void };

/** Câmera frontal com prévia; depois da foto mostra a selfie e "Tirar de novo". */
export function SelfieCapture({ value, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [erro, setErro] = useState("");
  const [pronta, setPronta] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (value) return;
    let stream: MediaStream | null = null;
    let ativo = true;
    setErro("");
    setPronta(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro(describeCameraError(new Error("getUserMedia indisponível")));
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: getDocumentStreamConstraints("user"), audio: false })
      .then(async (media) => {
        if (!ativo) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play().catch(() => undefined);
        setPronta(true);
      })
      .catch((error) => { if (ativo) setErro(describeCameraError(error)); });
    return () => {
      ativo = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [value, tentativa]);

  const tirar = async () => {
    if (!videoRef.current) return;
    try { onChange(await capturarSelfieJpeg(videoRef.current)); }
    catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível tirar a foto."); }
  };

  if (value) {
    return (
      <div className="termo-selfie">
        <img className="termo-selfie-frame" src={`data:image/jpeg;base64,${value}`} alt="Sua selfie" />
        <button type="button" className="termo-text-button" onClick={() => onChange("")}>Tirar de novo</button>
      </div>
    );
  }

  return (
    <div className="termo-selfie">
      <div className="termo-selfie-frame">
        <video ref={videoRef} playsInline muted aria-label="Prévia da câmera frontal" />
      </div>
      {erro ? (
        <div className="termo-alert" data-tone="erro" role="alert">
          <p>{erro}</p>
          <button type="button" className="termo-text-button" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</button>
        </div>
      ) : (
        <button type="button" className="termo-capture" disabled={!pronta} onClick={() => void tirar()}>
          {pronta ? "Tirar selfie" : "Abrindo câmera…"}
        </button>
      )}
    </div>
  );
}
