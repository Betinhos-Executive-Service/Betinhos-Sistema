import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  aceitaGaleria,
  acceptDaGaleria,
  criarProvaCaptura,
  mensagemRepetida,
  type Desenho,
  type EntradaProva,
  type FilaProvas
} from "../src/features/fotos/provaCaptura.ts";
import { dhashDaAmostra, lerExifJpeg, referenciaIso, seloDaJanela } from "../src/features/fotos/metadadosArquivo.ts";
import { portaProvaMock, type ComandoConferencia, type ComandoRegistroProva, type PortaProva, type ResultadoConferencia } from "../src/features/fotos/provaRemota.ts";

const AGORA = new Date("2026-11-16T12:00:00.000Z");
const LINK = "https://betinhos.sharepoint.com/Despesas/comprovante-1.jpg";
const fixture = (nome: string) => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url));
const arquivo = (nome: string, tipo: string, bytes: Uint8Array = fixture(nome)) => new File([bytes], nome, { type: tipo });

/** Desenho falso: a "imagem" carrega o próprio data URL, e a amostra do dHash sai dele (mesmo arquivo = mesmo dHash). */
function desenhoFalso() {
  const textos: string[] = [];
  const desenho: Desenho = {
    carregar: async (dataUrl) => ({ largura: 4000, altura: 3000, imagem: { origem: dataUrl } as unknown as CanvasImageSource }),
    criarTela: (largura, altura) => {
      const contexto = {
        fillStyle: "", font: "10px sans-serif", textBaseline: "alphabetic" as CanvasTextBaseline,
        drawImage: () => undefined, fillRect: () => undefined,
        fillText: (texto: string) => { textos.push(texto); },
        measureText: (texto: string) => ({ width: texto.length * 5 }) as TextMetrics
      };
      return {
        contexto: contexto as unknown as ReturnType<Desenho["criarTela"]>["contexto"],
        imagem: { origem: `tela-${largura}x${altura}-${textos.length}` } as unknown as CanvasImageSource,
        exportarJpeg: () => `data:image/jpeg;base64,${Buffer.from(`${largura}x${altura}`).toString("base64")}`
      };
    },
    amostrar: (imagem) => createHash("sha512").update(String((imagem as unknown as { origem: string }).origem)).update("x").digest().subarray(0, 9 * 8 * 4)
  };
  return { desenho, textos };
}

function filaMemoria() {
  let lista: EntradaProva[] = [];
  const fila: FilaProvas = { carregar: async () => lista.map((item) => ({ ...item })), gravar: async (nova) => { lista = nova; } };
  return { fila, itens: () => lista };
}

function montar(conferir?: (comando: ComandoConferencia) => Promise<ResultadoConferencia>) {
  const registros: ComandoRegistroProva[] = [];
  const conferencias: ComandoConferencia[] = [];
  const usados = new Map<string, string>();
  const porta: PortaProva = {
    emitirProvaMidia: portaProvaMock.emitirProvaMidia,
    registrarProvaMidia: async (comando) => { registros.push(comando); return portaProvaMock.registrarProvaMidia(comando); },
    conferirProvaMidia: async (comando) => {
      conferencias.push(comando);
      if (conferir) return conferir(comando);
      // Servidor falso: o mesmo SHA em outro registro é repetida; no mesmo registro, livre.
      const chave = `${comando.tabela}/${comando.registroId}`;
      const anterior = usados.get(comando.sha256);
      if (anterior && anterior !== chave) return { resultado: "repetida", usadaEm: "2026-10-03T15:00:00.000Z" };
      usados.set(comando.sha256, chave);
      return { resultado: "livre", usadaEm: null };
    }
  };
  const { desenho, textos } = desenhoFalso();
  const { fila, itens } = filaMemoria();
  const prova = criarProvaCaptura({ porta, fila, desenho, agora: () => AGORA, duracaoVideo: async () => 12 });
  return { prova, registros, conferencias, textos, itens };
}

const DESPESA = { tela: "despesa", tabela: "cr40f_despesaoperacional", registroId: "novo-1" } as const;
const COLISAO = { tela: "colisao", tabela: "cr40f_colisao_v2", registroId: "novo-2" } as const;

test("EXIF: lê data com fuso, marca, modelo e software do JPEG", () => {
  const exif = lerExifJpeg(fixture("foto-com-exif.jpg"));
  assert.deepEqual(exif, { dataGravada: "2026-11-15T14:30:00-03:00", offset: "-03:00", marca: "Apple", modelo: "iPhone 15", software: "17.1" });
  assert.equal(lerExifJpeg(fixture("foto-sem-exif.jpg")).dataGravada, null);
});

