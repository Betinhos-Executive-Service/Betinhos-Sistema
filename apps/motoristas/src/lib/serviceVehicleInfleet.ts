// Decisão do carro do serviço vinda da Custom API new_ResolverVeiculoDoServico (Infleet).

export type InfleetVehicleCandidate = {
  veiculoId: string | null;
  placa: string;
  segundos: number;
  percentual: number;
  cadastrado: boolean;
};

export type InfleetVehicleDecision = "automatico" | "perguntar" | "indisponivel";

export type InfleetVehicleResolution = {
  decisao: InfleetVehicleDecision;
  motivo: string;
  regra?: string;
  janela?: { inicio: string; fim: string };
  totalSegundos: number;
  candidatos: InfleetVehicleCandidate[];
  escolhido?: InfleetVehicleCandidate;
  veiculoPosseId?: string | null;
};

// Escolha do motorista quando a Infleet não decide sozinha.
export type DriverVehicleChoice = { veiculoId: string; placa: string; origem: "candidato" | "outro" };

export const SERVICE_VEHICLE_ORIGIN_INFLEET = 100000002;
export const SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN = 100000003;

export function unavailableResolution(motivo: string): InfleetVehicleResolution {
  return { decisao: "indisponivel", motivo, totalSegundos: 0, candidatos: [] };
}

export function parseInfleetVehicleResolution(json: unknown): InfleetVehicleResolution {
  let value: unknown = json;
  if (typeof json === "string") {
    try {
      value = JSON.parse(json);
    } catch {
      return unavailableResolution("resposta-invalida");
    }
  }
  const raw = (value ?? {}) as Record<string, unknown>;
  const decisao = raw.decisao;
  if (decisao !== "automatico" && decisao !== "perguntar" && decisao !== "indisponivel") {
    return unavailableResolution("resposta-invalida");
  }
  const candidatos = Array.isArray(raw.candidatos) ? raw.candidatos.map(parseCandidate).filter(isCandidate) : [];
  const escolhido = parseCandidate(raw.escolhido);
  if (decisao === "automatico" && !escolhido?.veiculoId) return unavailableResolution("resposta-invalida");
  return {
    decisao,
    motivo: String(raw.motivo ?? ""),
    regra: typeof raw.regra === "string" ? raw.regra : undefined,
    janela: parseWindow(raw.janela),
    totalSegundos: Number(raw.totalSegundos) || 0,
    candidatos,
    escolhido: escolhido ?? undefined,
    veiculoPosseId: typeof raw.veiculoPosseId === "string" ? raw.veiculoPosseId : null
  };
}

// Candidatos que o motorista pode escolher: só os carros cadastrados no Dataverse.
export function selectableCandidates(resolution: InfleetVehicleResolution) {
  return resolution.candidatos.filter((candidate) => candidate.cadastrado && candidate.veiculoId);
}

export function formatUsageDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// Patch da reserva para "automatico" e "perguntar". Em "indisponivel" o chamador usa a posse e só grava a evidência.
export function buildInfleetServiceVehiclePatch(
  resolution: InfleetVehicleResolution,
  choice: DriverVehicleChoice | null,
  vehicleBind: (vehicleId: string) => string
): Record<string, unknown> {
  const evidence = { ...resolution, escolhaMotorista: choice ?? undefined, registradoEm: new Date().toISOString() };
  const patch: Record<string, unknown> = { new_evidenciaveiculoinfleet: JSON.stringify(evidence) };

  if (resolution.decisao === "automatico" && resolution.escolhido?.veiculoId) {
    patch["cr40f_Veiculo@odata.bind"] = vehicleBind(resolution.escolhido.veiculoId);
    patch.new_origemveiculo = SERVICE_VEHICLE_ORIGIN_INFLEET;
    patch.new_percentualveiculoinfleet = resolution.escolhido.percentual;
    return patch;
  }

  if (resolution.decisao === "perguntar" && choice?.veiculoId) {
    const candidate = resolution.candidatos.find((item) => item.veiculoId === choice.veiculoId);
    patch["cr40f_Veiculo@odata.bind"] = vehicleBind(choice.veiculoId);
    patch.new_origemveiculo = SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN;
    patch.new_percentualveiculoinfleet = candidate ? candidate.percentual : 0;
  }
  return patch;
}

function parseCandidate(value: unknown): InfleetVehicleCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const veiculoId = typeof raw.veiculoId === "string" && raw.veiculoId ? raw.veiculoId : null;
  return {
    veiculoId,
    placa: String(raw.placa ?? ""),
    segundos: Number(raw.segundos) || 0,
    percentual: Number(raw.percentual) || 0,
    cadastrado: raw.cadastrado === true && Boolean(veiculoId)
  };
}

function isCandidate(value: InfleetVehicleCandidate | null): value is InfleetVehicleCandidate {
  return value !== null;
}

function parseWindow(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  return { inicio: String(raw.inicio ?? ""), fim: String(raw.fim ?? "") };
}
