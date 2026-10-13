// Decisão do carro do serviço vinda da Custom API new_ResolverVeiculoDoServico (Infleet).

export type InfleetVehicleCandidate = {
  veiculoId: string | null;
  placa: string;
  modelo: string;
  cor: string;
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
};

// Carro ativo do cadastro, oferecido quando a Infleet não identifica o carro do serviço.
export type FleetVehicle = { id: string; placa: string; modelo: string; cor: string };

// "candidato": um dos carros que a Infleet viu na janela; "frota": qualquer carro ativo, quando a Infleet não identifica.
export type DriverVehicleChoice = { veiculoId: string; placa: string; origem: "candidato" | "frota" };

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
  // Sem carro cadastrado entre os vistos pela Infleet, o motorista escolhe na frota ativa.
  if (decisao === "perguntar" && !candidatos.some((candidate) => candidate.cadastrado)) {
    return { ...unavailableResolution(String(raw.motivo || "sem-candidatos")), candidatos };
  }
  return {
    decisao,
    motivo: String(raw.motivo ?? ""),
    regra: typeof raw.regra === "string" ? raw.regra : undefined,
    janela: parseWindow(raw.janela),
    totalSegundos: Number(raw.totalSegundos) || 0,
    candidatos,
    escolhido: escolhido ?? undefined
  };
}

// Candidatos que o motorista pode escolher: só os carros cadastrados no Dataverse.
export function selectableCandidates(resolution: InfleetVehicleResolution) {
  return resolution.candidatos.filter((candidate) => candidate.cadastrado && candidate.veiculoId);
}

// Sem decisão automática o motorista sempre escolhe; sem candidato cadastrado, escolhe na frota ativa.
export function needsDriverChoice(resolution: InfleetVehicleResolution) {
  return resolution.decisao !== "automatico";
}

export function needsFleetChoice(resolution: InfleetVehicleResolution) {
  return needsDriverChoice(resolution) && selectableCandidates(resolution).length === 0;
}

// "Corolla Prata"; cadastro em caixa alta ("PRETA") vira "Preta"; sem modelo nem cor, cai na placa.
export function describeVehicle(candidate: Pick<InfleetVehicleCandidate, "modelo" | "cor" | "placa">) {
  return [candidate.modelo, candidate.cor].map((part) => softenUppercase(part.trim())).filter(Boolean).join(" ") || candidate.placa;
}

function softenUppercase(text: string) {
  if (text.length <= 3 || text !== text.toUpperCase() || text === text.toLowerCase()) return text;
  return text.toLowerCase().replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

// Patch da reserva: carro decidido pela Infleet ou escolhido pelo motorista. A posse não é usada.
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

  if (!choice?.veiculoId) return patch;
  if (choice.origem === "candidato") {
    const candidate = selectableCandidates(resolution).find((item) => item.veiculoId === choice.veiculoId);
    if (resolution.decisao !== "perguntar" || !candidate?.veiculoId) return patch;
    patch["cr40f_Veiculo@odata.bind"] = vehicleBind(candidate.veiculoId);
    patch.new_origemveiculo = SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN;
    patch.new_percentualveiculoinfleet = candidate.percentual;
    return patch;
  }
  if (!needsFleetChoice(resolution)) return patch;
  patch["cr40f_Veiculo@odata.bind"] = vehicleBind(choice.veiculoId);
  patch.new_origemveiculo = SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN;
  patch.new_percentualveiculoinfleet = 0;
  return patch;
}

function parseCandidate(value: unknown): InfleetVehicleCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const veiculoId = typeof raw.veiculoId === "string" && raw.veiculoId ? raw.veiculoId : null;
  return {
    veiculoId,
    placa: String(raw.placa ?? ""),
    modelo: String(raw.modelo ?? ""),
    cor: String(raw.cor ?? ""),
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
