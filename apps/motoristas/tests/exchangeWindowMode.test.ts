import assert from "node:assert/strict";
import test from "node:test";
import { buildExchangeWindowInfo, isExchangeOutsideWindow } from "../src/lib/dataverse.ts";

const driver1 = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "", fullName: "Carlos", funcionario: {} };
const driver2 = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: "", fullName: "Jailton", funcionario: {} };

function exchange(extra: Record<string, unknown> = {}) {
  return {
    cr40f_iniciodajaneladetroca: "2026-10-06T11:00:00Z",
    cr40f_fimdajaneladetroca: "2026-10-06T17:00:00Z",
    _cr40f_motorista1_value: driver1.id,
    _cr40f_motorista2_value: driver2.id,
    "_cr40f_motorista1_value@OData.Community.Display.V1.FormattedValue": "Carlos",
    "_cr40f_motorista2_value@OData.Community.Display.V1.FormattedValue": "Jailton",
    ...extra
  };
}

test("horário marcado mostra selo e janela obrigatória", () => {
  const info = buildExchangeWindowInfo(exchange(), driver1);
  assert.equal(info.mode, "fixed");
  assert.equal(info.seal, "Horário marcado");
  assert.match(info.phrase, /^Troque em 06\/10 entre \d{2}:\d{2} e \d{2}:\d{2}\.$/);
});

test("entre serviços usa as âncoras do próprio motorista", () => {
  const record = exchange({
    new_mododajanela: 100000001,
    new_localdatroca: "Base Betinhos",
    __anchors: {
      new_m1depoisde: { id: "s1", label: "OS-1895", departure: "2026-10-06T11:00:00Z" },
      new_m1antesde: { id: "s2", label: "OS-1896", departure: "2026-10-06T17:00:00Z" }
    }
  });
  const first = buildExchangeWindowInfo(record, driver1);
  assert.equal(first.seal, "Entre serviços");
  assert.match(first.phrase, /^Troque depois da OS-1895 \(\d{2}:\d{2}\) e antes da OS-1896 \(\d{2}:\d{2}\)\.$/);
  assert.equal(first.location, "Base Betinhos");
  assert.equal(first.check.ownBeforeDeparture, "2026-10-06T17:00:00Z");
  const second = buildExchangeWindowInfo(record, driver2);
  assert.equal(second.phrase, "Troque com Carlos quando os dois estiverem livres.");
  assert.equal(second.check.ownBeforeDeparture, "");
});

test("fora da janela", () => {
  const fixed = { mode: "fixed" as const, start: "2026-10-06T11:00:00Z", end: "2026-10-06T12:00:00Z", ownBeforeDeparture: "" };
  assert.equal(isExchangeOutsideWindow(fixed, new Date("2026-10-06T11:30:00Z")), false);
  assert.equal(isExchangeOutsideWindow(fixed, new Date("2026-10-06T10:59:00Z")), true);
  const between = { mode: "between" as const, start: "", end: "", ownBeforeDeparture: "2026-10-06T17:00:00Z" };
  assert.equal(isExchangeOutsideWindow(between, new Date("2026-10-06T08:00:00Z")), false);
  assert.equal(isExchangeOutsideWindow(between, new Date("2026-10-06T17:01:00Z")), true);
  assert.equal(isExchangeOutsideWindow({ ...between, ownBeforeDeparture: "" }, new Date("2026-10-06T23:00:00Z")), false);
  assert.equal(isExchangeOutsideWindow(undefined), false);
});
