import { test } from "vitest";
import assert from "node:assert/strict";
import { buildOneDriveEvidencePath, buildOneDriveFlowPayload, dataUrlToBase64, getFlowLink } from "./dataverse.js";

test("prepara payload do Flow OneDrive sem prefixo data URL", () => {
  const payload = buildOneDriveFlowPayload({
    path: "Erros Operacionais/DEV/ERR-000041",
    fileName: "evidencia.png",
    dataUrl: "data:image/png;base64, aGVsbG8=",
    metadata: { tipo: "EVIDENCIA_ERRO_OPERACIONAL" },
  });
  assert.equal(dataUrlToBase64("data:text/plain;base64, aGVsbG8="), "aGVsbG8=");
  assert.deepEqual(payload, {
    caminhoCompleto: "Erros Operacionais/DEV/ERR-000041",
    nomeArquivo: "evidencia.png",
    conteudoBase64: "aGVsbG8=",
    mimeType: "image/png",
    metadados: { tipo: "EVIDENCIA_ERRO_OPERACIONAL" },
  });
});

test("aceita links diretos e aninhados retornados pelo Flow", () => {
  assert.equal(getFlowLink({ shareLink: "https://contoso.sharepoint.com/evidencia" }), "https://contoso.sharepoint.com/evidencia");
  assert.equal(getFlowLink({ body: JSON.stringify({ webUrl: "https://contoso.sharepoint.com/evidencia-2" }) }), "https://contoso.sharepoint.com/evidencia-2");
  assert.equal(getFlowLink({ fileLink: { webUrl: "https://contoso.sharepoint.com/evidencia-3" } }), "https://contoso.sharepoint.com/evidencia-3");
});

test("organiza evidencias em subpastas simples por contexto", () => {
  const error = { cr40f_codigo: "ERR-000041" };
  assert.equal(buildOneDriveEvidencePath(error, "Registro", "https://org23b93544.crm2.dynamics.com/"), "Erros Operacionais/DEV/ERR-000041/Registro");
  assert.equal(buildOneDriveEvidencePath(error, "Historico", "https://contoso.crm.dynamics.com/"), "Erros Operacionais/ERR-000041/Historico");
});
