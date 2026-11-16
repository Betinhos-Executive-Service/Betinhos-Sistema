import { useEffect, useRef, useState } from "react";
import { reportAppError } from "../../shared/appErrorLogger";
import { provaCaptura, textoDoCarimbo, type ContextoCarimbo, type OrigemCaptura, type OrigemProva, type SessaoProva } from "./provaCaptura";

/** Prova de captura: tela e registro de origem (registroId vazio = registro ainda não criado) e o carimbo da foto. */
export type ProvaDaCaptura = {
  origem: Omit<OrigemProva, "registroId"> & { registroId?: string };
  carimbo: ContextoCarimbo;
  /** Maior lado da foto final (padrão 2048) e qualidade JPEG (padrão 0,85). */
  maxLado?: number;
  qualidade?: number;
};

const reportar = (error: unknown, action: string) =>
  reportAppError(error, { severity: "warning", source: "prova-captura", action, component: "MediaCaptureScreen", screen: "TelaCameraMidia", notifyUser: false });

/**
 * Sessão da prova da câmera aberta: pede o código ao montar (sem rede, a sessão volta "sem rede") e aplica
 * carimbo e redução na foto ou guarda os dados do vídeo. Nada aqui lança: a prova nunca bloqueia o anexo.
 */
export function useProvaDaCaptura(prova: ProvaDaCaptura | undefined) {
  const sessaoRef = useRef<Promise<SessaoProva> | null>(null);
  const [sessao, setSessao] = useState<SessaoProva | null>(null);

  const aguardarSessao = () => {
    if (!prova) return null;
    sessaoRef.current ??= provaCaptura()
      .iniciar({ ...prova.origem, registroId: prova.origem.registroId || `novo-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}` })
      .then((iniciada) => {
        setSessao(iniciada);
        return iniciada;
      });
    return sessaoRef.current;
  };

  useEffect(() => {
    void aguardarSessao();
  }, []);

  const finalizarFoto = async (dataUrl: string, origem: OrigemCaptura) => {
    const pendente = aguardarSessao();
    if (!pendente || !prova) return dataUrl;
    try {
      return (await provaCaptura().aplicarNaFoto(await pendente, dataUrl, prova.carimbo, origem, { maxLado: prova.maxLado, qualidade: prova.qualidade })).dataUrl;
    } catch (error) {
      reportar(error, "aplicar-na-foto");
      return dataUrl;
    }
  };

  const registrarVideo = async (video: Blob, origem: OrigemCaptura, duracaoSegundos: number | null) => {
    const pendente = aguardarSessao();
    if (!pendente) return;
    try {
      await provaCaptura().dadosDoVideo(await pendente, video, origem, duracaoSegundos);
    } catch (error) {
      reportar(error, "dados-do-video");
    }
  };

  return { sessao, finalizarFoto, registrarVideo };
}

/** Prévia do carimbo sobre a câmera ao vivo; o relógio fica aqui para não redesenhar a tela inteira a cada segundo. */
export function CarimboPrevia({ sessao, carimbo }: { sessao: SessaoProva | null; carimbo: ContextoCarimbo }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const linhas = textoDoCarimbo(sessao ?? { semRede: false, codigo: "..." }, carimbo, agora);
  return (
    <div className="camera-stamp-preview" data-testid="carimbo-previa">
      {linhas.map((linha) => <span key={linha}>{linha}</span>)}
    </div>
  );
}
