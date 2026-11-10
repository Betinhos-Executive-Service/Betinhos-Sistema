import { useCallback, useEffect, useRef, useState } from "react";
import { getInitialTreinamentoParticipacaoId } from "../../app/bootstrap";
import { AUTO_REFRESH_INTERVAL_MS } from "../../app/navigation";
import { reportAppError } from "../../shared/appErrorLogger";
import { isMockTreinamentos, listarTreinamentosMotorista, mensagemNovosTreinamentos, novosTreinamentosPendentes, type Participacao, type TreinamentoMotorista } from "./treinamentos";
import type { TreinamentosLoadStatus } from "./TreinamentosScreen";
import type { Screen } from "../../types";

type Options = {
  comunicadosDriverIdRef: React.MutableRefObject<string>;
  driverContextId: string | undefined;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Treinamentos do RH: lista do motorista com recarga periódica, aviso de treinamento novo e deep link do push.
export function useTreinamentos({ comunicadosDriverIdRef, driverContextId, setScreen }: Options) {
  // Treinamentos do RH: mesmo motorista logado; alimentam a tela Treinamentos e o contador da Home.
  const [treinamentos, setTreinamentos] = useState<TreinamentoMotorista[]>([]);
  const [treinamentosStatus, setTreinamentosStatus] = useState<TreinamentosLoadStatus>("loading");
  const [selectedTreinamentoId, setSelectedTreinamentoId] = useState("");
  const pendingTreinamentoDeepLinkRef = useRef(getInitialTreinamentoParticipacaoId());
  // Ids já vistos (null até a primeira carga) e aviso de treinamento novo; a primeira carga não avisa.
  const treinamentosConhecidosRef = useRef<Set<string> | null>(null);
  const treinamentosEmCargaRef = useRef<Promise<void> | null>(null);
  const [avisoTreinamentos, setAvisoTreinamentos] = useState<{ message: string; participacaoId: string } | null>(null);
  const reloadTreinamentos = useCallback(() => {
    if (treinamentosEmCargaRef.current) return treinamentosEmCargaRef.current;
    const carga = (async () => {
      try {
        const atuais = await listarTreinamentosMotorista(comunicadosDriverIdRef.current);
        const novos = novosTreinamentosPendentes(treinamentosConhecidosRef.current, atuais);
        treinamentosConhecidosRef.current = new Set(atuais.map((item) => item.participacao.id));
        setTreinamentos(atuais);
        setTreinamentosStatus("ready");
        if (novos.length) setAvisoTreinamentos({ message: mensagemNovosTreinamentos(novos.length), participacaoId: novos.length === 1 ? novos[0].participacao.id : "" });
      } catch (error) {
        setTreinamentosStatus((current) => current === "ready" ? current : "error");
        throw error;
      } finally {
        treinamentosEmCargaRef.current = null;
      }
    })();
    treinamentosEmCargaRef.current = carga;
    return carga;
  }, []);
  useEffect(() => {
    if (!isMockTreinamentos() && !driverContextId) return;
    const carregar = () => {
      if (document.hidden) return;
      reloadTreinamentos().catch((error) => reportAppError(error, { severity: "warning", source: "app", action: "listarTreinamentosMotorista", notifyUser: false }));
    };
    carregar();
    const timer = window.setInterval(carregar, AUTO_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", carregar);
    document.addEventListener("visibilitychange", carregar);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", carregar);
      document.removeEventListener("visibilitychange", carregar);
    };
  }, [driverContextId]);
  const abrirAvisoTreinamentos = () => {
    const participacaoId = avisoTreinamentos?.participacaoId ?? "";
    setAvisoTreinamentos(null);
    setSelectedTreinamentoId(participacaoId);
    setScreen("treinamentos");
  };
  // Deep link do push: abre o detalhe da participação quando a lista chega; se não achar (ou a leitura falhar), fica na lista.
  useEffect(() => {
    const participacaoId = pendingTreinamentoDeepLinkRef.current;
    if (!participacaoId || treinamentosStatus === "loading") return;
    pendingTreinamentoDeepLinkRef.current = "";
    if (treinamentos.some((item) => item.participacao.id === participacaoId)) setSelectedTreinamentoId(participacaoId);
  }, [treinamentos, treinamentosStatus]);
  // Participação gravada pela tela: reflete na lista e na Home sem esperar a releitura.
  const updateTreinamentoParticipacao = useCallback((participacao: Participacao) => {
    setTreinamentos((current) => current.map((item) => item.participacao.id === participacao.id ? { ...item, participacao } : item));
  }, []);

  return {
    abrirAvisoTreinamentos,
    avisoTreinamentos,
    reloadTreinamentos,
    selectedTreinamentoId,
    setAvisoTreinamentos,
    setSelectedTreinamentoId,
    treinamentos,
    treinamentosStatus,
    updateTreinamentoParticipacao
  };
}
