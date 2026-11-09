import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { AI_SCHEDULE_CONVERSATION_FIXTURES } from "./ai_schedule_conversation.fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts", "ai_schedule_conversation.js"), "utf8");
const schema = JSON.parse(fs.readFileSync(path.join(root, "docs", "power-platform", "ai_schedule_proposal.schema.json"), "utf8"));
const context = { globalThis: {}, console };
vm.runInNewContext(source, context);
const core = context.globalThis.AIScheduleConversationCore;

assert.ok(core, "core de conversa deve exportar API global");
assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.ok(schema.required.includes("services"), "schema deve exigir serviços");
assert.equal(core.normalizeDate("14/09/2026"), "2026-09-14");
assert.equal(core.normalizeDate("2026-02-30"), "");
assert.equal(core.normalizeDate("2028-02-29"), "2028-02-29");
assert.equal(core.normalizeTime("8h30"), "08:30");

const incomplete = core.validateProposal({
  client: { id: "client-1", name: "Cliente" },
  requester: { id: "requester-1", name: "Solicitante" },
  passengers: [{ id: "passenger-1", name: "Passageiro" }],
  services: [{ origin: "São Paulo", destination: "GRU" }]
});
assert.equal(incomplete.ready, false);
assert.equal(core.validateProposal({ ...incomplete.normalized, services: [{ ...incomplete.normalized.services[0], date: "2026-02-30" }] }).ready, false);
assert.ok(incomplete.missing.includes("services[0].date"));
assert.ok(incomplete.missing.includes("services[0].serviceType"));

const proposedRegistration = core.validateProposal({
  client: { id: "client-1", name: "Cliente" },
  requester: { id: "requester-1", name: "Solicitante" },
  passengers: [{ name: "Pessoa nova", proposedRegistration: { requiresConfirmation: true } }],
  services: [{ date: "2026-09-14", time: "08:30", serviceType: { value: 202410000 }, vehicleType: { value: 202410001 }, origin: "São Paulo", destination: "GRU" }]
});
assert.equal(proposedRegistration.ready, false);
assert.ok(proposedRegistration.missing.includes("passengers.registrationConfirmation"));

const complete = core.validateProposal({
  client: { id: "client-1", name: "Cliente" },
  requester: { id: "requester-1", name: "Solicitante" },
  passengers: [{ id: "passenger-1", name: "Passageiro" }],
  services: [{
    date: "2026-09-14", time: "08:30", serviceType: { value: 202410000, name: "Guarulhos" },
    vehicleType: { value: 202410001, name: "Executivo" }, origin: "São Paulo", destination: "GRU"
  }]
});
assert.equal(complete.ready, true);
assert.equal(core.validateProposal({ ...complete.normalized, missingFields: ["serviceType", "services[0].vehicleType"] }).ready, true);
assert.equal(core.nextStatus(complete), core.STATUS.READY);
assert.equal(core.isExplicitConfirmation("Pode ser!", { awaitingConfirmation: true, confirmationRequested: true, version: 2 }), true);
assert.equal(core.isExplicitConfirmation("Pode ser!", { awaitingConfirmation: true, confirmationRequested: false, version: 2 }), false);
assert.equal(core.isExplicitConfirmation("confirmo", { awaitingConfirmation: true, confirmationRequested: true, version: 2, confirmedVersion: 2 }), false);
assert.equal(core.dedupeKey("abc", 3), "abc:3");
assert.equal(core.nextStatus(complete, core.STATUS.SCHEDULED), core.STATUS.SCHEDULED);

const localSession = { id: "local-session-1", proposal: complete.normalized };
const localRecords = core.buildLocalReservationRecords({ session: localSession, now: new Date("2026-09-14T12:00:00.000Z") });
assert.equal(localRecords.length, 1);
assert.equal(localRecords[0].idempotencyKey, "local-session-1:1");
assert.deepEqual(core.buildLocalReservationRecords({ session: localSession, existingRecords: localRecords }).map((item) => item.id), localRecords.map((item) => item.id));
const localVoucher = core.buildLocalVoucher({ session: localSession, reservations: localRecords, now: new Date("2026-09-14T12:00:00.000Z") });
assert.equal(localVoucher.services.length, localRecords.length);
assert.equal(localVoucher.services[0].shortId, localRecords[0].id.slice(-6).toUpperCase());
assert.match(localVoucher.status, /localhost/);

const multiService = core.validateProposal({
  ...complete.normalized,
  passengers: [],
  services: [
    { ...complete.normalized.services[0], ordinal: 1, passengers: [{ id: "passenger-1", name: "Ana" }] },
    { ...complete.normalized.services[0], ordinal: 2, passengers: [{ id: "passenger-2", name: "Carlos" }] }
  ]
});
assert.equal(multiService.ready, true);
assert.deepEqual(core.normalizeProposal({ ...complete.normalized, services: [{ ...complete.normalized.services[0], ordinal: 1 }, { ...complete.normalized.services[0], ordinal: 1 }] }).services.map((item) => item.ordinal), [1, 2]);
const multiRecords = core.buildLocalReservationRecords({ session: { id: "multi", proposal: multiService.normalized } });
assert.equal(multiRecords[0].passengers[0].name, "Ana");
assert.equal(multiRecords[1].passengers[0].name, "Carlos");
const multiVoucher = core.buildLocalVoucher({ session: { proposal: multiService.normalized }, reservations: multiRecords });
assert.equal(multiVoucher.services[1].passengerSummary, "Carlos");

const session = core.normalizeSession({ id: "s1", inputVersion: 3, proposal: complete.normalized });
assert.equal(session.ready, true);
assert.equal(session.inputVersion, 3);
const enriched = core.normalizeProposal({ ...complete.normalized, assistantMessage: "Resumo", question: null, confidence: 0.96 });
assert.equal(enriched.assistantMessage, "Resumo");
assert.equal(enriched.confidence, 0.96);

assert.equal(AI_SCHEDULE_CONVERSATION_FIXTURES.length, 20, "dataset deve conter pelo menos 20 mensagens anonimizadas");
AI_SCHEDULE_CONVERSATION_FIXTURES.forEach((fixture) => {
  const result = core.validateProposal(fixture.proposal);
  assert.equal(result.ready, fixture.ready, `fixture ${fixture.id} deve respeitar a validação determinística`);
  if (!fixture.ready) assert.ok(result.missing.length > 0, `fixture ${fixture.id} deve apontar pendência`);
});

console.log("ai_schedule_conversation.test: ok");
