import type { Screen } from "../types.ts";
import { manifesto as checklist } from "../features/checklist/manifesto.ts";
import { manifesto as colisao } from "../features/colisao/manifesto.ts";
import { manifesto as comunicados } from "../features/comunicados/manifesto.ts";
import { manifesto as despesas } from "../features/despesas/manifesto.ts";
import { manifesto as detalhe } from "../features/detalhe/manifesto.ts";
import { manifesto as finalizar } from "../features/finalizar/manifesto.ts";
import { manifesto as fotos } from "../features/fotos/manifesto.ts";
import { manifesto as historico } from "../features/historico/manifesto.ts";
import { manifesto as ideias } from "../features/ideias/manifesto.ts";
import { manifesto as manutencao } from "../features/manutencao/manifesto.ts";
import { manifesto as meuCarro } from "../features/meu-carro/manifesto.ts";
import { manifesto as recebimento } from "../features/recebimento/manifesto.ts";
import { manifesto as recibo } from "../features/recibo/manifesto.ts";
import { manifesto as servicos } from "../features/servicos/manifesto.ts";
import { manifesto as termos } from "../features/termos/manifesto.ts";
import { manifesto as voucher } from "../features/voucher/manifesto.ts";
import type { Modo } from "./modo.ts";

// Registro de funcionalidades: quais telas cada uma tem e se o parceiro via link pode usar.
// Navegação e o futuro Worker leem daqui; liberar ou bloquear é mudar uma linha.
// Cada feature declara o seu em src/features/<x>/manifesto.ts.
export type Feature = {
  id: string;
  telas: Screen[];
  liberadoLink: boolean;
};

export const FEATURES: Feature[] = [
  servicos,
  detalhe,
  fotos,
  checklist,
  finalizar,
  voucher,
  recibo,
  comunicados,
  ideias,
  recebimento,
  despesas,
  colisao,
  manutencao,
  termos,
  historico,
  meuCarro
];

export function featuresDoModo(modo: Modo, features: Feature[] = FEATURES) {
  return modo === "motorista" ? features : features.filter((feature) => feature.liberadoLink);
}

export function telasDoModo(modo: Modo, features: Feature[] = FEATURES): Set<Screen> {
  return new Set(featuresDoModo(modo, features).flatMap((feature) => feature.telas));
}
