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

test("comprovante: foto do takePhoto com proporção diferente da prévia é descartada (usa o quadro inteiro)", async () => {
  const { chooseDocumentCaptureSource } = await import("../src/lib/cameraConstraints.ts");
  const preview = { width: 1440, height: 1920 };
  // Caso do celular do Renan (15/10 15:40): prévia 3:4, takePhoto devolveu 9:16 cortado nas laterais.
  assert.equal(chooseDocumentCaptureSource({ width: 1080, height: 1920 }, preview), "frame");
  assert.equal(chooseDocumentCaptureSource({ width: 2296, height: 4080 }, preview), "frame");
  // Mesma proporção (retrato ou paisagem com EXIF): mantém a foto do sensor.
  assert.equal(chooseDocumentCaptureSource({ width: 3072, height: 4080 }, preview), "photo");
  assert.equal(chooseDocumentCaptureSource({ width: 4080, height: 3072 }, preview), "photo");
  assert.equal(chooseDocumentCaptureSource({ width: 3000, height: 4000 }, preview), "photo");
  // Sem como conferir a foto: prefere o quadro que o motorista viu. Sem prévia: fica com a foto.
  assert.equal(chooseDocumentCaptureSource({ width: 0, height: 0 }, preview), "frame");
  assert.equal(chooseDocumentCaptureSource({ width: 3072, height: 4080 }, { width: 0, height: 0 }), "photo");
});
