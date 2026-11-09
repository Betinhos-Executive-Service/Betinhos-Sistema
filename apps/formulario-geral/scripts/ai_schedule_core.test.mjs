import assert from "node:assert/strict";
import { buildDraftRecords, normalizeEmailBody, normalizeExtraction, validateExtraction } from "./ai_schedule_core.mjs";

const message = { id: "immutable-1", conversationId: "conversation-1", subject: "Reserva", from: { emailAddress: { address: "cliente@example.com" } }, receivedDateTime: "2026-09-09T12:00:00Z", body: { content: "<p>Solicito o serviço</p><p>-- assinatura</p>" }, hasAttachments: true };
const extraction = { client: "Cliente", clientId: "client-guid", requester: "Solicitante", requesterId: "requester-guid", passengers: [{ id: "passenger-guid", name: "Pessoa" }], legs: [{ ordinal: 1, type: "ida", date: "2026-09-12", time: "10:00", origin: "A", destination: "B" }, { ordinal: 2, type: "retorno", date: "2026-09-14", time: "18:00", origin: "B", destination: "A" }] };

assert.equal(normalizeEmailBody("<style>x</style><p>A &amp; B</p>"), "A & B");
assert.equal(validateExtraction(normalizeExtraction(extraction)).ok, true);
const records = buildDraftRecords({ message, extraction });
assert.equal(records.length, 2);
assert.deepEqual(records.map((record) => record.ordinal), [1, 2]);
assert.deepEqual(records.map((record) => record.status), ["Pronto", "Pronto"]);
assert.equal(records[0].hasAttachments, true);
assert.equal(JSON.parse(records[0].extractionJson).clientId, "client-guid");
const blocked = buildDraftRecords({ message, extraction: { ...extraction, passengers: [{ name: "Pessoa" }] } });
assert.equal(blocked[0].status, "Pronto", "a confirmação de identidade ocorre na aprovação, não na extração");
const vague = buildDraftRecords({ message, extraction: { ...extraction, legs: [{ ...extraction.legs[0], vagueTime: true }] } });
assert.equal(vague[0].status, "Bloqueado");
console.log("ai_schedule_core.test: ok");
