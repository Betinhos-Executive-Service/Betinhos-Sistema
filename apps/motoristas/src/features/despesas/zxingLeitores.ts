// Só os leitores de QR e de Code 128 do @zxing/library, por import direto do ESM (o índice do pacote traz tudo: ~423 KB).
// Carregado sob demanda pelo leitorCodigo.ts, só quando o navegador não tem BarcodeDetector.
import BinaryBitmap from "@zxing/library/esm/core/BinaryBitmap";
import DecodeHintType from "@zxing/library/esm/core/DecodeHintType";
import HybridBinarizer from "@zxing/library/esm/core/common/HybridBinarizer";
import RGBLuminanceSource from "@zxing/library/esm/core/RGBLuminanceSource";
import Code128Reader from "@zxing/library/esm/core/oned/Code128Reader";
import QRCodeReader from "@zxing/library/esm/core/qrcode/QRCodeReader";

export const LEITORES_ZXING = { BinaryBitmap, DecodeHintType, HybridBinarizer, RGBLuminanceSource, Code128Reader, QRCodeReader };
