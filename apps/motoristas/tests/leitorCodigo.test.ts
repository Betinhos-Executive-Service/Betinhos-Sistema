import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import qrcode from "qrcode-generator";
import { decodificarLuminancia, esquecerDetectorNativo, luminanciaDoRgba, obterDetectorNativo, type LeitoresZxing } from "../src/features/despesas/leitorCodigo.ts";
import { chaveDoCodigo } from "../src/features/despesas/chaveNotaFiscal.ts";

// O app carrega o ESM do zxing (zxingLeitores.ts) pelo Vite; no Node, as mesmas classes vêm do build CJS.
const exigir = createRequire(import.meta.url);
const de = (caminho: string) => exigir(`@zxing/library/cjs/core/${caminho}.js`).default;
const Z = {
  BinaryBitmap: de("BinaryBitmap"), DecodeHintType: de("DecodeHintType"), HybridBinarizer: de("common/HybridBinarizer"),
  RGBLuminanceSource: de("RGBLuminanceSource"), Code128Reader: de("oned/Code128Reader"), QRCodeReader: de("qrcode/QRCodeReader")
} as LeitoresZxing;

// Chave gerada (repositório público), DV conferido no chaveNotaFiscal.test.ts.
const CHAVE = "33261112345678000195650010000043211123456780";

function qrEmLuminancia(texto: string, escala = 6, margem = 4) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const modulos = qr.getModuleCount();
  const lado = (modulos + margem * 2) * escala;
  const lum = new Uint8ClampedArray(lado * lado).fill(255);
  for (let y = 0; y < modulos; y++) {
    for (let x = 0; x < modulos; x++) {
      if (!qr.isDark(y, x)) continue;
      for (let dy = 0; dy < escala; dy++) {
        const linha = (y + margem) * escala + dy;
        lum.fill(0, linha * lado + (x + margem) * escala, linha * lado + (x + margem + 1) * escala);
      }
    }
  }
  return { lum, lado };
}

test("o leitor JavaScript lê o QR da NFC-e e a chave sai do parâmetro p", () => {
  const url = `https://www.fazenda.rj.gov.br/nfce/consulta?p=${CHAVE}|2|1|1|0A1B2C3D4E5F`;
  const { lum, lado } = qrEmLuminancia(url);
  const lido = decodificarLuminancia(Z, lum, lado, lado);
  assert.deepEqual(lido, { texto: url, formato: "qr" });
  assert.equal(chaveDoCodigo(lido!.texto), CHAVE);
});

test("imagem sem código devolve null", () => {
  assert.equal(decodificarLuminancia(Z, new Uint8ClampedArray(200 * 200).fill(255), 200, 200), null);
});

test("luminância do RGBA usa os pesos de sempre", () => {
  assert.deepEqual([...luminanciaDoRgba(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), 3, 1)], [255, 0, 76]);
});

test("BarcodeDetector só vale quando lê QR e Code 128", async () => {
  class SoQr { static getSupportedFormats = async () => ["qr_code"]; constructor(_: unknown) {} detect = async () => []; }
  class Completo { static getSupportedFormats = async () => ["qr_code", "code_128", "ean_13"]; constructor(_: unknown) {} detect = async () => []; }
  esquecerDetectorNativo();
  assert.equal(await obterDetectorNativo({ BarcodeDetector: SoQr as never }), null);
  esquecerDetectorNativo();
  assert.ok(await obterDetectorNativo({ BarcodeDetector: Completo as never }));
  esquecerDetectorNativo();
  assert.equal(await obterDetectorNativo({}), null);
  esquecerDetectorNativo();
});
