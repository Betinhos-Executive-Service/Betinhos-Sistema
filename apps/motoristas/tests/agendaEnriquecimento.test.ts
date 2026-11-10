import assert from "node:assert/strict";
import test from "node:test";
import { loadRemoteStore } from "../src/features/servicos/agendaRemota.ts";

const SERVICE_COUNT = 9;

async function loadAgenda(passengerFails: boolean) {
  const previousWindow = (globalThis as any).window;
  const previousLog = console.log;
  const previousWarn = console.warn;
  const previousError = console.error;
  const previousInfo = console.info;
  let active = 0;
  let maximum = 0;
  const reported: string[] = [];
  const serviceId = (index: number) => `${String(index + 1).repeat(8)}-1111-1111-1111-111111111111`;
  const services = Array.from({ length: SERVICE_COUNT }, (_, index) => ({
    cr40f_reservadeveculosid: serviceId(index),
    cr40f_id: `SV-${index}`,
    cr40f_dataehorriodesada: `2026-09-25T${String(10 + index).padStart(2, "0")}:00:00Z`,
    cr40f_trajeto: "Origem -> Destino",
    cr40f_passageirosetelefonedecontato: `Passageiro VIEW ${index}`,
    cr40f_status: 1
  }));
  const runtime: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    __APP_REPORT_ERROR: (error: Error) => reported.push(error.message),
    Xrm: {
      Utility: { getGlobalContext: () => ({ userSettings: { userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" } }) },
      WebApi: {
        retrieveRecord: async (entity: string) => {
          if (entity === "systemuser") return { internalemailaddress: "pessoa.ficticia7@betinhos.com.br" };
          if (passengerFails) throw new TypeError("Failed to fetch");
          return { cr40f_nomedopassageiro: "Passageiro Real", cr40f_telefone: "" };
        },
        retrieveMultipleRecords: async (entity: string, options: string) => {
          if (entity === "cr40f_funcionarios") return { entities: [{
            cr40f_funcionariosid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            cr40f_emailmicrosoft: "pessoa.ficticia7@betinhos.com.br",
            cr40f_nomecompleto: "Motorista"
          }] };
          if (entity === "cr40f_servicosporpassageiro") {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => setTimeout(resolve, 4));
            active -= 1;
            return { entities: [{ cr40f_servicosporpassageiroid: "dddddddd-dddd-dddd-dddd-dddddddddddd", _cr40f_bancodedados_value: "cccccccc-cccc-cccc-cccc-cccccccccccc" }] };
          }
          if (entity === "cr40f_reservadeveculos" && options.includes("_cr40f_om_value eq null") && options.includes("cr40f_status ne")) return { entities: services };
          return { entities: [] };
        }
      }
    }
  };
  runtime.parent = runtime;
  (globalThis as any).window = runtime;
  console.log = console.warn = console.error = console.info = () => undefined;
  try {
    const store = await loadRemoteStore();
    return { store, maximum, reported };
  } finally {
    console.log = previousLog;
    console.warn = previousWarn;
    console.error = previousError;
    console.info = previousInfo;
    (globalThis as any).window = previousWindow;
  }
}

const passengerField = (item: any) => item.detail?.fields.find((field: any) => field.label === "Passageiros e Telefones de Contato")?.value;

test("agenda enriquece no máximo 3 serviços por vez e mantém a ordem", async () => {
  const { store, maximum } = await loadAgenda(false);
  const items = store.agenda.filter((item) => item.id.startsWith("srv-"));
  assert.equal(items.length, SERVICE_COUNT);
  assert.deepEqual(items.map((item) => item.id.slice(4, 12)), Array.from({ length: SERVICE_COUNT }, (_, i) => String(i + 1).repeat(8)));
  assert.ok(items.every((item) => String(passengerField(item)).includes("Passageiro Real")));
  assert.ok(maximum <= 3, `leituras de passageiros simultâneas: ${maximum}`);
});

test("falha de rede no enriquecimento mantém o fallback com os dados da VIEW do Geral", async () => {
  const { store, reported } = await loadAgenda(true);
  const items = store.agenda.filter((item) => item.id.startsWith("srv-"));
  assert.equal(items.length, SERVICE_COUNT);
  items.forEach((item, index) => assert.equal(passengerField(item), `Passageiro VIEW ${index}`));
  assert.ok(reported.some((message) => message.includes("Usando Pax - VIEW do Geral")), "O fallback continua registrando o aviso.");
});
