import type { Screen } from "../types.ts";
import { manifesto as comunicados } from "../features/comunicados/manifesto.ts";
import { manifesto as ideias } from "../features/ideias/manifesto.ts";
import { manifesto as meuCarro } from "../features/meu-carro/manifesto.ts";
import { manifesto as termos } from "../features/termos/manifesto.ts";
import type { Modo } from "./modo.ts";

// Registro de funcionalidades: quais telas cada uma tem e se o parceiro via link pode usar.
// Navegação e o futuro Worker leem daqui; liberar ou bloquear é mudar uma linha.
// Quando a feature ganhar pasta em src/features/, o item vira o manifesto dela.
export type Feature = {
  id: string;
  telas: Screen[];
  liberadoLink: boolean;
};

export const FEATURES: Feature[] = [
  { id: "servicos", telas: ["inicio", "servicos"], liberadoLink: true },
  { id: "detalhe", telas: ["detalhes"], liberadoLink: true },
  { id: "fotos", telas: ["fotoManutencao", "previewFotoManutencao"], liberadoLink: true },
  { id: "checklist", telas: ["checklists"], liberadoLink: true },
  { id: "finalizar", telas: ["finalizar", "canceladoLocal"], liberadoLink: true },
  { id: "voucher", telas: ["voucher", "assinatura"], liberadoLink: true },
  { id: "recibo", telas: ["reciboPersonalizado"], liberadoLink: true },
  comunicados,
  ideias,
  { id: "recebimento", telas: ["receber", "cobrancaQr", "fotoReceber", "previewFotoReceber"], liberadoLink: false },
  { id: "despesas", telas: ["gastos", "fotoGasto", "previewFotoGasto"], liberadoLink: false },
  { id: "colisao", telas: ["colisoesInicio", "colisoes", "fotoColisao", "previewFotoColisao"], liberadoLink: false },
  { id: "manutencao", telas: ["solicitarManutencao", "fotoSolicitacaoManutencao", "previewFotoSolicitacaoManutencao"], liberadoLink: false },
  termos,
  { id: "historico", telas: ["historico", "detalhesHistorico"], liberadoLink: false },
  meuCarro
];

export function featuresDoModo(modo: Modo, features: Feature[] = FEATURES) {
  return modo === "motorista" ? features : features.filter((feature) => feature.liberadoLink);
}

export function telasDoModo(modo: Modo, features: Feature[] = FEATURES): Set<Screen> {
  return new Set(featuresDoModo(modo, features).flatMap((feature) => feature.telas));
}
