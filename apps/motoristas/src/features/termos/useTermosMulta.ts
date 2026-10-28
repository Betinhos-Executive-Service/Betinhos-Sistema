import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { reportAppError } from "../../lib/appErrorLogger";
import type { TermosLoadStatus } from "./TermosMultaScreen";
import { isMockTermos, listarTermosMotorista, type TermoMulta } from "./termosMulta";

// Termos de multa do motorista logado: alimentam a tela Multas e o contador da Home.
export function useTermosMulta(driverIdRef: MutableRefObject<string>, driverId: string | undefined) {
  const [termosMulta, setTermosMulta] = useState<TermoMulta[]>([]);
  const [termosStatus, setTermosStatus] = useState<TermosLoadStatus>("loading");
  const reloadTermosMulta = useCallback(async () => {
    try {
      setTermosMulta(await listarTermosMotorista(driverIdRef.current));
      setTermosStatus("ready");
    } catch (error) {
      setTermosStatus((current) => current === "ready" ? current : "error");
      throw error;
    }
  }, []);
  useEffect(() => {
    if (!isMockTermos() && !driverId) return;
    reloadTermosMulta().catch((error) => reportAppError(error, { severity: "warning", source: "app", action: "listarTermosMotorista", notifyUser: false }));
  }, [driverId]);

  return { termosMulta, termosStatus, reloadTermosMulta };
}
