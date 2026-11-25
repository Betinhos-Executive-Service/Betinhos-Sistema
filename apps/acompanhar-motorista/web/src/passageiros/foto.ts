// Foto reduzida no aparelho: lado maior 1280 px, JPEG 0,8 decrescendo até 2,5 MB, mais miniatura quadrada de 288 px.
// base64 (+1/3) + miniatura cabem no corpo de 4 MB do Worker.
export const LADO_MAX = 1280, LADO_MINI = 288, BYTES_MAX = 2.5 * 1024 * 1024;

async function decodificar(arq: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(arq, { imageOrientation: "from-image" }); } catch { /* tenta via <img> */ }
  }
  const url = URL.createObjectURL(arq);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}
function jpegBase64(canvas: HTMLCanvasElement, q: number): Promise<string> {
  return new Promise((ok, falha) => {
    canvas.toBlob((blob) => {
      if (!blob) return falha(new Error("blob"));
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => falha(r.error);
      r.readAsDataURL(blob);
    }, "image/jpeg", q);
  });
}
function miniaturaDe(canvas: HTMLCanvasElement) {
  const lado = Math.min(canvas.width, canvas.height), mini = document.createElement("canvas");
  mini.width = mini.height = Math.min(LADO_MINI, lado);
  mini.getContext("2d")!.drawImage(canvas, (canvas.width - lado) / 2, (canvas.height - lado) / 2, lado, lado, 0, 0, mini.width, mini.height);
  return jpegBase64(mini, 0.8);
}
// Erros são chaves de tradução (pax.err.*), lançadas como Error(chave).
export async function comprimirFoto(arq: File): Promise<{ foto: string; miniatura: string }> {
  let fonte: ImageBitmap | HTMLImageElement;
  try { fonte = await decodificar(arq); } catch {
    throw new Error(/hei[cf]/i.test(arq.type) || /\.hei[cf]$/i.test(arq.name) ? "pax.err.heic" : "pax.err.abrir");
  }
  const escala = Math.min(1, LADO_MAX / Math.max(fonte.width, fonte.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(fonte.width * escala); canvas.height = Math.round(fonte.height * escala);
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#FFFFFF"; c.fillRect(0, 0, canvas.width, canvas.height); c.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  if ("close" in fonte) fonte.close();
  for (let q = 0.8; q >= 0.3; q -= 0.1) {
    const b64 = await jpegBase64(canvas, q);
    if (b64.length * 0.75 <= BYTES_MAX) return { foto: b64, miniatura: await miniaturaDe(canvas) };
  }
  throw new Error("pax.err.grande");
}
