import assert from "node:assert/strict";
import test from "node:test";
import {
  abrirPdf,
  initialTermoFlow,
  isErroDefinitivo,
  mapTermo,
  prazoAssinatura,
  proximaAba,
  resumoPendentes,
  separarTermos,
  termoFlowReducer,
  TERMO_STATUS
} from "../src/lib/termosMulta.ts";

const row = (id: string, status: number, enviadoEm: string) => mapTermo({ new_termomultaid: id, new_status: status, new_enviadoem: enviadoEm });

test("prazo de assinatura é o envio + 7 dias em dd/mm de São Paulo", () => {
  assert.equal(prazoAssinatura("2026-10-22T12:00:00Z"), "29/10");
  // 02:00 UTC ainda é o dia anterior em São Paulo.
  assert.equal(prazoAssinatura("2026-10-23T02:00:00Z"), "29/10");
  assert.equal(prazoAssinatura(""), "");
});

test("separa pendentes de concluídos (assinados, contestados e expirados) e oculta cancelados", () => {
  const items = [row("a", TERMO_STATUS.pendente, "2026-10-22T12:00:00Z"), row("b", TERMO_STATUS.assinado, "2026-10-01T12:00:00Z"), row("c", TERMO_STATUS.contestado, "2026-10-02T12:00:00Z"), row("d", 100000004, "2026-10-03T12:00:00Z"), row("e", TERMO_STATUS.expirado, "2026-09-03T12:00:00Z")];
  const { pendentes, concluidos } = separarTermos(items);
  assert.deepEqual(pendentes.map((t) => t.id), ["a"]);
  assert.deepEqual(concluidos.map((t) => t.id), ["b", "c", "e"]);
});

test("banner da Home: contagem e o prazo mais próximo", () => {
  assert.equal(resumoPendentes([]), null);
  const items = [row("a", TERMO_STATUS.pendente, "2026-10-22T12:00:00Z"), row("b", TERMO_STATUS.pendente, "2026-10-20T12:00:00Z"), row("c", TERMO_STATUS.assinado, "2026-10-01T12:00:00Z")];
  assert.equal(resumoPendentes(items), "Você tem 2 multas para assinar · prazo até 27/10");
  assert.equal(resumoPendentes(items.slice(0, 1)), "Você tem 1 multa para assinar · prazo até 29/10");
});

test("erros definitivos vão para a tela final; falha de rede fica no passo", () => {
  assert.equal(isErroDefinitivo("Este termo não é seu."), true);
  assert.equal(isErroDefinitivo("Este termo não está mais pendente."), true);
  assert.equal(isErroDefinitivo("Failed to fetch"), false);
  const ready = { ...initialTermoFlow(), step: "assinatura" as const, selfie: "abc" };
  const fim = termoFlowReducer(ready, { type: "error", message: "Este termo não é seu." });
  assert.equal(fim.step, "encerrado");
  assert.equal(fim.erro, "Este termo não é seu.");
  const rede = termoFlowReducer(ready, { type: "error", message: "Failed to fetch" });
  assert.equal(rede.step, "assinatura");
  assert.equal(rede.selfie, "abc");
});

const pdf = { base64: btoa("%PDF-1.4 x"), nome: "TM-1.pdf" };

test("PDF abre pelo Xrm.Navigation.openFile quando existe", async () => {
  const calls: any[] = [];
  const metodo = await abrirPdf(pdf, { xrmOpenFile: async (file, options) => { calls.push([file, options]); } });
  assert.equal(metodo, "xrm");
  assert.equal(calls[0][0].fileName, "TM-1.pdf");
  assert.equal(calls[0][0].mimeType, "application/pdf");
  assert.equal(calls[0][0].fileContent, pdf.base64);
  assert.equal(calls[0][0].fileSize, 10);
  assert.deepEqual(calls[0][1], { openMode: 1 });
});

test("PDF cai para compartilhar e depois para download, registrando cada falha", async () => {
  const falhas: string[] = [];
  const shared: File[] = [];
  const viaShare = await abrirPdf(pdf, {
    xrmOpenFile: async () => { throw new Error("sem viewer"); },
    share: async (data) => { shared.push(data.files[0]); },
    canShare: () => true,
    onFalha: (metodo) => falhas.push(metodo)
  });
  assert.equal(viaShare, "share");
  assert.equal(shared[0].name, "TM-1.pdf");
  assert.deepEqual(falhas, ["xrm"]);

  let baixado = "";
  const viaDownload = await abrirPdf(pdf, { download: (_blob, nome) => { baixado = nome; } });
  assert.equal(viaDownload, "download");
  assert.equal(baixado, "TM-1.pdf");
});

test("PDF sem nenhum caminho disponível falha com erro visível", async () => {
  await assert.rejects(abrirPdf(pdf, { download: () => { throw new Error("bloqueado"); } }), /Não foi possível abrir o PDF/);
});

test("compartilhamento cancelado pelo motorista não vira erro nem download", async () => {
  let baixou = false;
  const metodo = await abrirPdf(pdf, {
    share: async () => { throw Object.assign(new Error("cancel"), { name: "AbortError" }); },
    canShare: () => true,
    download: () => { baixou = true; }
  });
  assert.equal(metodo, "share");
  assert.equal(baixou, false);
});

test("só download no WebView do Power Apps vira orientação e log, não sucesso", async () => {
  const falhas: string[] = [];
  let baixou = false;
  await assert.rejects(abrirPdf(pdf, { powerApps: true, download: () => { baixou = true; }, onFalha: (m) => falhas.push(m) }), /Power Apps/);
  assert.equal(baixou, false);
  assert.deepEqual(falhas, ["download"]);
});

test("cadastro duplicado é erro definitivo", () => {
  assert.equal(isErroDefinitivo("Seu cadastro está duplicado. Procure o escritório."), true);
});

test("abas navegam por setas, Home e End", () => {
  assert.equal(proximaAba("pendentes", "ArrowRight"), "concluidos");
  assert.equal(proximaAba("concluidos", "ArrowRight"), "pendentes");
  assert.equal(proximaAba("pendentes", "ArrowLeft"), "concluidos");
  assert.equal(proximaAba("concluidos", "Home"), "pendentes");
  assert.equal(proximaAba("pendentes", "End"), "concluidos");
  assert.equal(proximaAba("pendentes", "Enter"), null);
});
