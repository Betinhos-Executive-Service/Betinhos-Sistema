// Trocas de carro: janela, âncoras, veículos, contatos e o texto exibido na agenda e no detalhe.
import type { DetailField } from "../../types";
import { cleanGuid, cleanODataGuid, dataverseWarn, retrieveMultiple, type DataverseRecord, type DriverContext } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { getFormatted, getLookupId, getLookupName, getVehicleLabel, normalizeText, toDate } from "../../data/dataverse/registros.ts";

export const EXCHANGE_STATUS = {
  programada: 202410000,
  confirmada: 100000001,
  concluida: 202410001
} as const;

const EXCHANGE_TYPE = {
  troca: 100000000,
  devolucaoBase: 100000001,
  retiradaBase: 100000002,
  repasse: 100000003
} as const;

export const EXCHANGE_SELECT =
  "$select=cr40f_trocasdecarroid,cr40f_id,cr40f_iniciodajaneladetroca,cr40f_fimdajaneladetroca,_cr40f_motorista1_value,_cr40f_motorista2_value,_cr40f_veiculo1antesdatroca_value,_cr40f_veiculo2antesdatroca_value,cr40f_observacao,cr40f_statusdatroca,new_tipodetroca,new_concluidomotorista1,new_concluidomotorista2,new_observacaodomotorista1,new_observacaodomotorista2,new_mododajanela,new_localdatroca,_new_m1depoisde_value,_new_m1antesde_value,_new_m2depoisde_value,_new_m2antesde_value,_new_localdebase_value";

export function getExchangeIdFromGeral(record: DataverseRecord) {
  return cleanODataGuid(record._cr40f_ot_value);
}

function getExchangeVehicleLabel(exchange: DataverseRecord, logicalName: string) {
  return String(exchange[`__${logicalName}Label`] ?? getLookupName(exchange, logicalName));
}

async function hydrateExchangeVehicleLabels(exchanges: DataverseRecord[], readMultiple = retrieveMultiple) {
  const vehicleIds = Array.from(
    new Set(
      exchanges
        .flatMap((exchange) => [
          getLookupId(exchange, "cr40f_veiculo1antesdatroca"),
          getLookupId(exchange, "cr40f_veiculo2antesdatroca")
        ])
        .filter(Boolean)
    )
  );
  if (vehicleIds.length === 0) return exchanges;

  try {
    const vehicleResult = await readMultiple(
      DATAVERSE.veiculos,
      [
        "$select=cr40f_veiculosid,cr40f_placa,cr40f_marca,cr40f_modelo,cr40f_cor",
        `$filter=${vehicleIds.map((id) => `cr40f_veiculosid eq ${id}`).join(" or ")}`,
        `$top=${vehicleIds.length}`
      ].join("&")
    );
    const vehicleLabelById = new Map(
      vehicleResult.entities
        .map((vehicle) => [cleanODataGuid(vehicle.cr40f_veiculosid), getVehicleLabel(vehicle)] as const)
        .filter(([id]) => Boolean(id))
    );

    return exchanges.map((exchange) => {
      const vehicle1Id = getLookupId(exchange, "cr40f_veiculo1antesdatroca");
      const vehicle2Id = getLookupId(exchange, "cr40f_veiculo2antesdatroca");
      return {
        ...exchange,
        __cr40f_veiculo1antesdatrocaLabel: vehicleLabelById.get(vehicle1Id) ?? getLookupName(exchange, "cr40f_veiculo1antesdatroca"),
        __cr40f_veiculo2antesdatrocaLabel: vehicleLabelById.get(vehicle2Id) ?? getLookupName(exchange, "cr40f_veiculo2antesdatroca")
      };
    });
  } catch (error) {
    dataverseWarn("Falha ao enriquecer labels dos veiculos da troca.", { error });
    return exchanges;
  }
}

const EXCHANGE_WINDOW_MODE_BETWEEN = 100000001;
const EXCHANGE_ANCHOR_LOOKUPS = ["new_m1depoisde", "new_m1antesde", "new_m2depoisde", "new_m2antesde"] as const;

type ExchangeAnchor = { id: string; label: string; departure: string };

