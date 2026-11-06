import assert from "node:assert/strict";
import test from "node:test";
import { pendingErrorLogs } from "@betinhos-executive-service/ui/error-logger.js";
import { flushAppErrorLogQueue, flushRepeatedErrorSummaries, installGlobalAppErrorLogger, reportAppError } from "../src/lib/appErrorLogger.ts";

test("rajada de falhas iguais grava 1 log completo e 1 resumo; causas e limites continuam valendo", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  const created: Record<string, unknown>[] = [];
  const timers: Array<() => void> = [];
  let deliver = true;
  const storage = new Map<string, string>();
  const xrm = {
    Utility: { getGlobalContext: () => ({ getClientUrl: () => "https://org.example.crm2.dynamics.com", userSettings: { userId: "{ABC}", userName: "Motorista" } }) },
    WebApi: { createRecord: async (_table: string, record: Record<string, unknown>) => {
      if (!deliver) throw new TypeError("Failed to fetch");
      created.push(record);
      return { id: String(created.length) };
    } }
  };
  const runtime: Record<string, unknown> = {
    navigator: { onLine: true, userAgent: "test" },
    location: { href: "https://org.example.crm2.dynamics.com/WebResources/app.html" },
    __APP_BUILD_INFO: { version: "2.1.999", builtAtLabel: "05/11/2026, 10:00" },
    Xrm: xrm,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    setInterval: () => 1,
    clearInterval: () => undefined,
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; }
  };
  runtime.parent = runtime;
  const settle = async () => { for (let index = 0; index < 12; index++) await new Promise<void>((resolve) => setImmediate(resolve)); };
  Object.defineProperty(globalThis, "window", { configurable: true, value: runtime });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); }
  } });
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ fullname: "Motorista Teste" }) })) as unknown as typeof fetch;
  console.error = () => undefined;

  const warnLikeDataverse = (cause: unknown, serviceId: string) => reportAppError(
    Object.assign(new Error("Falha ao enriquecer passageiros. Usando Pax - VIEW do Geral."), { cause }),
    { severity: "warning", source: "dataverse", action: "Falha ao enriquecer passageiros. Usando Pax - VIEW do Geral.", phase: "fallback", notifyUser: false, payload: { serviceId, error: cause } }
  );

  try {
    installGlobalAppErrorLogger();
    await settle();

    const network = new TypeError("Failed to fetch");
    for (let index = 0; index < 40; index++) warnLikeDataverse(network, `servico-${index}`);
    await settle();
    assert.equal(created.length, 1, "40 falhas iguais geram 1 log completo.");
    assert.match(String(created[0].new_message), /Pax - VIEW do Geral\. \[causa: rede\]$/);
    const first = JSON.parse(String(created[0].new_payloadjson));
    assert.equal(first.rede.falhaDeRede, true, "Falha de rede fica marcada no payload mesmo com navigator.onLine true.");
    assert.equal(first.rede.navigatorOnLine, true);
    assert.equal(first.payload.error, undefined, "O erro não é repetido no contexto.");
    assert.equal(first.error.causas.filter((hop: { message?: string }) => hop.message === "Failed to fetch").length, 1);
    assert.equal(timers.length, 1, "Um único resumo agendado para toda a rajada.");

    timers[0]();
    await settle();
    assert.equal(created.length, 2);
    assert.match(String(created[1].new_message), /\(repetido 39x em \d+s\)$/);
    assert.equal(created[1].new_phase, "resumo-repetidos");

    warnLikeDataverse(new Error("The request timed out"), "servico-x");
    await settle();
    assert.equal(created.length, 3, "Causa diferente continua separada.");
    assert.match(String(created[2].new_message), /\[causa: timeout\]$/);

    const stack = "Error: Falha grande\n    at principal (app.js:1:1)";
    const big = Object.assign(new Error("Falha grande"), { stack });
    reportAppError(big, { source: "teste", action: "payloadGrande", payload: { texto: "x".repeat(50_000), itens: Array.from({ length: 800 }, (_, i) => `item-${i}`) } });
    await settle();
    assert.equal(created.length, 4);
    assert.ok(String(created[3].new_payloadjson).length <= 6500, "Payload reduzido ao limite.");
    assert.equal(created[3].new_message, "Falha grande");
    assert.equal(created[3].new_stack, stack, "Mensagem e stack principais não se perdem.");

    deliver = false;
    reportAppError(new Error("Log com sinal fraco"), { source: "teste", action: "sinalFraco" });
    await settle();
    assert.equal(pendingErrorLogs(), 1, "Sem entrega, o log fica na fila.");
    deliver = true;
    await flushAppErrorLogQueue();
    await settle();
    assert.equal(pendingErrorLogs(), 0);
    assert.equal(created.at(-1)?.new_message, "Log com sinal fraco", "A fila pendente é entregue quando o sinal volta.");

    const realNow = Date.now;
    try {
      const repeated = () => reportAppError(new Error("Falha intermitente"), { source: "teste", action: "intermitente", notifyUser: false });
      repeated();
      repeated();
      repeated();
      await settle();
      assert.equal(created.length, 6, "Primeira ocorrência completa; repetidas só contam.");
      Date.now = () => realNow() + 6 * 60 * 1000;
      repeated();
      await settle();
      assert.equal(created.length, 8, "Após o silêncio, o resumo do grupo antigo sai e a falha volta completa.");
      assert.ok(created.some((record) => /Falha intermitente \(repetido 2x/.test(String(record.new_message))));
    } finally {
      Date.now = realNow;
    }

    flushRepeatedErrorSummaries();
    await settle();
    assert.equal(created.length, 8, "Sem repetição pendente não há resumo novo.");
  } finally {
    console.error = previousConsoleError;
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
