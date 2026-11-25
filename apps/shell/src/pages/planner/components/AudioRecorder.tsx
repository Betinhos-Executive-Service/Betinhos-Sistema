// Gravador de áudio da Nova ideia: um toque grava, outro para; cada gravação vira um anexo.
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

export const MAX_RECORDING_SECONDS = 180;
const BARS = 28;

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function supportedType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  const check = typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported.bind(MediaRecorder) : null;
  return candidates.find((type) => check?.(type)) ?? "";
}

function errorMessage(reason: unknown): string {
  const name = reason instanceof DOMException || reason instanceof Error ? reason.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "O navegador não liberou o microfone. Libere o acesso nas permissões do site ou anexe um arquivo de áudio.";
  if (name === "NotFoundError") return "Nenhum microfone encontrado. Conecte um microfone ou anexe um arquivo de áudio.";
  return "Não foi possível gravar. Anexe um arquivo de áudio.";
}

type Props = { onRecorded: (file: File) => void; onError: (message: string) => void; disabled?: boolean };

export function AudioRecorder({ onRecorded, onError, disabled }: Props) {
  const [phase, setPhase] = useState<"idle" | "asking" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const started = useRef(0);
  const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  const release = () => {
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
  };

  // Saiu da tela (drawer fechado) no meio da gravação: descarta e desliga o microfone.
  useEffect(() => () => {
    if (recorder.current?.state === "recording") { recorder.current.ondataavailable = null; recorder.current.onstop = null; recorder.current.stop(); }
    release();
  }, []);

  async function start() {
    if (!supported) { onError("Este navegador não grava áudio. Anexe um arquivo de áudio."); return; }
    setPhase("asking");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (reason) {
      setPhase("idle");
      onError(errorMessage(reason));
      return;
    }
    const type = supportedType();
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined);
    recorder.current = rec;
    rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    rec.onstop = () => {
      release();
      setPhase("idle");
      setLevels(Array(BARS).fill(0));
      const mime = (rec.mimeType || type || "audio/webm").split(";")[0];
      const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const blob = new Blob(chunks, { type: mime });
      if (blob.size) onRecorded(new File([blob], `audio-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`, { type: mime }));
    };
    rec.start(250);
    started.current = performance.now();
    setSeconds(0);
    setPhase("recording");

    // Barras de nível: amostra o volume a cada quadro e anda a fila da direita para a esquerda.
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      audioContext.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream.current).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (now: number) => {
        frame.current = requestAnimationFrame(tick);
        const elapsed = Math.floor((now - started.current) / 1000);
        if (elapsed >= MAX_RECORDING_SECONDS) { stop(); return; }
        if (now - last < 70) return;
        last = now;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setLevels((prev) => [...prev.slice(1), level]);
        setSeconds(elapsed);
      };
      frame.current = requestAnimationFrame(tick);
    } catch {
      // Sem Web Audio a gravação segue; só não mostra as barras.
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const recording = phase === "recording";
  return (
    <div className={`projects-recorder${recording ? " is-recording" : ""}`}>
      <button
        type="button"
        className="projects-recorder-button"
        onClick={recording ? stop : () => void start()}
        disabled={disabled || phase === "asking"}
        aria-label={recording ? "Parar gravação" : "Gravar áudio"}
        aria-pressed={recording}
      >
        {recording ? <Square size={18} /> : <Mic size={20} />}
      </button>
      <div className="projects-recorder-body">
        {recording ? (
          <>
            <div className="projects-recorder-wave" aria-hidden="true">
              {levels.map((level, index) => <span key={index} style={{ transform: `scaleY(${0.12 + level * 0.88})` }} />)}
            </div>
            <span className="projects-recorder-time" aria-live="polite">Gravando {mmss(seconds)} de {mmss(MAX_RECORDING_SECONDS)}</span>
          </>
        ) : (
          <>
            <strong>{phase === "asking" ? "Liberando o microfone..." : "Gravar áudio"}</strong>
            <small>Explique a ideia falando; até 3 minutos por gravação.</small>
          </>
        )}
      </div>
    </div>
  );
}
