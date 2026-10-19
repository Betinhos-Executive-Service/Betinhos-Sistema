import assert from "node:assert/strict";
import test from "node:test";
import { describeCameraError } from "../src/lib/cameraErrors.ts";

function namedError(name: string) {
  const error = new Error("Permission denied");
  error.name = name;
  return error;
}

test("câmera negada orienta como liberar a permissão, sem texto do navegador em inglês", () => {
  const message = describeCameraError(namedError("NotAllowedError"));
  assert.match(message, /Permitir/);
  assert.match(message, /Tentar de novo/);
  assert.doesNotMatch(message, /Permission denied/);
});

test("câmera ocupada ou ausente tem mensagem própria", () => {
  assert.match(describeCameraError(namedError("NotReadableError")), /em uso por outro app/);
  assert.match(describeCameraError(namedError("NotFoundError")), /Nenhuma câmera/);
});

test("erro desconhecido cai em mensagem genérica acentuada", () => {
  assert.equal(describeCameraError("falhou"), "Não foi possível abrir a câmera. Toque em Tentar de novo.");
});
