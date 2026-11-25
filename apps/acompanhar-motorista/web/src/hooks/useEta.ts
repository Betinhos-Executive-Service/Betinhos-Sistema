import { useRef } from "react";
import { etaEstavel } from "../../../src/movimento.mjs";
import type { Dados, Eta } from "../tipos";

export interface EtaMostrado { eta: Eta | null; chegada: number | null }

// ETA estável: salto grande só aparece se a leitura seguinte confirmar; troca de fase ou etapa zera.
// Rastreador fora: os minutos vêm da última leitura e "às HH:MM" derivaria a cada poll; melhor não prometer hora.
// O cálculo roda uma vez por /dados (a identidade do objeto guarda o resultado; renderizar de novo não repete).
export function useEta(dados: Dados | null): EtaMostrado {
  const r = useRef<{ de: Dados | null; mostrado: Eta | null; pendente: Eta | null; chave: string | null; saida: EtaMostrado }>(
    { de: null, mostrado: null, pendente: null, chave: null, saida: { eta: null, chegada: null } });
  const s = r.current;
  if (s.de !== dados) {
    s.de = dados;
    if (!dados) { s.saida = { eta: null, chegada: null }; return s.saida; }
    const chave = dados.fase + ":" + (dados.etapas || []).findIndex((x) => x.atual);
    if (chave !== s.chave) { s.mostrado = null; s.pendente = null; s.chave = chave; }
    const est = etaEstavel(s.mostrado, s.pendente, dados.eta || null);
    s.mostrado = est.mostrar; s.pendente = est.pendente;
    const e = s.mostrado;
    s.saida = !e || dados.fonteIndisponivel ? { eta: null, chegada: null }
      : { eta: e, chegada: (dados.servidorEm ? new Date(dados.servidorEm).getTime() : Date.now()) + e.minutos * 60000 };
  }
  return s.saida;
}
