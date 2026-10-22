import assert from "node:assert/strict";
import test from "node:test";
import { filterAgendaGalleryItems, shouldShowAgendaItemInGallery } from "../src/app/agendaVisibility.ts";
import { findFirstPendingDetail, findFirstPendingServiceDetail, getInitialComunicadoId, getInitialTermoMultaId } from "../src/app/bootstrap.ts";
import type { AgendaItem } from "../src/types.ts";

const firstDetail = {
  type: "SERVICO",
  id: "first",
  title: "Servico",
  actions: ["finalizar"],
  fields: []
} as const;

const nextDetail = {
  type: "SERVICO",
  id: "next",
  title: "Servico",
  actions: ["finalizar"],
  fields: []
} as const;

const maintenanceDetail = {
  type: "MANUTENCAO",
  id: "maintenance",
  title: "Manutencao",
  actions: ["finalizar"],
  fields: []
} as const;

const exchangeDetail = {
  type: "TROCA",
  id: "exchange",
  title: "Troca",
  actions: ["finalizar"],
  fields: []
} as const;

test("findFirstPendingDetail ignores canceled agenda items", () => {
  const agenda: AgendaItem[] = [
    { id: "header", tipo: "HEADER", tituloData: "Hoje" },
    { id: "srv-first", tipo: "SERVICO", canceled: true, detail: firstDetail },
    { id: "srv-next", tipo: "SERVICO", detail: nextDetail }
  ];

  assert.equal(findFirstPendingDetail(agenda)?.id, "next");
});

test("findFirstPendingServiceDetail ignores earlier maintenance and exchange", () => {
  const agenda: AgendaItem[] = [
    { id: "header", tipo: "HEADER", tituloData: "Hoje" },
    { id: "mnt-first", tipo: "MANUTENCAO", detail: maintenanceDetail },
    { id: "exc-first", tipo: "TROCA", detail: exchangeDetail },
    { id: "srv-next", tipo: "SERVICO", detail: nextDetail }
  ];

  assert.equal(findFirstPendingServiceDetail(agenda)?.id, "next");
});

test("canceled agenda item stays visible for 20 minutes after departure", () => {
  const item: AgendaItem = {
    id: "srv-canceled",
    tipo: "SERVICO",
    canceled: true,
    detail: {
      ...firstDetail,
      fields: [{ label: "Data / horario", value: "23/06/2026 14:00" }]
    }
  };

  assert.equal(shouldShowAgendaItemInGallery(item, new Date(2026, 5, 23, 14, 19).getTime()), true);
  assert.equal(shouldShowAgendaItemInGallery(item, new Date(2026, 5, 23, 14, 20).getTime()), false);
});

test("filterAgendaGalleryItems removes orphan date headers", () => {
  const now = new Date(2026, 5, 24, 10, 0).getTime();
  const items: AgendaItem[] = [
    { id: "header-yesterday", tipo: "HEADER", tituloData: "ONTEM" },
    {
      id: "srv-yesterday",
      tipo: "SERVICO",
      canceled: true,
      time: "ONTEM 09:00",
      detail: firstDetail
    }
  ];

  assert.deepEqual(filterAgendaGalleryItems(items, now), []);
});

test("deep link de comunicado aceita comunicadoId direto ou dentro de data", () => {
  const id = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  assert.equal(getInitialComunicadoId(`?comunicadoId=${id}`), id.toLowerCase());
  assert.equal(getInitialComunicadoId(`?data=${encodeURIComponent(`comunicadoId={${id}}`)}`), id.toLowerCase());
  assert.equal(getInitialComunicadoId("?comunicadoId=invalido"), "");
  assert.equal(getInitialComunicadoId(""), "");
});

test("deep link do push lê servicoId e tipo dentro de data=", async () => {
  const { getInitialParams, getInitialComunicadoId } = await import("../src/app/bootstrap.ts");
  assert.deepEqual(getInitialParams("?data=servicoId%3Dabc-1%26tipo%3DSERVICO"), { serviceId: "abc-1", type: "SERVICO" });
  assert.deepEqual(getInitialParams("?servicoId=direto&tipo=TROCA&data=servicoId%3Doutro"), { serviceId: "direto", type: "TROCA" });
  assert.deepEqual(getInitialParams(""), { serviceId: "", type: "" });
  assert.equal(getInitialComunicadoId("?data=comunicadoId%3D3F2504E0-4F89-11D3-9A0C-0305E82C3301"), "3f2504e0-4f89-11d3-9a0c-0305e82c3301");
});

test("deep link do termo de multa aceita termoMultaId direto ou dentro de data", () => {
  const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  assert.equal(getInitialTermoMultaId(`?termoMultaId={${id.toUpperCase()}}`), id);
  assert.equal(getInitialTermoMultaId(`?data=${encodeURIComponent(`termoMultaId=${id}`)}`), id);
  assert.equal(getInitialTermoMultaId("?termoMultaId=abc"), "");
  assert.equal(getInitialTermoMultaId(""), "");
});