test("foto da galeria com data dentro da janela: sem selo, sem carimbo, reduzida e com SHA e dHash do original", async () => {
  const { prova, registros, textos, conferencias } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const original = fixture("foto-com-exif.jpg");

  const resultado = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"), { referencia: "2026-11-15" });

  assert.equal(resultado.ok, true);
  if (!resultado.ok || resultado.tipo !== "foto") return;
  assert.equal(resultado.selo, null);
  assert.equal(textos.length, 0, "foto da galeria não recebe carimbo");
  assert.equal(resultado.dados.origemCaptura, "galeria");
  assert.equal(resultado.dados.sha256Original, createHash("sha256").update(original).digest("hex"));
  assert.equal(conferencias[0].sha256, resultado.dados.sha256Original, "confere pelo original, antes da redução");
  assert.equal(resultado.dados.dhashes?.length, 1);
  assert.match(resultado.dados.dhashes?.[0] ?? "", /^[0-9a-f]{16}$/);
  assert.equal(resultado.dados.metadados?.marca, "Apple");
  assert.equal(resultado.dados.dataReferencia, "2026-11-15T00:00:00-03:00");

  assert.equal(await prova.registrarArquivo(resultado.dataUrl, LINK), "registrada");
  assert.equal(registros[0].origemCaptura, "galeria");
  assert.equal(registros[0].metadados?.dataGravada, "2026-11-15T14:30:00-03:00");
});

test("foto da galeria com data fora da janela entra com o selo fora-da-janela (não bloqueia)", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"), { referencia: "2026-11-17" });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.ok && resultado.selo, "fora-da-janela");
});

test("foto da galeria sem EXIF entra com o selo sem-data", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("foto-sem-exif.jpg", "image/jpeg"), { referencia: "2026-11-16" });
  assert.equal(resultado.ok && resultado.selo, "sem-data");
  assert.equal(resultado.ok && resultado.dados.metadados?.dataGravada, null);
});

test("vídeo da galeria: creation_time do mvhd (época de 1904) dentro da janela", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(COLISAO);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("video-mvhd.mp4", "video/mp4"), { referencia: "2026-11-15T10:00" });
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.equal(resultado.tipo, "video");
  assert.equal(resultado.dados.metadados?.dataGravada, "2026-11-15T17:30:00.000Z");
  assert.equal(resultado.selo, null);
  assert.equal(resultado.dados.duracaoSegundos, 12);
});

test("vídeo com mvhd na época errada (segundos desde 1970) vale como sem data", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(COLISAO);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("video-epoca-errada.mp4", "video/mp4"), { referencia: "2026-11-15T10:00" });
  assert.equal(resultado.ok && resultado.dados.metadados?.dataGravada, null);
  assert.equal(resultado.ok && resultado.selo, "sem-data");
});

test("PDF acima de 10 MB é recusado com o tamanho real", async () => {
  const { prova, conferencias } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const grande = arquivo("nota.pdf", "application/pdf", new Uint8Array(11 * 1024 * 1024));
  const resultado = await prova.prepararDaGaleria(sessao, grande);
  assert.deepEqual(resultado, { ok: false, erro: "PDF muito grande (11 MB). O limite é 10 MB." });
  assert.equal(conferencias.length, 0);
});

test("PDF acima de 20 páginas é recusado, contado pelo pdf-lib", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("pdf-21-paginas.pdf", "application/pdf"));
  assert.deepEqual(resultado, { ok: false, erro: "PDF com 21 páginas. O limite é 20 páginas." });
});

test("PDF dentro dos limites sobe como veio, com páginas e SHA do arquivo", async () => {
  const { prova, registros } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const bytes = fixture("pdf-2-paginas.pdf");
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("pdf-2-paginas.pdf", "application/pdf"));
  assert.equal(resultado.ok, true);
  if (!resultado.ok || resultado.tipo !== "pdf") return;
  assert.equal(Buffer.from(resultado.dataUrl.split(",")[1], "base64").equals(bytes), true, "sem alteração");
  assert.equal(resultado.dados.paginas, 2);
  assert.equal(resultado.dados.sha256, createHash("sha256").update(bytes).digest("hex"));
  await prova.registrarArquivo(resultado.dataUrl, LINK);
  assert.equal(registros[0].tipoMidia, "pdf");
  assert.equal(registros[0].paginas, 2);
});

