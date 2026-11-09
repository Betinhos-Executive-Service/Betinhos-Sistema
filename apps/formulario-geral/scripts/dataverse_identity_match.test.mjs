import assert from "node:assert/strict";
import { normalize, scoreCandidate } from "./dataverse_identity_match.mjs";

const config = { name: "name", phone: "phone", email: "email" };
assert.equal(normalize("Ána  Laura"), "ana laura");
assert.equal(scoreCandidate({ name: "Ana Laura", phone: "11996950992", email: "ana@example.com" }, config, { name: "Ana Laura", phone: "(11) 99695-0992" }).score, 10);
assert.ok(scoreCandidate({ name: "Ana Laura Silva", phone: "", email: "" }, config, { name: "Ana Laura" }).score > 0);
assert.equal(scoreCandidate({ name: "Outra Pessoa", phone: "", email: "" }, config, { name: "Ana Laura" }).score, 0);
console.log("dataverse_identity_match: ok");
