import test from "node:test";
import assert from "node:assert/strict";
import { canRequestPassengerPhoto, createPassengerPhotoStore, parseFotoJson, passengerInitial, PROGRAMADO_STATUS } from "../src/lib/passengerPhoto.ts";

test("parseFotoJson aceita ok com imagem", () => {
  assert.deepEqual(parseFotoJson(JSON.stringify({ ok: true, mimeType: "image/jpeg", conteudoBase64: "AAAA" })), { mimeType: "image/jpeg", base64: "AAAA" });
});

test("parseFotoJson devolve null quando negado ou inválido", () => {
  assert.equal(parseFotoJson(JSON.stringify({ ok: false, motivo: "indisponivel" })), null);
  assert.equal(parseFotoJson("{nao-json"), null);
  assert.equal(parseFotoJson(""), null);
  assert.equal(parseFotoJson(undefined), null);
  assert.equal(parseFotoJson(JSON.stringify({ ok: true, mimeType: "text/html", conteudoBase64: "AAAA" })), null);
  assert.equal(parseFotoJson(JSON.stringify({ ok: true, mimeType: "image/png" })), null);
});

const detail = (status: unknown, type: "SERVICO" | "TROCA" = "SERVICO") => ({
  type,
  passengers: [{ id: "p1", name: "Ana" }],
  dataverse: { entitySetName: "x", id: "r1", record: { cr40f_status: status } }
});

test("só serviço Programado busca foto", () => {
  assert.equal(canRequestPassengerPhoto(detail(PROGRAMADO_STATUS)), true);
  assert.equal(canRequestPassengerPhoto(detail(202410008)), false);
  assert.equal(canRequestPassengerPhoto(detail(null)), false);
  assert.equal(canRequestPassengerPhoto(detail(PROGRAMADO_STATUS, "TROCA")), false);
  assert.equal(canRequestPassengerPhoto({ ...detail(PROGRAMADO_STATUS), passengers: [] }), false);
});

test("inicial do nome", () => {
  assert.equal(passengerInitial(" ébano Silva"), "É");
  assert.equal(passengerInitial(""), "?");
});

test("store memoriza por (reserva, passageiro), limita a 2 simultâneas e revoga no dispose", async () => {
  let calls = 0; let concurrent = 0; let peak = 0;
  const store = createPassengerPhotoStore(async (_r, p) => {
    calls += 1; concurrent += 1; peak = Math.max(peak, concurrent);
    await new Promise((r) => setTimeout(r, 10));
    concurrent -= 1;
    return p === "neg" ? JSON.stringify({ ok: false }) : JSON.stringify({ ok: true, mimeType: "image/png", conteudoBase64: "AAAA" });
  });
  const revoked: string[] = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (u: string) => { revoked.push(u); };
  try {
    const results = await Promise.all([store.get("{R1}", "a"), store.get("r1", "a"), store.get("r1", "b"), store.get("r1", "c"), store.get("r1", "neg")]);
    assert.equal(calls, 4);
    assert.ok(peak <= 2);
    assert.equal(results[0], results[1]);
    assert.match(String(results[0]), /^blob:/);
    assert.equal(results[4], null);
    store.dispose();
    assert.equal(revoked.length, 3);
  } finally { URL.revokeObjectURL = original; }
});

test("mock só devolve foto para o primeiro passageiro", async () => {
  const { fetchFotoJsonMock } = await import("../src/lib/passengerPhoto.ts");
  assert.ok(parseFotoJson(await fetchFotoJsonMock("r1", "mock-pax-1")));
  assert.equal(parseFotoJson(await fetchFotoJsonMock("r1", "mock-pax-2")), null);
});
