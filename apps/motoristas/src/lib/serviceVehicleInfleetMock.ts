// Cenários da Infleet para testar a finalização no mock local (sem Dataverse e sem Infleet).
// Escolha pela URL: ?mockInfleet=perguntar. Sem parâmetro, cada serviço usa um cenário diferente.
import { parseInfleetVehicleResolution, type InfleetVehicleCandidate, type InfleetVehicleResolution } from "./serviceVehicleInfleet.ts";

export const MOCK_INFLEET_SCENARIOS = [
  "automatico",
  "automatico-com-troca",
  "perguntar",
  "perguntar-tres",
  "perguntar-um-cadastrado",
  "sem-viagens",
  "nao-cadastrado",
  "indisponivel",
  "lento"
] as const;

export type MockInfleetScenario = (typeof MOCK_INFLEET_SCENARIOS)[number];

const candidate = (veiculoId: string | null, placa: string, modelo: string, cor: string, minutos: number, percentual: number): InfleetVehicleCandidate => ({
  veiculoId,
  placa,
  modelo,
  cor,
  segundos: minutos * 60,
  percentual,
  cadastrado: Boolean(veiculoId)
});

const RTI = (minutos: number, percentual: number) => candidate("mock-veiculo-rti", "RTI7G00", "Corolla", "Prata", minutos, percentual);
const GEZ = (minutos: number, percentual: number) => candidate("mock-veiculo-gez", "GEZ6D67", "Corolla", "Preto", minutos, percentual);
const RUH = (minutos: number, percentual: number) => candidate("mock-veiculo-ruh", "RUH7G45", "Compass", "Branco", minutos, percentual);
const ABC = (minutos: number, percentual: number) => candidate(null, "ABC1D23", "", "", minutos, percentual);

export function pickMockInfleetScenario(detailId: string, search = typeof window === "undefined" ? "" : window.location.search): MockInfleetScenario {
  const requested = new URLSearchParams(search).get("mockInfleet");
  if (requested && (MOCK_INFLEET_SCENARIOS as readonly string[]).includes(requested)) return requested as MockInfleetScenario;
  let hash = 0;
  for (const char of detailId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MOCK_INFLEET_SCENARIOS[hash % MOCK_INFLEET_SCENARIOS.length];
}

// Resposta crua como a Custom API devolveria; passa pelo mesmo parse do app real.
export function buildMockInfleetResolution(scenario: MockInfleetScenario): InfleetVehicleResolution {
  const base = { regra: "ignicao-85-v1", veiculoPosseId: "mock-veiculo-gez" };
  const raw = (() => {
    switch (scenario) {
      case "automatico":
      case "lento":
        return { ...base, decisao: "automatico", motivo: "acima-do-limite", totalSegundos: 9000, candidatos: [RTI(150, 100)], escolhido: RTI(150, 100) };
      case "automatico-com-troca":
        return { ...base, decisao: "automatico", motivo: "acima-do-limite", totalSegundos: 10200, candidatos: [RTI(150, 88.2), GEZ(20, 11.8)], escolhido: RTI(150, 88.2) };
      case "perguntar":
        return { ...base, decisao: "perguntar", motivo: "abaixo-do-limite", totalSegundos: 10800, candidatos: [GEZ(108, 60), RTI(72, 40)] };
      case "perguntar-tres":
        return { ...base, decisao: "perguntar", motivo: "abaixo-do-limite", totalSegundos: 12000, candidatos: [GEZ(90, 45), RTI(70, 35), RUH(40, 20)] };
      case "perguntar-um-cadastrado":
        return { ...base, decisao: "perguntar", motivo: "veiculo-nao-cadastrado", totalSegundos: 9000, candidatos: [ABC(120, 80), RTI(30, 20)] };
      case "sem-viagens":
        return { ...base, decisao: "indisponivel", motivo: "sem-viagens-do-motorista", totalSegundos: 0, candidatos: [] };
      case "nao-cadastrado":
        return { ...base, decisao: "indisponivel", motivo: "veiculo-nao-cadastrado", totalSegundos: 6000, candidatos: [ABC(100, 100)] };
      case "indisponivel":
        return { ...base, decisao: "indisponivel", motivo: "infleet-indisponivel: Infleet não respondeu a tempo.", totalSegundos: 0, candidatos: [] };
    }
  })();
  return parseInfleetVehicleResolution(raw);
}

export async function resolveMockServiceVehicle(scenario: MockInfleetScenario): Promise<InfleetVehicleResolution> {
  await new Promise((resolve) => setTimeout(resolve, scenario === "lento" ? 4000 : 700));
  return buildMockInfleetResolution(scenario);
}
