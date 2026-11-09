import { getDelegatedAccessToken } from "./outlook_graph.mjs";

const DEFAULTS = Object.freeze({
  client: { entitySet: "cr40f_clientes1s", id: "cr40f_clientes1id", name: "cr40f_nomedocliente" },
  person: { entitySet: "cr40f_bancodedadoses", id: "cr40f_bancodedadosid", name: "cr40f_nomedopassageiro", phone: "cr40f_telefone", email: "cr40f_email" }
});

export function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function digits(value) { return String(value || "").replace(/\D/g, ""); }

function escapeOData(value) { return String(value || "").replace(/'/g, "''"); }

function targetMatchConfig(target = {}) {
  return {
    client: { ...DEFAULTS.client, ...(target.match?.client || {}) },
    person: { ...DEFAULTS.person, ...(target.match?.person || {}) }
  };
}

async function fetchCandidates(baseUrl, token, config, value) {
  const text = String(value || "").trim();
  if (!text) return [];
  const terms = normalize(text).split(" ").filter(Boolean).slice(0, 2);
  const filters = terms.map((term) => `contains(${config.name},'${escapeOData(term)}')`).join(" and ");
  const fields = [config.id, config.name, config.phone, config.email].filter(Boolean).join(",");
  const url = `${baseUrl}/api/data/v9.2/${config.entitySet}?$select=${encodeURIComponent(fields)}&$top=50${filters ? `&$filter=${encodeURIComponent(filters)}` : ""}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Dataverse respondeu ${response.status} na busca de identidade.`);
  return (await response.json()).value || [];
}

export function scoreCandidate(candidate, config, input) {
  const wantedName = normalize(input.name);
  const candidateName = normalize(candidate[config.name]);
  const wantedPhone = digits(input.phone);
  const candidatePhone = digits(candidate[config.phone]);
  const wantedEmail = normalize(input.email);
  const candidateEmail = normalize(candidate[config.email]);
  let score = 0;
  const reasons = [];
  if (wantedName && candidateName === wantedName) { score += 5; reasons.push("nome exato"); }
  else if (wantedName && candidateName && (candidateName.includes(wantedName) || wantedName.includes(candidateName))) { score += 3; reasons.push("nome aproximado"); }
  else if (wantedName && candidateName) {
    const wantedTokens = new Set(wantedName.split(" ").filter((token) => token.length > 1));
    const overlap = candidateName.split(" ").filter((token) => wantedTokens.has(token)).length;
    if (overlap >= 2 || (overlap === 1 && wantedTokens.size === 1)) { score += 2; reasons.push("nome parcialmente coincidente"); }
  }
  if (wantedPhone && candidatePhone && wantedPhone === candidatePhone) { score += 5; reasons.push("telefone exato"); }
  if (wantedEmail && candidateEmail && wantedEmail === candidateEmail) { score += 5; reasons.push("e-mail exato"); }
  return { score, reasons };
}

async function resolveOne(baseUrl, token, kind, input, config) {
  const candidates = await fetchCandidates(baseUrl, token, config, input?.name || input?.email || input?.phone);
  return candidates.map((candidate) => {
    const scored = scoreCandidate(candidate, config, input || {});
    return { id: candidate[config.id], name: candidate[config.name] || "", score: scored.score, reasons: scored.reasons };
  }).filter((candidate) => candidate.id && candidate.score > 0).sort((left, right) => right.score - left.score).slice(0, 5);
}

export async function resolveExtractionIdentities(extraction, target = {}) {
  const value = structuredClone(extraction || {});
  const baseUrl = String(target.url || "").replace(/\/$/, "");
  if (!baseUrl) return value;
  const token = await getDelegatedAccessToken({ scope: `${baseUrl}/user_impersonation`, cacheKey: `dataverse-${String(target.name || "dataverse").toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`, tenantEnv: "OUTLOOK_TENANT_ID", clientEnv: "OUTLOOK_CLIENT_ID" });
  const config = targetMatchConfig(target);
  const matchCandidates = { client: [], requester: [], passengers: [] };
  matchCandidates.client = await resolveOne(baseUrl, token, "client", { name: value.client, email: value.clientEmail }, config.client);
  const requesterInput = { name: value.requester, email: value.requesterEmail, phone: value.requesterPhone };
  matchCandidates.requester = await resolveOne(baseUrl, token, "person", requesterInput, config.person);
  for (const passenger of value.passengers || []) {
    matchCandidates.passengers.push(await resolveOne(baseUrl, token, "person", passenger, config.person));
  }
  value.matchCandidates = matchCandidates;
  if (!value.clientId && matchCandidates.client.length === 1) value.clientId = matchCandidates.client[0].id;
  if (!value.requesterId && matchCandidates.requester.length === 1) value.requesterId = matchCandidates.requester[0].id;
  value.passengers = (value.passengers || []).map((passenger, index) => ({ ...passenger, id: passenger.id || (matchCandidates.passengers[index]?.length === 1 ? matchCandidates.passengers[index][0].id : "") }));
  value.warnings = [...(value.warnings || []), ...Object.entries(matchCandidates).flatMap(([kind, items]) => items.length && ((Array.isArray(items[0]) ? items : [items]).some((candidate) => Array.isArray(candidate) ? candidate.length > 1 : false)) ? [`Correspondência ambígua: ${kind}.`] : [])];
  return value;
}
