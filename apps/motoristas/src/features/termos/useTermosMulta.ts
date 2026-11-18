import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { reportAppError } from "../../shared/appErrorLogger";
import { agruparMinhasMultas, erroDeRede, listarMinhasMultas, type CargaStatus, type MinhaMulta } from "./minhasMultas";
import { lerMinhasMultas, salvarMinhasMultas, usuarioAtual } from "./minhasMultasOffline";
import { isMockTermos, listarTermosMotorista, type TermoMulta } from "./termosMulta";

export type TermosLoadStatus = CargaStatus;

// Multas do motorista logado: alimentam a tela Multas e o contador da Home.
export function useTermosMulta(driverIdRef: MutableRefObject<string>, driverId: string | undefined) {
  const [termosMulta, setTermosMulta] = useState<TermoMulta[]>([]);
  const [termosStatus, setTermosStatus] = useState<TermosLoadStatus>("loading");
  const [minhasMultas, setMinhasMultas] = useState<MinhaMulta[]>([]);
  /** Hora (ISO) da última leitura guardada quando a tela mostra o cache por falta de rede; null com dados novos. */
  const [minhasMultasOfflineEm, setMinhasMultasOfflineEm] = useState<string | null>(null);

  /** Hora da última leitura bem-sucedida: a faixa de sem conexão a usa quando a rede cai depois de carregar. */
  const [minhasMultasLidoEm, setMinhasMultasLidoEm] = useState<string | null>(null);

  const carregarMinhasMultas = useCallback(async () => {
    try {
      const itens = await listarMinhasMultas();
      salvarMinhasMultas(usuarioAtual(), itens);
      setMinhasMultas(itens);
      setMinhasMultasOfflineEm(null);
      setMinhasMultasLidoEm(new Date().toISOString());
      setTermosStatus("ready");
    } catch (error) {
      // O cache só cobre falta de rede; erro do servidor mostra a mensagem de erro.
      const guardado = erroDeRede(error) ? lerMinhasMultas(usuarioAtual()) : null;
      if (guardado) {
        setMinhasMultas(guardado.itens);
        setMinhasMultasOfflineEm(guardado.salvoEm);
        setTermosStatus("ready");
        return;
      }
      setTermosStatus((atual) => atual === "ready" ? atual : "error");
      throw error;
    }
  }, []);

  const reloadTermosMulta = useCallback(async () => {
    // Os termos abastecem o detalhe e o banner da Home; a lista da tela vem de minhasMultas.
    const termos = listarTermosMotorista(driverIdRef.current).then(setTermosMulta, (error) => {
      reportAppError(error, { severity: "warning", source: "app", action: "listarTermosMotorista", notifyUser: false });
    });
    await Promise.all([carregarMinhasMultas(), termos]);
  }, [carregarMinhasMultas]);

  useEffect(() => {
    if (!isMockTermos() && !driverId) return;
    reloadTermosMulta().catch((error) => reportAppError(error, { severity: "warning", source: "app", action: "listarMinhasMultas", notifyUser: false }));
  }, [driverId]);

  const precisaDeVoce = agruparMinhasMultas(minhasMultas).precisa.length;
  return { termosMulta, termosStatus, reloadTermosMulta, minhasMultas, minhasMultasOfflineEm, minhasMultasLidoEm, precisaDeVoce };
}
