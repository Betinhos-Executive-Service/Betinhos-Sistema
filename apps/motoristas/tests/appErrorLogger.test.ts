import assert from "node:assert/strict";
import test from "node:test";
import { APP_CONNECTION_LOST_MESSAGE, APP_OPERATION_ERROR_MESSAGE, installGlobalAppErrorLogger, reportAppError, redactSensitiveLogValue, type AppErrorNotice } from "../src/lib/appErrorLogger.ts";

test("mensagem de erro operacional orienta fechar e reabrir o aplicativo", () => {
  assert.match(APP_OPERATION_ERROR_MESSAGE, /Feche e reabra o aplicativo/);
});

test("mensagem de conexão perdida orienta fechar e reabrir o aplicativo", () => {
  assert.match(APP_CONNECTION_LOST_MESSAGE, /conexão com a internet foi perdida/i);
});

test("redactSensitiveLogValue remove dados sensiveis de strings", () => {
  const value = redactSensitiveLogValue(
    "Enviar para joao.silva@contoso.com tel +55 (11) 90000-0010 url https://contoso.sharepoint.com/sites/app/arquivo.jpg?sig=abc data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  );

  assert.equal(String(value).includes("joao.silva@contoso.com"), false);
  assert.equal(String(value).includes("98765-4321"), false);
  assert.equal(String(value).includes("sig=abc"), false);
  assert.equal(String(value).includes("AAAAAAAAAAAAAAAAAAAAAAAA"), false);
  assert.equal(String(value).includes("[redacted-email]"), true);
  assert.equal(String(value).includes("[redacted-phone]"), true);
  assert.equal(String(value).includes("[redacted-url]"), true);
  assert.equal(String(value).includes("[redacted-base64]"), true);
});

test("redactSensitiveLogValue remove campos sensiveis por chave", () => {
  const value = redactSensitiveLogValue({
    nome: "Manutencao 123",
    conteudoBase64: "ABC",
    telefonePassageiro: "11900000010",
    anexos: [{ foto: "data:image/jpeg;base64,ABC" }]
  });

  assert.deepEqual(value, {
    nome: "Manutencao 123",
    conteudoBase64: "[redacted]",
    telefonePassageiro: "[redacted]",
    anexos: [{ foto: "[redacted]" }]
  });
});

test("redactSensitiveLogValue preserva codigos operacionais de oito e nove digitos", () => {
  assert.equal(redactSensitiveLogValue("OT 202410001 e código 12345678"), "OT 202410001 e código 12345678");
});

test("wrapper grava pelo pacote compartilhado, avisa o usuário e redige e-mail e telefone", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  const created: Record<string, unknown>[] = [];
  const notices: AppErrorNotice[] = [];
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const storage = new Map<string, string>([
    ["app-motoristas-error-log-queue-v1", JSON.stringify([{ new_name: "pendente da fila antiga", new_appname: "App Motoristas" }])]
  ]);
  const xrm = {
    Utility: { getGlobalContext: () => ({ getClientUrl: () => "https://org.example.crm2.dynamics.com", userSettings: { userId: "{ABC}", userName: "Motorista" } }) },
    WebApi: { createRecord: async (table: string, record: Record<string, unknown>) => {
      assert.equal(table, "new_appmotoristaslog");
      created.push(record);
      return { id: String(created.length) };
    } }
  };
  const runtime: Record<string, unknown> = {
    navigator: { onLine: true, userAgent: "test" },
    location: { href: "https://org.example.crm2.dynamics.com/WebResources/app.html" },
    __APP_BUILD_INFO: { version: "2.1.999", builtAtLabel: "19/10/2026, 21:00" },
    Xrm: xrm,
    addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    removeEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener)),
    dispatchEvent: (event: Event) => {
      if (event.type === "appmotoristas:error") notices.push((event as CustomEvent<AppErrorNotice>).detail);
      return true;
    },
    setInterval: () => 1,
    clearInterval: () => undefined,
    setTimeout: () => 1
  };
  runtime.parent = runtime;
  const settle = async () => { for (let index = 0; index < 12; index++) await new Promise<void>((resolve) => setImmediate(resolve)); };
  Object.defineProperty(globalThis, "window", { configurable: true, value: runtime });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); }
  } });
  globalThis.fetch = (async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes("systemusers") ? { fullname: "Motorista Teste", internalemailaddress: "pessoa.ficticia1@betinhos.com.br", domainname: "pessoa.ficticia1@betinhos.com.br" } : {})
  })) as unknown as typeof fetch;
  console.error = () => undefined;
  try {
    installGlobalAppErrorLogger();
    await settle();
    assert.equal(storage.has("app-motoristas-error-log-queue-v1"), false, "Fila antiga migra para a do pacote.");
    assert.equal(created[0]?.new_name, "pendente da fila antiga");
    assert.ok(listeners.get("error")?.length === 1, "Só o listener do wrapper fica ativo.");

    const internal = Object.assign(new Error("Falha interna em tabela"), { code: "0x80040220" });
    reportAppError(Object.assign(new Error("Falha para pessoa.ficticia5@betinhos.com.br no 11 90000-0010"), { cause: internal }), {
      action: "assinarComunicado", phase: "execute", screen: "Comunicados", detailId: "recipient-1",
      payload: { authorization: "Bearer sensitive", telefone: "11900000010", observacaoLength: 12 }
    });
    await settle();
    const record = created[1];
    assert.equal(record.new_appname, "App Motoristas");
    assert.equal(record.new_appversion, "2.1.999");
    assert.equal(record.new_builtat, "19/10/2026, 21:00");
    assert.equal(record.new_useremail, "pessoa.ficticia1@betinhos.com.br");
    assert.equal(record.new_errorcode, "0x80040220");
    assert.equal(record.new_action, "assinarComunicado");
    assert.equal(record.new_screen, "Comunicados");
    assert.equal(record.new_detailid, "recipient-1");
    assert.equal(record.new_message, "Falha para [redacted-email] no [redacted-phone]");
    assert.equal(String(record.new_stack).includes("pessoa.ficticia5@betinhos.com.br"), false);
    const payload = JSON.parse(String(record.new_payloadjson));
    assert.equal(payload.payload.authorization, "[redacted]");
    assert.equal(payload.payload.telefone, "[redacted]");
    assert.equal(payload.payload.observacaoLength, 12);
    assert.match(JSON.stringify(payload.error), /Falha interna em tabela/);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].userMessage, "Falha para [redacted-email] no [redacted-phone] Código: 0x80040220");

    reportAppError(new Error("Silencioso"), { notifyUser: false });
    await settle();
    assert.equal(notices.length, 1, "notifyUser: false não avisa o usuário.");
    assert.equal(created[2].new_message, "Silencioso");

    console.error("[AppMotoristas:Log] interno");
    console.error("Falha no console", { telefone: "11900000010" });
    await settle();
    assert.equal(created.length, 4, "console.error marcado pelo app não é gravado.");
    assert.equal(created[3].new_source, "console.error");
    assert.equal(created[3].new_message, "Falha no console {\"telefone\":\"[redacted]\"}");

    runtime.Xrm = undefined;
    runtime.parent = undefined;
    reportAppError(new Error("Modo mock"));
    await settle();
    assert.equal(created.length, 4, "Sem Xrm (mock) nada é gravado.");
    assert.equal(notices.at(-1)?.message, "Modo mock", "O aviso ao usuário continua no modo mock.");
  } finally {
    console.error = previousConsoleError;
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("redação remove credenciais em texto e em erros internos", () => {
  const error = Object.assign(new Error("Authorization=Bearer-secret token=abc senha=xyz"), {
    cause: Object.assign(new Error("Falha interna"), { access_token: "secret" })
  });
  const redacted = JSON.stringify(redactSensitiveLogValue(error));
  assert.equal(redacted.includes("Bearer-secret"), false);
  assert.equal(redacted.includes("token=abc"), false);
  assert.equal(redacted.includes("senha=xyz"), false);
  assert.match(redacted, /Falha interna/);
  assert.equal(redacted.includes('"access_token":"secret"'), false);
});
