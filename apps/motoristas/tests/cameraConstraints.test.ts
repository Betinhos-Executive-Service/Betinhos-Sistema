import assert from "node:assert/strict";
import test from "node:test";
import { DOCUMENT_PHOTO_ASPECT, getDocumentStreamConstraints, getDocumentTrackConstraints, describeStreamSize } from "../src/lib/cameraConstraints.ts";

test("comprovante pede stream 4:3 em alta resolução com a câmera traseira", () => {
  assert.equal(DOCUMENT_PHOTO_ASPECT, 4 / 3);
  assert.deepEqual(getDocumentStreamConstraints("environment"), {
    facingMode: "environment",
    aspectRatio: { ideal: 4 / 3 },
    width: { ideal: 1920 },
    height: { ideal: 1440 }
  });
});

test("ajuste do track mantém 4:3 (não volta ao 16:9 ao aplicar perfil e foco)", () => {
  const c = getDocumentTrackConstraints("environment", 30, true) as Record<string, unknown>;
  assert.deepEqual(c.aspectRatio, { ideal: 4 / 3 });
  assert.deepEqual(c.width, { ideal: 1920 });
  assert.deepEqual(c.height, { ideal: 1440 });
  assert.deepEqual(c.focusMode, { ideal: "continuous" });
  assert.equal("min" in (c.height as object), false);
  assert.equal((getDocumentTrackConstraints("environment", 30, false) as Record<string, unknown>).focusMode, undefined);
});

test("descreve o tamanho real do stream e a proporção", () => {
  assert.equal(describeStreamSize({ width: 1440, height: 1920 }), "1440x1920 (3:4)");
  assert.equal(describeStreamSize({ width: 1920, height: 1080 }), "1920x1080 (16:9)");
  assert.equal(describeStreamSize({}), "desconhecido");
});

test("toda foto da câmera ao vivo é o quadro do vídeo em JPEG 0,85 (sem takePhoto)", async () => {
  // Celular do Renan (15/10, v2.1.716): takePhoto devolveu outro enquadramento e custava segundos.
  const { LIVE_PHOTO_JPEG_QUALITY } = await import("../src/lib/cameraConstraints.ts");
  assert.equal(LIVE_PHOTO_JPEG_QUALITY, 0.85);
});
