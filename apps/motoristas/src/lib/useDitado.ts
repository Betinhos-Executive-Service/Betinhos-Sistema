import { useCallback, useEffect, useRef, useState } from "react";

// Ditado por voz via Web Speech API do Chrome. O áudio é processado pelo próprio
// navegador; o app nunca envia áudio a servidor próprio.

export type DitadoRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: DitadoResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

export type DitadoResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

export type DitadoCtor = new () => DitadoRecognition;

export type DitadoState = { listening: boolean; interim: string; error: string };

export const DITADO_IDLE: DitadoState = { listening: false, interim: "", error: "" };

export function getDitadoCtor(scope: unknown = globalThis): DitadoCtor | null {
  const w = scope as { SpeechRecognition?: DitadoCtor; webkitSpeechRecognition?: DitadoCtor } | null;
  return w?.SpeechRecognition || w?.webkitSpeechRecognition || null;
}

export function ditadoErrorMessage(code?: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Libere o microfone para ditar";
    case "no-speech":
      return "Não ouvi nada. Toque no microfone e fale de novo.";
    case "network":
      return "Sem conexão para ditar. Digite o texto.";
    case "audio-capture":
      return "Microfone não encontrado.";
    case "aborted":
      return "";
    default:
      return "Não foi possível ditar agora. Digite o texto.";
  }
}

/** Acrescenta o trecho ditado ao texto já digitado, separando com espaço e sem apagar nada. */
export function appendDitado(current: string, fragment: string): string {
  const piece = fragment.trim();
  if (!piece) return current;
  if (!current.trim()) return piece;
  return /\s$/.test(current) ? `${current}${piece}` : `${current} ${piece}`;
}

const colapsar = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * No Android, com continuous + interimResults, cada resultado final é CUMULATIVO (a frase
 * inteira até ali) e pode vir repetido; no desktop cada final é um trecho novo. Devolve só
 * a parte ainda não gravada de `text`, dado o último final emitido na sessão.
 */
export function ditadoNovo(text: string, ultimoFinal: string): string {
  const atual = colapsar(text);
  if (!ultimoFinal) return atual;
  const norm = atual.toLowerCase();
  if (norm === ultimoFinal) return "";
  if (norm.startsWith(ultimoFinal) && norm[ultimoFinal.length] === " ") return atual.slice(ultimoFinal.length).trim();
  return atual;
}

/** Controlador sem React: isolado para ser testado com um SpeechRecognition falso. */
export function createDitado(
  Ctor: DitadoCtor,
  handlers: { onFinal: (text: string) => void; onState: (state: DitadoState) => void }
) {
  let rec: DitadoRecognition | null = null;
  let state: DitadoState = DITADO_IDLE;
  let ultimoFinal = "";
  let indicesFinais = new Map<number, string>();
  const set = (patch: Partial<DitadoState>) => {
    state = { ...state, ...patch };
    handlers.onState(state);
  };

  function start() {
    if (rec) return;
    const r = new Ctor();
    ultimoFinal = "";
    indicesFinais = new Map();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const norm = colapsar(transcript).toLowerCase();
          if (indicesFinais.get(i) === norm) continue;
          indicesFinais.set(i, norm);
          const novo = ditadoNovo(transcript, ultimoFinal);
          if (!novo) continue;
          ultimoFinal = norm;
          handlers.onFinal(novo);
        } else {
          interim += transcript;
        }
      }
      set({ interim: ditadoNovo(interim, ultimoFinal) });
    };
    r.onerror = (event) => {
      const message = ditadoErrorMessage(event.error);
      if (message) set({ error: message });
    };
    r.onend = () => {
      if (rec === r) rec = null;
      set({ listening: false, interim: "" });
    };
    rec = r;
    set({ listening: true, interim: "", error: "" });
    try {
      r.start();
    } catch {
      rec = null;
      set({ listening: false, error: ditadoErrorMessage() });
    }
  }

  function stop() {
    const r = rec;
    if (!r) return;
    try {
      r.stop();
    } catch {
      /* já parou */
    }
    // O onend final chega depois; já refletimos o estado parado na UI.
    rec = null;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    set({ listening: false, interim: "" });
  }

  return { start, stop, toggle: () => (rec ? stop() : start()), isListening: () => rec !== null };
}

export function useDitado(onFinal: (text: string) => void) {
  const [ctor] = useState(() => getDitadoCtor(typeof window === "undefined" ? null : window));
  const [state, setState] = useState<DitadoState>(DITADO_IDLE);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const controllerRef = useRef<ReturnType<typeof createDitado> | null>(null);

  useEffect(() => {
    if (!ctor) return undefined;
    const controller = createDitado(ctor, { onFinal: (text) => onFinalRef.current(text), onState: setState });
    controllerRef.current = controller;
    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, [ctor]);

  const toggle = useCallback(() => controllerRef.current?.toggle(), []);
  const stop = useCallback(() => controllerRef.current?.stop(), []);

  return { supported: ctor !== null, ...state, toggle, stop };
}
