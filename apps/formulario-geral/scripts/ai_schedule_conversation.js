(function attachAiScheduleConversationCore(global) {
  "use strict";

  const STATUS = Object.freeze({
    DRAFT: "DRAFT",
    WAITING_AI: "WAITING_AI",
    WAITING_USER: "WAITING_USER",
    READY: "READY",
    SCHEDULING: "SCHEDULING",
    PARTIAL: "PARTIAL",
    SCHEDULED: "SCHEDULED",
    ERROR: "ERROR",
    CANCELLED: "CANCELLED"
  });

  const CONFIRMATIONS = new Set([
    "confirmo", "confirmado", "pode agendar", "pode ser", "pode marcar",
    "sim pode agendar", "sim", "ok pode agendar", "agende"
  ]);

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function idValue(value) {
    if (!value) return "";
    if (typeof value === "string") return text(value).replace(/[{}]/g, "");
    if (typeof value === "object") return text(value.id || value.guid || value.value).replace(/[{}]/g, "");
    return "";
  }

  function identity(value) {
    if (!value) return null;
    if (typeof value === "string") return { id: idValue(value), name: text(value), proposedRegistration: null };
    return {
      id: idValue(value),
      name: text(value.name || value.label || ""),
      proposedRegistration: value.proposedRegistration || value.proposed_registration || null
    };
  }

  function normalizeTime(value) {
    const raw = text(value).replace(/[hH]/g, ":").replace(/\s/g, "");
    const match = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return "";
    const hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (hour > 23 || minute > 59) return "";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function normalizeDate(value) {
    const raw = text(value);
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const br = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
    if (!iso && !br) return "";
    const day = Number(iso ? iso[3] : br[1]);
    const month = Number(iso ? iso[2] : br[2]);
    const year = Number(iso ? iso[1] : br[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function normalizeOption(value) {
    if (!value) return null;
    if (typeof value === "object") {
      const id = value.id || value.value || "";
      const name = text(value.name || value.label || "");
      return { id: idValue(id), value: id, name, label: name };
    }
    return { id: "", value: value, name: text(value), label: text(value) };
  }

  function normalizeService(service) {
    const item = service && typeof service === "object" ? service : {};
    return {
      ordinal: Number(item.ordinal || item.ordem || 1),
      date: normalizeDate(item.date || item.data),
      time: normalizeTime(item.time || item.hora),
      serviceType: normalizeOption(item.serviceType || item.tipoServico),
      vehicleType: normalizeOption(item.vehicleType || item.tipoVeiculo),
      timezone: text(item.timezone || "America/Sao_Paulo"),
      origin: text(item.origin || item.origem),
      destination: text(item.destination || item.destino),
      route: text(item.route || item.trajeto),
      notes: text(item.notes || item.observations || item.observacoes || item.observacao),
      passengers: Array.isArray(item.passengers || item.passageiros) ? (item.passengers || item.passageiros).map(identity).filter(Boolean) : []
    };
  }

  function normalizeProposal(input) {
    const source = input && typeof input === "object" ? input : {};
    const services = Array.isArray(source.services || source.servicos)
      ? (source.services || source.servicos).map((service, index) => ({ ...normalizeService(service), ordinal: index + 1 })) : [];
    return {
      intent: text(source.intent || source.intencao || "schedule").toLowerCase(),
      assistantMessage: text(source.assistantMessage || source.mensagemAssistente),
      question: source.question == null ? null : text(source.question),
      confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : null,
      client: identity(source.client || source.cliente),
      requester: identity(source.requester || source.solicitante),
      passengers: Array.isArray(source.passengers || source.passageiros) ? (source.passengers || source.passageiros).map(identity).filter(Boolean) : [],
      services,
      observations: text(source.observations || source.observacoes),
      missingFields: Array.isArray(source.missingFields) ? source.missingFields.map(text).filter(Boolean) : [],
      warnings: Array.isArray(source.warnings) ? source.warnings.map(text).filter(Boolean) : [],
      timezone: text(source.timezone || "America/Sao_Paulo")
    };
  }

  function requiresRegistrationConfirmation(value) {
    return value?.proposedRegistration?.requiresConfirmation === true;
  }

  function validateProposal(proposal) {
    const normalized = normalizeProposal(proposal);
    const missing = [];
    const warnings = [];
    if (normalized.intent !== "schedule") missing.push("intent.schedule");
    if (requiresRegistrationConfirmation(normalized.client)) missing.push("client.registrationConfirmation");
    if (!normalized.client?.id) missing.push("client");
    if (requiresRegistrationConfirmation(normalized.requester)) missing.push("requester.registrationConfirmation");
    if (!normalized.requester?.id) missing.push("requester");
    if (!normalized.passengers.length && normalized.services.some((service) => !service.passengers.length)) missing.push("passengers");
    if (normalized.passengers.some(requiresRegistrationConfirmation)) missing.push("passengers.registrationConfirmation");
    if (normalized.passengers.some((passenger) => !passenger?.id)) missing.push("passengers.id");
    if (!normalized.services.length) missing.push("services");
    normalized.services.forEach((service, index) => {
      const prefix = `services[${index}]`;
      if (!service.date) missing.push(`${prefix}.date`);
      if (!service.time) missing.push(`${prefix}.time`);
      if (!service.serviceType?.value && !service.serviceType?.id) missing.push(`${prefix}.serviceType`);
      if (!service.vehicleType?.value && !service.vehicleType?.id) missing.push(`${prefix}.vehicleType`);
      if (!service.origin) missing.push(`${prefix}.origin`);
      if (!service.destination) missing.push(`${prefix}.destination`);
      const passengers = service.passengers.length ? service.passengers : normalized.passengers;
      if (!passengers.length) missing.push(`${prefix}.passengers`);
      if (passengers.some(requiresRegistrationConfirmation)) missing.push(`${prefix}.passengers.registrationConfirmation`);
      if (passengers.some((passenger) => !passenger?.id)) missing.push(`${prefix}.passengers.id`);
    });
    // A lista sugerida pela IA pode ficar obsoleta após a revisão humana.
    // A prontidão depende apenas dos valores atuais e das regras determinísticas acima.
    const allWarnings = [...normalized.warnings, ...warnings];
    return { normalized, missing: [...new Set(missing)], warnings: [...new Set(allWarnings)], ready: missing.length === 0 };
  }

  function normalizeConfirmationText(value) {
    return text(value).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[!?.,;:]/g, "").replace(/\s+/g, " ");
  }

  function isExplicitConfirmation(value, context = {}) {
    if (!context.awaitingConfirmation || context.confirmationRequested !== true) return false;
    if (context.confirmedVersion && context.version && context.confirmedVersion === context.version) return false;
    return CONFIRMATIONS.has(normalizeConfirmationText(value));
  }

  function nextStatus(validation, current = STATUS.DRAFT) {
    if (current === STATUS.SCHEDULING || current === STATUS.SCHEDULED || current === STATUS.PARTIAL) return current;
    if (!validation) return STATUS.WAITING_AI;
    return validation.ready ? STATUS.READY : STATUS.WAITING_USER;
  }

  function sessionVersion(session = {}) {
    return Math.max(Number(session.inputVersion || 0), Number(session.processedVersion || 0), 0);
  }

  function dedupeKey(sessionId, version) {
    return `${idValue(sessionId)}:${Number(version || 0)}`;
  }

  function localReservationId(sessionId, ordinal) {
    const base = text(sessionId || "session").replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "session";
    return `local-ai-${base}-${Number(ordinal || 1)}`;
  }

  function localReservationDate(record) {
    const date = new Date(`${text(record?.date)}T${text(record?.time)}:00-03:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function buildLocalReservationRecords({ session = {}, existingRecords = [], now = new Date() } = {}) {
    const proposal = normalizeProposal(session.proposal || {});
    const existingByKey = new Map((Array.isArray(existingRecords) ? existingRecords : [])
      .filter((record) => record?.idempotencyKey)
      .map((record) => [String(record.idempotencyKey), record]));
    return proposal.services.map((service, index) => {
      const ordinal = Number(service.ordinal || index + 1);
      const idempotencyKey = `${text(session.id || "local-session")}:${ordinal}`;
      const existing = existingByKey.get(idempotencyKey);
      if (existing) return existing;
      return {
        id: localReservationId(session.id, ordinal), idempotencyKey, sessionId: text(session.id), ordinal,
        status: "SIMULATED_SCHEDULED",
        createdAt: now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : new Date().toISOString(),
        date: service.date, time: service.time, timezone: service.timezone,
        origin: service.origin, destination: service.destination,
        route: service.route || [service.origin, service.destination].filter(Boolean).join(" / "),
        serviceType: service.serviceType, vehicleType: service.vehicleType,
        observations: service.notes || "", client: proposal.client, requester: proposal.requester,
        passengers: service.passengers.length ? service.passengers : proposal.passengers
      };
    });
  }

  function buildLocalVoucher({ session = {}, reservations = [], now = new Date() } = {}) {
    const proposal = normalizeProposal(session.proposal || {});
    const generatedAt = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const passengers = proposal.passengers.map((passenger) => passenger.name).filter(Boolean);
    const services = (Array.isArray(reservations) ? reservations : [])
      .slice().sort((left, right) => Number(left.ordinal || 0) - Number(right.ordinal || 0))
      .map((record, index) => {
        const date = localReservationDate(record);
        return {
          typeLabel: "Simulação local", shortId: text(record.id).slice(-6).toUpperCase(),
          scheduledAt: `${text(record.date)} ${text(record.time)}`.trim(), sortTime: date?.getTime?.() || index,
          serviceType: text(record.serviceType?.label || record.serviceType?.name) || "Não informado",
          vehicleType: text(record.vehicleType?.label || record.vehicleType?.name) || "A confirmar",
          requester: proposal.requester?.name || "Não informado", passengerSummary: (record.passengers || proposal.passengers).map((passenger) => passenger.name).filter(Boolean).join("\n") || "Não informado",
          route: text(record.route), origin: text(record.origin) || "Não informado",
          destination: text(record.destination) || "Não informado", note: text(record.observations), order: index + 1
        };
      });
    const pad = (value) => String(value).padStart(2, "0");
    return {
      reference: `LOCAL-${generatedAt.getFullYear()}${pad(generatedAt.getMonth() + 1)}${pad(generatedAt.getDate())}-${pad(generatedAt.getHours())}${pad(generatedAt.getMinutes())}-${services.length}`,
      issuedAtLabel: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" }).format(generatedAt),
      client: proposal.client?.name || "Não informado", requester: proposal.requester?.name || "Não informado",
      serviceType: services[0]?.serviceType || "Não informado", vehicleType: services[0]?.vehicleType || "A confirmar",
      status: "Confirmado (localhost)", operationCode: "", costCenter: "",
      passengerSummary: passengers.join("\n") || "Não informado", passengerCount: passengers.length,
      preferenceSummary: proposal.observations || "", services
    };
  }

  function normalizeSession(session = {}) {
    const proposal = normalizeProposal(session.proposal || session.proposalJson);
    const validation = validateProposal(proposal);
    return {
      id: idValue(session.id || session.sessionId),
      status: text(session.status || STATUS.DRAFT).toUpperCase(),
      inputVersion: Number(session.inputVersion || 0),
      processedVersion: Number(session.processedVersion || 0),
      originalText: text(session.originalText || session.text),
      messages: Array.isArray(session.messages) ? session.messages : [],
      proposal: validation.normalized,
      missing: validation.missing,
      warnings: validation.warnings,
      ready: validation.ready,
      confirmationVersion: Number(session.confirmationVersion || 0),
      confirmationRequested: session.confirmationRequested === true,
      createdReservationIds: Array.isArray(session.createdReservationIds) ? session.createdReservationIds.map(idValue).filter(Boolean) : [],
      error: text(session.error)
    };
  }

  global.AIScheduleConversationCore = Object.freeze({
    STATUS,
    normalizeDate,
    normalizeTime,
    normalizeProposal,
    validateProposal,
    normalizeConfirmationText,
    isExplicitConfirmation,
    nextStatus,
    sessionVersion,
    dedupeKey,
    buildLocalReservationRecords,
    buildLocalVoucher,
    normalizeSession
  });
})(typeof window !== "undefined" ? window : globalThis);