export async function hydrateExchangeAnchors(exchanges: DataverseRecord[], readMultiple = retrieveMultiple) {
  const anchorIds = Array.from(
    new Set(exchanges.flatMap((exchange) => EXCHANGE_ANCHOR_LOOKUPS.map((lookup) => getLookupId(exchange, lookup))).filter(Boolean))
  );
  if (anchorIds.length === 0) return exchanges;
  try {
    const result = await readMultiple(
      DATAVERSE.geral,
      [
        "$select=cr40f_reservadeveculosid,cr40f_id,cr40f_dataehorriodesada",
        `$filter=${anchorIds.map((id) => `cr40f_reservadeveculosid eq ${id}`).join(" or ")}`,
        `$top=${anchorIds.length}`
      ].join("&")
    );
    const byId = new Map(
      result.entities.map((row) => [cleanODataGuid(row.cr40f_reservadeveculosid), { id: cleanODataGuid(row.cr40f_reservadeveculosid), label: String(row.cr40f_id ?? ""), departure: String(row.cr40f_dataehorriodesada ?? "") }] as const)
    );
    return exchanges.map((exchange) => {
      const anchors: Record<string, ExchangeAnchor> = {};
      for (const lookup of EXCHANGE_ANCHOR_LOOKUPS) {
        const id = getLookupId(exchange, lookup);
        if (id) anchors[lookup] = byId.get(id) ?? { id, label: getLookupName(exchange, lookup), departure: "" };
      }
      return { ...exchange, __anchors: anchors };
    });
  } catch (error) {
    dataverseWarn("Falha ao carregar os serviços de referência da troca.", { error });
    return exchanges;
  }
}

async function hydrateExchangeBaseLocations(exchanges: DataverseRecord[], readMultiple = retrieveMultiple) {
  const locationIds = Array.from(new Set(exchanges.map((exchange) => getLookupId(exchange, "new_localdebase")).filter(Boolean)));
  if (locationIds.length === 0) return exchanges;

  try {
    const locationResult = await readMultiple(
      DATAVERSE.locaisBase,
      [
        "$select=new_localdebaseid,new_name,new_endereco,new_linkmapa",
        `$filter=${locationIds.map((id) => `new_localdebaseid eq ${id}`).join(" or ")}`,
        `$top=${locationIds.length}`
      ].join("&")
    );
    const locationById = new Map(
      locationResult.entities
        .map((location) => [cleanODataGuid(location.new_localdebaseid), location] as const)
        .filter(([id]) => Boolean(id))
    );

    return exchanges.map((exchange) => {
      const location = locationById.get(getLookupId(exchange, "new_localdebase"));
      if (!location) return exchange;
      return {
        ...exchange,
        __baseLocationName: String(location.new_name ?? ""),
        __baseLocationAddress: String(location.new_endereco ?? ""),
        __baseLocationMapUrl: String(location.new_linkmapa ?? "")
      };
    });
  } catch (error) {
    dataverseWarn("Falha ao enriquecer o local da base da troca.", { error });
    return exchanges;
  }
}

export type ExchangeWindowCheck = { mode: "fixed" | "between"; start: string; end: string; ownBeforeDeparture: string };

/** Fora da janela: horário marcado fora de início–fim; entre serviços, depois da saída da própria OS "antes de". */
export function isExchangeOutsideWindow(check: ExchangeWindowCheck | undefined, now = new Date()) {
  if (!check) return false;
  if (check.mode === "between") {
    const before = toDate(check.ownBeforeDeparture);
    return !!before && now > before;
  }
  const start = toDate(check.start);
  const end = toDate(check.end);
  return (!!start && now < start) || (!!end && now > end);
}

function anchorText(anchor: ExchangeAnchor | undefined) {
  if (!anchor) return "";
  const at = toDate(anchor.departure);
  const time = at ? at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  return [anchor.label || "serviço", time ? `(${time})` : ""].filter(Boolean).join(" ");
}

