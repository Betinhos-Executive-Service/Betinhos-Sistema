import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolveObjectURL } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  aceitaGaleria,
  acceptDaGaleria,
  criarProvaCaptura,
  mensagemRepetida,
  VIDEO_SEM_DURACAO,
  type Desenho,
  type EntradaProva,
  type FilaProvas
} from "../src/features/fotos/provaCaptura.ts";
import { dhashDaAmostra, lerExifJpeg, referenciaIso } from "../src/features/fotos/metadadosArquivo.ts";
import { criarPortaProvaMock, type ComandoConferencia, type ComandoRegistroProva, type PortaProva, type ResultadoConferencia } from "../src/features/fotos/provaRemota.ts";
import { encerrarSessaoDoRascunho, sessaoDoRascunho } from "../src/features/fotos/sessaoDoRascunho.ts";

const AGORA = new Date("2026-11-16T12:00:00.000Z");
const LINK = "https://betinhos.sharepoint.com/Despesas/comprovante-1.jpg";
const fixture = (nome: string) => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url));
const arquivo = (nome: string, tipo: string, bytes: Uint8Array = fixture(nome)) => new File([bytes], nome, { type: tipo });

/** Desenho falso: a "imagem" guarda os bytes do blob URL (ou o data URL), e o dHash sai deles (mesmo arquivo = mesmo dHash). */
function desenhoFalso() {
  const textos: string[] = [];
  const carregados: string[] = [];
  const desenho: Desenho = {
    carregar: async (src) => {
      carregados.push(src);
      const blob = src.startsWith("blob:") ? resolveObjectURL(src) : undefined;
      const origem = blob ? createHash("sha256").update(new Uint8Array(await blob.arrayBuffer())).digest("hex") : src;
      return { largura: 4000, altura: 3000, imagem: { origem } as unknown as CanvasImageSource };
    },
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
  return { desenho, textos, carregados };
}

function filaMemoria() {
  let lista: EntradaProva[] = [];
  const fila: FilaProvas = { carregar: async () => lista.map((item) => ({ ...item })), gravar: async (nova) => { lista = nova; } };
  return { fila, itens: () => lista };
}

function montar(conferir?: (comando: ComandoConferencia) => Promise<ResultadoConferencia>, opcoes: { duracaoVideo?: (video: Blob) => Promise<number | null>; registrar?: PortaProva["registrarProvaMidia"] } = {}) {
  const registros: ComandoRegistroProva[] = [];
  const conferencias: ComandoConferencia[] = [];
  // Servidor falso = o mock do app: o mesmo SHA em outro registro é repetida; no mesmo registro (id real ou da sessão), livre.
  const servidor = criarPortaProvaMock();
  const porta: PortaProva = {
    emitirProvaMidia: servidor.emitirProvaMidia,
    registrarProvaMidia: async (comando) => { registros.push(comando); return (opcoes.registrar ?? servidor.registrarProvaMidia)(comando); },
    conferirProvaMidia: async (comando) => {
      conferencias.push(comando);
      if (conferir) return conferir(comando);
      const resposta = await servidor.conferirProvaMidia(comando);
      return resposta.resultado === "repetida" ? { ...resposta, usadaEm: "2026-10-03T15:00:00.000Z" } : resposta;
    }
  };
  const { desenho, textos, carregados } = desenhoFalso();
  const { fila, itens } = filaMemoria();
  const prova = criarProvaCaptura({ porta, fila, desenho, agora: () => AGORA, duracaoVideo: opcoes.duracaoVideo ?? (async () => 12) });
  return { prova, registros, conferencias, textos, itens, carregados };
}

const DESPESA = { tela: "despesa", tabela: "cr40f_despesaoperacional", registroId: "novo-1" } as const;
const COLISAO = { tela: "colisao", tabela: "cr40f_colisao_v2", registroId: "novo-2" } as const;

test("EXIF: lê data com fuso, marca, modelo e software do JPEG", () => {
  const exif = lerExifJpeg(fixture("foto-com-exif.jpg"));
  assert.deepEqual(exif, { dataGravada: "2026-11-15T14:30:00-03:00", offset: "-03:00", marca: "Apple", modelo: "iPhone 15", software: "17.1" });
  assert.equal(lerExifJpeg(fixture("foto-sem-exif.jpg")).dataGravada, null);
});

test("foto da galeria: sem carimbo, reduzida e com SHA, dHash e EXIF do original, aberta por blob URL", async () => {
  const { prova, registros, textos, conferencias, carregados } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const original = fixture("foto-com-exif.jpg");

  const resultado = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"), { referencia: "2026-11-15" });

  assert.equal(resultado.ok, true);
  if (!resultado.ok || resultado.tipo !== "foto") return;
  assert.equal("selo" in resultado, false, "o selo da janela é só do servidor");
  assert.match(carregados[0], /^blob:/, "a imagem abre pelo blob URL, sem virar base64");
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

test("foto da galeria com data fora da janela entra (a data nunca bloqueia; o servidor dá o selo)", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"), { referencia: "2026-11-17" });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.ok && resultado.dados.metadados?.dataGravada, "2026-11-15T14:30:00-03:00");
});

test("foto da galeria sem EXIF entra sem data gravada", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("foto-sem-exif.jpg", "image/jpeg"), { referencia: "2026-11-16" });
  assert.equal(resultado.ok, true);
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
  assert.equal(resultado.dados.duracaoSegundos, 12);
});