test("galeria por tela: checklist sem botão; recebimento só imagem e vídeo; despesa só imagem e PDF", async () => {
  assert.equal(aceitaGaleria("checklist"), false);
  for (const tela of ["despesa", "devolucao", "manutencao", "finalizar", "colisao", "recebimento"] as const) assert.equal(aceitaGaleria(tela), true, tela);
  assert.equal(acceptDaGaleria("despesa"), "image/*,application/pdf");
  assert.equal(acceptDaGaleria("devolucao"), "image/*,application/pdf");
  assert.equal(acceptDaGaleria("recebimento"), "image/*,video/*");
  assert.equal(acceptDaGaleria("colisao"), "image/*,application/pdf,video/*");

  const { prova } = montar();
  const recebimento = await prova.iniciar({ tela: "recebimento", tabela: "cr40f_reservadeveculos", registroId: "S-1" });
  assert.deepEqual(await prova.prepararDaGaleria(recebimento, arquivo("pdf-2-paginas.pdf", "application/pdf")), { ok: false, erro: "Este tipo de arquivo não é aceito nesta tela." });
  const checklist = await prova.iniciar({ tela: "checklist", tabela: "new_checklistveiculo", registroId: "C-1" });
  assert.equal((await prova.prepararDaGaleria(checklist, arquivo("foto-com-exif.jpg", "image/jpeg"))).ok, false);
});

test("foto repetida em outro registro é recusada antes do envio, só com a data do uso anterior", async () => {
  const { prova, itens } = montar();
  const primeira = await prova.iniciar(DESPESA);
  assert.equal((await prova.prepararDaGaleria(primeira, arquivo("foto-com-exif.jpg", "image/jpeg"))).ok, true);
  const filaAntes = itens().length;

  const outra = await prova.iniciar({ ...DESPESA, registroId: "novo-3" });
  const resultado = await prova.prepararDaGaleria(outra, arquivo("foto-com-exif.jpg", "image/jpeg"));

  assert.deepEqual(resultado, { ok: false, erro: "Esta foto já foi usada em outro registro em 03/10/2026. Tire uma foto nova." });
  assert.equal(itens().length, filaAntes, "repetida não entra na fila de provas");
});

test("reenvio da mesma foto no mesmo registro é liberado", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(DESPESA);
  assert.equal((await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"))).ok, true);
  assert.equal((await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"))).ok, true);
});

test("sem resposta do conferir, a foto segue (o servidor reconfere ao registrar)", async () => {
  const { prova } = montar(async () => { throw new TypeError("Failed to fetch"); });
  const sessao = await prova.iniciar(DESPESA);
  assert.equal((await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"))).ok, true);
});

test("parecida em observação não bloqueia e é marcada", async () => {
  const { prova } = montar(async () => ({ resultado: "parecida-em-observacao", usadaEm: null }));
  const sessao = await prova.iniciar(DESPESA);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"));
  assert.equal(resultado.ok && resultado.parecida, true);
});

test("foto da câmera do app leva dois dHash: o da cena e o da foto final com carimbo", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-ao-vivo");
  assert.equal(foto.dados.dhashes?.length, 2);
  assert.notEqual(foto.dados.dhashes?.[0], foto.dados.dhashes?.[1]);
});

test("dHash: bit 1 quando o pixel é mais claro que o da direita", () => {
  const rgba = new Uint8Array(9 * 8 * 4);
  // Linha 0 decrescente (8 bits 1); demais linhas planas (0).
  for (let x = 0; x < 9; x += 1) rgba.set([255 - x * 20, 255 - x * 20, 255 - x * 20, 255], x * 4);
  assert.equal(dhashDaAmostra(rgba), "ff00000000000000");
});

test("janela: referência de data vira horário de Brasília; 24 h antes até agora + 10 min", () => {
  assert.equal(referenciaIso("2026-11-15"), "2026-11-15T00:00:00-03:00");
  assert.equal(referenciaIso("2026-11-15T10:00"), "2026-11-15T10:00:00-03:00");
  assert.equal(referenciaIso(""), null);
  const ref = "2026-11-15T00:00:00-03:00";
  assert.equal(seloDaJanela("2026-11-14T01:00:00-03:00", ref, AGORA), null);
  assert.equal(seloDaJanela("2026-11-13T23:00:00-03:00", ref, AGORA), "fora-da-janela");
  assert.equal(seloDaJanela("2026-11-16T12:09:00Z", ref, AGORA), null);
  assert.equal(seloDaJanela("2026-11-16T12:11:00Z", ref, AGORA), "fora-da-janela");
  assert.equal(seloDaJanela(null, ref, AGORA), "sem-data");
});

test("mensagem de repetida por tipo, sem dados de outro motorista", () => {
  assert.equal(mensagemRepetida("foto", "2026-01-05T02:00:00Z"), "Esta foto já foi usada em outro registro em 04/01/2026. Tire uma foto nova.");
  assert.equal(mensagemRepetida("pdf", null), "Este PDF já foi usado em outro registro. Escolha outro arquivo.");
});