/** Selo e frase da janela para o motorista que está vendo a troca. */
export function buildExchangeWindowInfo(exchange: DataverseRecord, driver?: DriverContext | null) {
  const driverId = cleanGuid(driver?.id ?? "");
  const isDriver2 = !!driverId && cleanODataGuid(exchange._cr40f_motorista2_value) === driverId;
  const between = Number(exchange.new_mododajanela) === EXCHANGE_WINDOW_MODE_BETWEEN;
  const location = String(exchange.new_localdatroca ?? "").trim();
  const start = toDate(exchange.cr40f_iniciodajaneladetroca);
  const end = toDate(exchange.cr40f_fimdajaneladetroca);
  if (!between) {
    return {
      mode: "fixed" as const,
      seal: "Horário marcado",
      phrase: start && end
        ? `Troque em ${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} entre ${start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} e ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
        : "Troque no horário combinado.",
      location,
      check: { mode: "fixed" as const, start: String(exchange.cr40f_iniciodajaneladetroca ?? ""), end: String(exchange.cr40f_fimdajaneladetroca ?? ""), ownBeforeDeparture: "" }
    };
  }
  const anchors = (exchange.__anchors ?? {}) as Record<string, ExchangeAnchor>;
  const after = anchors[isDriver2 ? "new_m2depoisde" : "new_m1depoisde"];
  const before = anchors[isDriver2 ? "new_m2antesde" : "new_m1antesde"];
  const other = getLookupName(exchange, isDriver2 ? "cr40f_motorista1" : "cr40f_motorista2");
  const phrase = after && before
    ? `Troque depois da ${anchorText(after)} e antes da ${anchorText(before)}.`
    : after
      ? `Troque depois da ${anchorText(after)}.`
      : before
        ? `Troque antes da ${anchorText(before)}.`
        : other
          ? `Troque com ${other} quando os dois estiverem livres.`
          : "Troque assim que estiver livre.";
  return {
    mode: "between" as const,
    seal: "Entre serviços",
    phrase,
    location,
    check: { mode: "between" as const, start: "", end: "", ownBeforeDeparture: before?.departure ?? "" }
  };
}

export async function hydrateExchangeDetails(exchanges: DataverseRecord[], readMultiple = retrieveMultiple) {
  return hydrateExchangeBaseLocations(await hydrateExchangeVehicleLabels(exchanges, readMultiple), readMultiple);
}

function getOtherExchangeDriverId(exchange: DataverseRecord, driverId: string) {
  const cleanDriverId = cleanGuid(driverId);
  const driver1Id = getLookupId(exchange, "cr40f_motorista1");
  const driver2Id = getLookupId(exchange, "cr40f_motorista2");
  if (driver1Id === cleanDriverId) return driver2Id;
  if (driver2Id === cleanDriverId) return driver1Id;
  return "";
}

function getDriverContactPhone(driver: DataverseRecord) {
  return String(driver.cr40f_telefonecorporativo ?? driver.cr40f_telefonepessoal ?? "").trim();
}

export async function hydrateExchangeDriverContactPhones(exchanges: DataverseRecord[], driver: DriverContext, readMultiple = retrieveMultiple) {
  const otherDriverIds = Array.from(
    new Set(exchanges.map((exchange) => getOtherExchangeDriverId(exchange, driver.id)).filter(Boolean))
  );
  if (otherDriverIds.length === 0) return exchanges;

  try {
    const result = await readMultiple(
      DATAVERSE.funcionarios,
      [
        "$select=cr40f_funcionariosid,cr40f_telefonecorporativo,cr40f_telefonepessoal",
        `$filter=${otherDriverIds.map((id) => `cr40f_funcionariosid eq ${id}`).join(" or ")}`,
        `$top=${otherDriverIds.length}`
      ].join("&")
    );
    const phoneByDriverId = new Map(
      result.entities
        .map((employee) => [cleanODataGuid(employee.cr40f_funcionariosid), getDriverContactPhone(employee)] as const)
        .filter(([id, phone]) => Boolean(id && phone))
    );

    return exchanges.map((exchange) => {
      const otherDriverId = getOtherExchangeDriverId(exchange, driver.id);
      return {
        ...exchange,
        __otherDriverPhone: phoneByDriverId.get(otherDriverId) ?? ""
      };
    });
  } catch (error) {
    dataverseWarn("Falha ao enriquecer telefone do outro motorista da troca.", { error });
    return exchanges;
  }
}

export function isBaseExchange(record: DataverseRecord) {
  const exchangeTypeValue = Number(record.new_tipodetroca);
  const exchangeType = normalizeText(getFormatted(record, "new_tipodetroca"));
  return (
    exchangeTypeValue === EXCHANGE_TYPE.retiradaBase ||
    exchangeTypeValue === EXCHANGE_TYPE.devolucaoBase ||
    exchangeType.includes("retirada") ||
    exchangeType.includes("devolucao") ||
    exchangeType.includes("devolu")
  );
}

export function getExchangeCompletionState(record: DataverseRecord, isDriver1: boolean, isDriver2: boolean) {
  const driver1Done = isDriver1 ? true : record.new_concluidomotorista1 === true;
  const driver2Done = isDriver2 ? true : record.new_concluidomotorista2 === true;
  const baseExchange = isBaseExchange(record);
  return {
    driver1Done,
    driver2Done,
    baseExchange,
    closesExchange: baseExchange ? driver1Done : driver1Done && driver2Done
  };
}

export function shouldShowOpenExchangeForDriver(exchange: DataverseRecord, driverId: string) {
  const status = Number(exchange.cr40f_statusdatroca);
  if (status !== EXCHANGE_STATUS.programada) return false;
  const cleanDriverId = cleanGuid(driverId);
  const isDriver1 = cleanODataGuid(exchange._cr40f_motorista1_value) === cleanDriverId;
  const isDriver2 = cleanODataGuid(exchange._cr40f_motorista2_value) === cleanDriverId;
  if (isDriver1 && exchange.new_concluidomotorista1 === true) return false;
  if (isDriver2 && exchange.new_concluidomotorista2 === true) return false;
  return isDriver1 || isDriver2;
}

type ExchangeKind = "troca" | "devolucaoBase" | "retiradaBase";

function getExchangeKind(record: DataverseRecord): ExchangeKind {
  const exchangeTypeValue = Number(record.new_tipodetroca);
  const exchangeType = normalizeText(getFormatted(record, "new_tipodetroca"));
  if (exchangeTypeValue === EXCHANGE_TYPE.retiradaBase || exchangeType.includes("retirada")) return "retiradaBase";
  if (exchangeTypeValue === EXCHANGE_TYPE.devolucaoBase || exchangeType.includes("devolucao") || exchangeType.includes("devolu")) return "devolucaoBase";
  return "troca";
}

function joinDateRange(start: Date | null, end: Date | null) {
  const startText = start
    ? start.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";
  const endText = end ? end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  return [startText, endText].filter(Boolean).join(" - ");
}

function notInformed(value: string, fallback = "Não informado") {
  return value.trim() || fallback;
}

function getBaseLocation(exchange: DataverseRecord) {
  const name = String(exchange.__baseLocationName ?? getLookupName(exchange, "new_localdebase") ?? "").trim();
  const address = String(exchange.__baseLocationAddress ?? "").trim();
  const mapUrl = String(exchange.__baseLocationMapUrl ?? "").trim();
  const mapLink = mapUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "");
  const fields: DetailField[] = [
    { label: "Local", value: name || "Base operacional", strong: Boolean(name) },
    ...(address ? [{ label: "Endereço", value: address }] : []),
    ...(mapLink ? [{ label: "Mapa", value: mapLink }] : [])
  ];
  return { name, place: name ? `em ${name}` : "na base", fields };
}

export function buildExchangeDisplay(exchange: DataverseRecord, driver?: DriverContext | null) {
  const kind = getExchangeKind(exchange);
  const start = toDate(exchange.cr40f_iniciodajaneladetroca);
  const end = toDate(exchange.cr40f_fimdajaneladetroca);
  const driverId = cleanGuid(driver?.id ?? "");
  const isDriver1 = cleanODataGuid(exchange._cr40f_motorista1_value) === driverId;
  const isDriver2 = cleanODataGuid(exchange._cr40f_motorista2_value) === driverId;
  const driver1 = getLookupName(exchange, "cr40f_motorista1");
  const driver2 = getLookupName(exchange, "cr40f_motorista2");
  const vehicle1 = getExchangeVehicleLabel(exchange, "cr40f_veiculo1antesdatroca");
  const vehicle2 = getExchangeVehicleLabel(exchange, "cr40f_veiculo2antesdatroca");
  const currentVehicle = isDriver2 ? vehicle2 : vehicle1;
  const nextVehicle = isDriver2 ? vehicle1 : vehicle2;
  const otherDriver = isDriver2 ? driver1 : driver2;

  if (kind === "retiradaBase") {
    const receiving = notInformed(vehicle2);
    const location = getBaseLocation(exchange);
    return {
      label: "Retirada na Base",
      title: "Retirada na Base",
      description: `Retirar ${receiving} ${location.place}`,
      summary: location.name ? `Retire ${receiving} em ${location.name}.` : `Retire ${receiving} na base operacional.`,
      window: joinDateRange(start, end),
      fields: [
        { label: "O que fazer", value: `Retirar veículo na base`, strong: true },
        { label: "Você recebe", value: receiving, strong: true },
        ...location.fields,
        { label: "Responsável", value: notInformed(driver1) }
      ]
    };
  }

  if (kind === "devolucaoBase") {
    const delivering = notInformed(vehicle1);
    const location = getBaseLocation(exchange);
    return {
      label: "Devolução à Base",
      title: "Devolução à Base",
      description: `Devolver ${delivering} ${location.place}`,
      summary: location.name ? `Devolva ${delivering} em ${location.name}.` : `Devolva ${delivering} na base operacional.`,
      window: joinDateRange(start, end),
      fields: [
        { label: "O que fazer", value: `Devolver veículo na base`, strong: true },
        { label: "Você entrega", value: delivering, strong: true },
        ...location.fields,
        { label: "Responsável", value: notInformed(driver1) }
      ]
    };
  }

  if (isDriver1 || isDriver2) {
    if (!vehicle2.trim()) {
      const transferredVehicle = notInformed(vehicle1);
      const contact = notInformed(otherDriver, "Outro motorista não informado");
      const otherDriverPhone = String(exchange.__otherDriverPhone ?? "").trim();
      const giver = isDriver1;
      const handoffLabel = Number(exchange.new_tipodetroca) === EXCHANGE_TYPE.repasse ? "Repasse de Veículo" : "Transferência de Veículo";
      return {
        label: handoffLabel,
        title: handoffLabel,
        description: giver
          ? `Entregar ${transferredVehicle} para ${contact}`
          : `Receber ${transferredVehicle} de ${contact}`,
        summary: giver
          ? `Entregue ${transferredVehicle} para ${contact}.`
          : `Receba ${transferredVehicle} de ${contact}.`,
        window: joinDateRange(start, end),
        fields: [
          { label: "O que fazer", value: giver ? `Entregar veículo para ${contact}` : `Receber veículo de ${contact}`, strong: true },
          { label: giver ? "Você entrega" : "Você recebe", value: transferredVehicle, strong: true },
          { label: "Encontrar com", value: contact },
          ...(otherDriverPhone ? [{ label: "Telefone do motorista", value: otherDriverPhone, contact: { phone: otherDriverPhone } }] : [])
        ]
      };
    }
    const delivering = notInformed(currentVehicle);
    const receiving = notInformed(nextVehicle);
    const contact = notInformed(otherDriver, "Outro motorista não informado");
    const otherDriverPhone = String(exchange.__otherDriverPhone ?? "").trim();
    return {
      label: "Troca entre Motoristas",
      title: "Troca entre Motoristas",
      description: `Entregar ${delivering} e receber ${receiving}`,
      summary: `Troque com ${contact}. Entregue ${delivering} e receba ${receiving}.`,
      window: joinDateRange(start, end),
      fields: [
        { label: "O que fazer", value: `Trocar veículo com ${contact}`, strong: true },
        { label: "Você entrega", value: delivering, strong: true },
        { label: "Você recebe", value: receiving, strong: true },
        { label: "Encontrar com", value: contact },
        ...(otherDriverPhone ? [{ label: "Telefone do motorista", value: otherDriverPhone, contact: { phone: otherDriverPhone } }] : [])
      ]
    };
  }

  return {
    label: "Troca entre Motoristas",
    title: "Troca entre Motoristas",
    description: `${notInformed(vehicle1)} por ${notInformed(vehicle2)}`,
    summary: `Troca entre ${notInformed(driver1)} e ${notInformed(driver2)}.`,
    window: joinDateRange(start, end),
    fields: [
      { label: "O que fazer", value: `Trocar veículos`, strong: true },
      { label: "Motorista 1 entrega", value: notInformed(vehicle1), strong: true },
      { label: "Motorista 2 entrega", value: notInformed(vehicle2), strong: true },
      { label: "Motorista 1", value: notInformed(driver1) },
      { label: "Motorista 2", value: notInformed(driver2) }
    ]
  };
}