test("vídeo com mvhd na época errada (segundos desde 1970) vale como sem data", async () => {
  const { prova } = montar();
  const sessao = await prova.iniciar(COLISAO);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("video-epoca-errada.mp4", "video/mp4"), { referencia: "2026-11-15T10:00" });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.ok && resultado.dados.metadados?.dataGravada, null);
});

test("vídeo da galeria sem duração legível (null, Infinity, NaN) é recusado com o motivo", async () => {
  for (const duracao of [null, Number.POSITIVE_INFINITY, Number.NaN]) {
    const { prova, conferencias } = montar(undefined, { duracaoVideo: async () => duracao });
    const sessao = await prova.iniciar(COLISAO);
    const resultado = await prova.prepararDaGaleria(sessao, arquivo("video-mvhd.mp4", "video/mp4"));
    assert.deepEqual(resultado, { ok: false, erro: VIDEO_SEM_DURACAO }, String(duracao));
    assert.equal(conferencias.length, 0);
  }
  assert.equal(VIDEO_SEM_DURACAO, "Não consegui ler a duração do vídeo. Grave de novo pela câmera do app.");
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

test("parecida em observação não bloqueia (o selo é do servidor)", async () => {
  const { prova } = montar(async () => ({ resultado: "parecida-em-observacao", usadaEm: null }));
  const sessao = await prova.iniciar(DESPESA);
  const resultado = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"));
  assert.equal(resultado.ok, true);
});

test("registro novo: o registrar leva o id real e o da sessão; a devolução com o mesmo comprovante passa", async () => {
  const { prova, registros } = montar();
  const sessao = await prova.iniciar(DESPESA);
  const escolhida = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"), { referencia: "2026-11-15" });
  assert.equal(escolhida.ok && escolhida.tipo, "foto");
  if (!escolhida.ok || escolhida.tipo !== "foto") return;

  assert.equal(await prova.registrarArquivo(escolhida.dataUrl, LINK, { tabela: "cr40f_despesaoperacional", registroId: "D-1" }), "registrada");
  assert.equal(registros[0].registroId, "D-1");
  assert.equal(registros[0].sessaoId, "novo-1");

  const devolucao = await prova.iniciar({ tela: "devolucao", tabela: "cr40f_despesaoperacional", registroId: "D-1" });
  assert.equal((await prova.prepararDaGaleria(devolucao, arquivo("foto-com-exif.jpg", "image/jpeg"))).ok, true);
});

test("destino de outra tabela não troca o id da sessão (nota da manutenção vira despesa)", async () => {
  const { prova, registros } = montar();
  const sessao = await prova.iniciar({ tela: "finalizar", tabela: "cr40f_manutencoes", registroId: "M-1" });
  const escolhida = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"));
  if (!escolhida.ok || escolhida.tipo !== "foto") return assert.fail("foto recusada");
  await prova.registrarArquivo(escolhida.dataUrl, LINK, { tabela: "cr40f_despesaoperacional", registroId: "D-9" });
  assert.equal(registros[0].registroId, "M-1");
  assert.equal(registros[0].sessaoId, undefined);
});

test("colisão nova: o registrar leva o id real (o servidor preenche o lookup)", async () => {
  const { prova, registros } = montar();
  const sessao = await prova.iniciar(COLISAO);
  const escolhida = await prova.prepararDaGaleria(sessao, arquivo("foto-sem-exif.jpg", "image/jpeg"));
  if (!escolhida.ok || escolhida.tipo !== "foto") return assert.fail("foto recusada");
  await prova.registrarArquivo(escolhida.dataUrl, LINK, { tabela: "cr40f_colisao_v2", registroId: "6b1f0c2e-4a5d-4e8f-9a7b-1c2d3e4f5a6b" });
  assert.equal(registros[0].registroId, "6b1f0c2e-4a5d-4e8f-9a7b-1c2d3e4f5a6b");
  assert.equal(registros[0].sessaoId, "novo-2");
});

test("reabrir a câmera no mesmo rascunho e escolher o mesmo arquivo passa; rascunho novo ganha outra sessão", async () => {
  const id = sessaoDoRascunho("despesa-teste");
  assert.equal(sessaoDoRascunho("despesa-teste"), id);
  const { prova } = montar();
  const primeira = await prova.iniciar({ ...DESPESA, registroId: id });
  assert.equal((await prova.prepararDaGaleria(primeira, arquivo("foto-com-exif.jpg", "image/jpeg"))).ok, true);
  const reaberta = await prova.iniciar({ ...DESPESA, registroId: sessaoDoRascunho("despesa-teste") });
  assert.equal((await prova.prepararDaGaleria(reaberta, arquivo("foto-com-exif.jpg", "image/jpeg"))).ok, true);
  encerrarSessaoDoRascunho("despesa-teste");
  assert.notEqual(sessaoDoRascunho("despesa-teste"), id);
  encerrarSessaoDoRascunho("despesa-teste");
});

test("o original da câmera nativa reenviado pela galeria noutro registro é recusado como repetida", async () => {
  const { prova, registros } = montar();
  const original = fixture("foto-com-exif.jpg");
  const sessao = await prova.iniciar(DESPESA);
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-nativa", { original: new Blob([original]) });
  assert.equal(foto.dados.sha256Original, createHash("sha256").update(original).digest("hex"));
  await prova.registrarArquivo(foto.dataUrl, LINK, { tabela: "cr40f_despesaoperacional", registroId: "D-1" });
  assert.equal(registros[0].sha256Original, foto.dados.sha256Original);

  const outra = await prova.iniciar({ ...DESPESA, registroId: "novo-3" });
  const resultado = await prova.prepararDaGaleria(outra, arquivo("foto-com-exif.jpg", "image/jpeg"));
  assert.deepEqual(resultado, { ok: false, erro: "Esta foto já foi usada em outro registro em 03/10/2026. Tire uma foto nova." });
});

test("idCliente: um por prova, guardado na fila e repetido no reenvio depois de falha", async () => {
  let falhar = true;
  const { prova, registros, itens } = montar(undefined, {
    registrar: async (comando) => {
      if (falhar) throw new TypeError("Failed to fetch");
      return { ok: true, provaId: "p-1", selos: [] };
    }
  });
  const sessao = await prova.iniciar(DESPESA);
  const escolhida = await prova.prepararDaGaleria(sessao, arquivo("foto-com-exif.jpg", "image/jpeg"));
  if (!escolhida.ok || escolhida.tipo !== "foto") return assert.fail("foto recusada");
  assert.match(escolhida.dados.idCliente ?? "", /^[0-9a-f-]{36}$/);

  assert.equal(await prova.registrarArquivo(escolhida.dataUrl, LINK, { tabela: "cr40f_despesaoperacional", registroId: "D-1" }), "pendente");
  assert.equal(itens()[0].dados.idCliente, escolhida.dados.idCliente);
  assert.equal(itens()[0].sessao.registroReal, "D-1", "o id real fica na fila para o reenvio");
  falhar = false;
  assert.equal(await prova.reenviarPendentes(), 1);
  assert.equal(registros[1].idCliente, registros[0].idCliente);
  assert.equal(registros[1].registroId, "D-1");
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

test("referência declarada: data vira horário de Brasília (o servidor usa a do registro quando o id é real)", () => {
  assert.equal(referenciaIso("2026-11-15"), "2026-11-15T00:00:00-03:00");
  assert.equal(referenciaIso("2026-11-15T10:00"), "2026-11-15T10:00:00-03:00");
  assert.equal(referenciaIso(""), null);
});

test("mensagem de repetida por tipo, sem dados de outro motorista", () => {
  assert.equal(mensagemRepetida("foto", "2026-01-05T02:00:00Z"), "Esta foto já foi usada em outro registro em 04/01/2026. Tire uma foto nova.");
  assert.equal(mensagemRepetida("pdf", null), "Este PDF já foi usado em outro registro. Escolha outro arquivo.");
});
