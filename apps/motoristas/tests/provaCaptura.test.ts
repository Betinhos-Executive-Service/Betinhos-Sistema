import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CODIGO_ALFABETO,
  FOTO_MAX_LADO,
  VIDEO_MAX_BYTES,
  criarProvaCaptura,
  permiteVideo,
  validarVideo,
  type Desenho,
  type EntradaProva,
  type FilaProvas
} from "../src/features/fotos/provaCaptura.ts";
import { PROVA_MOCK_CODIGO, PROVA_MOCK_EMITIDO_EM, portaProvaMock, type ComandoRegistroProva, type PortaProva } from "../src/features/fotos/provaRemota.ts";

const ORIGEM = { tela: "despesa", tabela: "cr40f_despesas", registroId: "novo-1" } as const;
const AGORA = new Date("2026-11-16T12:00:05.000Z");
const LINK = "https://betinhos.sharepoint.com/Despesas/comprovante-1.jpg";

type Chamada = { metodo: string; args: unknown[] };

function desenhoFalso(largura: number, altura: number) {
  const telas: Array<{ largura: number; altura: number; chamadas: Chamada[] }> = [];
  const desenho: Desenho = {
    carregar: async () => ({ largura, altura, imagem: {} as CanvasImageSource }),
    criarTela: (w, h) => {
      const chamadas: Chamada[] = [];
      telas.push({ largura: w, altura: h, chamadas });
      const contexto = {
        fillStyle: "", font: "10px sans-serif", textBaseline: "alphabetic" as CanvasTextBaseline,
        drawImage: (...args: unknown[]) => { chamadas.push({ metodo: "drawImage", args }); },
        fillRect: (...args: unknown[]) => { chamadas.push({ metodo: "fillRect", args }); },
        fillText: (...args: unknown[]) => { chamadas.push({ metodo: "fillText", args }); },
        measureText(texto: string) { return { width: texto.length * Number(/(\d+)px/.exec(this.font)?.[1] ?? 10) * 0.55 } as TextMetrics; }
      };
      return {
        contexto: contexto as unknown as ReturnType<Desenho["criarTela"]>["contexto"],
        imagem: {} as CanvasImageSource,
        exportarJpeg: (qualidade) => `data:image/jpeg;base64,${Buffer.from(JSON.stringify({ w, h, qualidade, chamadas })).toString("base64")}`
      };
    },
    amostrar: () => new Uint8ClampedArray(9 * 8 * 4)
  };
  return { desenho, telas };
}

function filaMemoria() {
  let lista: EntradaProva[] = [];
  const fila: FilaProvas = { carregar: async () => lista.map((item) => ({ ...item })), gravar: async (nova) => { lista = nova; } };
  return { fila, itens: () => lista };
}

function portaGravando(base: PortaProva = portaProvaMock) {
  const registros: ComandoRegistroProva[] = [];
  const porta: PortaProva = {
    emitirProvaMidia: base.emitirProvaMidia,
    registrarProvaMidia: async (comando) => { registros.push(comando); return base.registrarProvaMidia(comando); }
  };
  return { porta, registros };
}

function sha256DoDataUrl(dataUrl: string) {
  return createHash("sha256").update(Buffer.from(dataUrl.split(",")[1], "base64")).digest("hex");
}

function montar(opcoes: { porta?: PortaProva; localizar?: () => Promise<any>; largura?: number; altura?: number } = {}) {
  const { desenho, telas } = desenhoFalso(opcoes.largura ?? 4032, opcoes.altura ?? 3024);
  const { fila, itens } = filaMemoria();
  let agora = AGORA;
  const prova = criarProvaCaptura({ porta: opcoes.porta ?? portaProvaMock, fila, desenho, agora: () => agora, localizar: opcoes.localizar });
  return { prova, telas, itens, avancar: (ms: number) => { agora = new Date(agora.getTime() + ms); } };
}

test("com rede: código do servidor no carimbo e prova registrada sem selo, com o hash do arquivo enviado", async () => {
  const { porta, registros } = portaGravando();
  const { prova, itens } = montar({ porta, localizar: async () => ({ estado: "registrada", latitude: -22.9, longitude: -43.2, precisaoMetros: 12 }) });

  const sessao = await prova.iniciar(ORIGEM);
  await new Promise((resolve) => setImmediate(resolve));
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", { placa: "ABC1D23" }, "camera-ao-vivo");

  assert.equal(sessao.semRede, false);
  assert.equal(sessao.codigo, PROVA_MOCK_CODIGO);
  assert.equal(await prova.registrarArquivo(foto.dataUrl, LINK), "registrada");
  const registro = registros[0];
  assert.equal(registro.codigo, PROVA_MOCK_CODIGO);
  assert.equal(registro.emitidoEm, PROVA_MOCK_EMITIDO_EM);
  assert.equal(registro.sha256, sha256DoDataUrl(foto.dataUrl));
  assert.equal(registro.tamanhoBytes, Buffer.from(foto.dataUrl.split(",")[1], "base64").length);
  assert.equal(registro.link, LINK);
  assert.equal(registro.semRede, false);
  assert.equal(registro.capturadoEm, AGORA.toISOString());
  assert.deepEqual(registro.localizacao, { estado: "registrada", latitude: -22.9, longitude: -43.2, precisaoMetros: 12 });
  assert.equal(itens().length, 0, "registrada sai da fila");
});

test("sem rede: a foto sai com SEM REDE, código local do alfabeto e a prova vai marcada sem rede", async () => {
  const { porta, registros } = portaGravando({ ...portaProvaMock, emitirProvaMidia: async () => { throw new TypeError("Failed to fetch"); } });
  const { prova, telas } = montar({ porta });

  const sessao = await prova.iniciar(ORIGEM);
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-nativa");
  await prova.registrarArquivo(foto.dataUrl, LINK);

  assert.equal(sessao.semRede, true);
  assert.match(sessao.codigo, new RegExp(`^[${CODIGO_ALFABETO}]{6}$`));
  const textos = telas[0].chamadas.filter((c) => c.metodo === "fillText").map((c) => String(c.args[0]));
  assert.ok(textos.includes("SEM REDE"));
  assert.equal(registros[0].semRede, true);
  assert.equal(registros[0].emitidoEm, null);
  assert.equal(registros[0].assinatura, null);
  assert.equal(registros[0].origemCaptura, "camera-nativa");
});

test("falha no registrar não lança: a prova fica pendente com o link e é reenviada depois", async () => {
  let fora = true;
  const { porta, registros } = portaGravando({
    ...portaProvaMock,
    registrarProvaMidia: async (comando) => { if (fora) throw new Error("rede caiu"); return portaProvaMock.registrarProvaMidia(comando); }
  });
  const { prova, itens } = montar({ porta });
  const sessao = await prova.iniciar(ORIGEM);
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-ao-vivo");

  assert.equal(await prova.registrarArquivo(foto.dataUrl, LINK), "pendente");
  assert.equal(itens().length, 1);
  assert.equal(itens()[0].link, LINK);

  fora = false;
  assert.equal(await prova.reenviarPendentes(), 1);
  assert.equal(itens().length, 0);
  assert.equal(registros.at(-1)?.link, LINK);
});

test("pendentes com mais de 7 dias são descartadas sem reenviar", async () => {
  const { porta, registros } = portaGravando();
  const { prova, itens, avancar } = montar({ porta });
  const sessao = await prova.iniciar(ORIGEM);
  await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-ao-vivo");

  avancar(8 * 24 * 60 * 60 * 1000);
  assert.equal(await prova.reenviarPendentes(), 0);
  assert.equal(itens().length, 0);
  assert.equal(registros.length, 0);
});

test("localização negada não bloqueia a captura e vai como negada, sem coordenadas", async () => {
  const { porta, registros } = portaGravando();
  const { prova } = montar({ porta, localizar: async () => ({ estado: "negada", latitude: null, longitude: null, precisaoMetros: null }) });
  const sessao = await prova.iniciar(ORIGEM);
  await new Promise((resolve) => setImmediate(resolve));
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-ao-vivo");
  await prova.registrarArquivo(foto.dataUrl, LINK);

  assert.deepEqual(registros[0].localizacao, { estado: "negada", latitude: null, longitude: null, precisaoMetros: null });
});

test("localização lenta não atrasa a captura: sai como indisponível", async () => {
  const { porta, registros } = portaGravando();
  const { prova } = montar({ porta, localizar: () => new Promise(() => undefined) });
  const sessao = await prova.iniciar(ORIGEM);
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-ao-vivo");
  await prova.registrarArquivo(foto.dataUrl, LINK);

  assert.equal(registros[0].localizacao.estado, "indisponivel");
});

test("foto: reduzida a 2048 px, JPEG 0,85, e a faixa do carimbo acrescentada abaixo sem cobrir a imagem", async () => {
  const { prova, telas } = montar({ largura: 4032, altura: 3024 });
  const sessao = await prova.iniciar(ORIGEM);
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", { placa: "ABC1D23", registro: "DESP-12" }, "camera-ao-vivo");

  const tela = telas[0];
  const imagem = tela.chamadas.find((c) => c.metodo === "drawImage")?.args as number[];
  assert.deepEqual(imagem.slice(1), [0, 0, 2048, 1536], "imagem inteira, reduzida a 2048 px no maior lado");
  assert.equal(Math.max(imagem[3], imagem[4]), FOTO_MAX_LADO);
  const faixa = tela.chamadas.find((c) => c.metodo === "fillRect")?.args as number[];
  assert.deepEqual(faixa.slice(0, 3), [0, 1536, 2048], "faixa começa onde a imagem termina");
  assert.equal(tela.altura, 1536 + faixa[3], "canvas mais alto: a faixa vem por fora");
  assert.equal(tela.largura, 2048);
  assert.equal(JSON.parse(Buffer.from(foto.dataUrl.split(",")[1], "base64").toString()).qualidade, 0.85);
  const textos = tela.chamadas.filter((c) => c.metodo === "fillText");
  assert.equal(String(textos[0].args[0]), "16/11/2026 09:00:05 · ABC1D23 · DESP-12");
  assert.equal(String(textos[1].args[0]), `Código ${PROVA_MOCK_CODIGO}`);
  assert.ok(textos.every((c) => Number(c.args[2]) > 1536), "texto só na faixa, abaixo da imagem");
  assert.equal(foto.dados.tipoMidia, "foto");
  assert.equal(foto.dados.duracaoSegundos, null);
});

test("foto pequena não é ampliada e ganha a faixa abaixo com altura mínima legível", async () => {
  const { prova, telas } = montar({ largura: 480, altura: 640 });
  const sessao = await prova.iniciar(ORIGEM);
  await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", { placa: "ABC1D23", registro: "DESP-123456" }, "camera-nativa");

  const tela = telas[0];
  const imagem = tela.chamadas.find((c) => c.metodo === "drawImage")?.args as number[];
  assert.deepEqual(imagem.slice(1), [0, 0, 480, 640]);
  const faixa = tela.chamadas.find((c) => c.metodo === "fillRect")?.args as number[];
  assert.equal(faixa[1], 640);
  assert.equal(faixa[3], 40);
  assert.deepEqual([tela.largura, tela.altura], [480, 680]);
});

test("vídeo: dados com hash e tamanho do arquivo, sem carimbo", async () => {
  const { porta, registros } = portaGravando();
  const { prova, telas } = montar({ porta });
  const sessao = await prova.iniciar({ tela: "colisao", tabela: "cr40f_colisao_v2", registroId: "novo-2" });
  const video = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" });
  const dados = await prova.dadosDoVideo(sessao, video, "camera-ao-vivo", 12.4);

  assert.equal(telas.length, 0);
  assert.equal(dados.tamanhoBytes, 4);
  assert.equal(dados.sha256, createHash("sha256").update(Buffer.from([1, 2, 3, 4])).digest("hex"));
  await prova.registrarArquivo(`data:video/mp4;base64,${Buffer.from([1, 2, 3, 4]).toString("base64")}`, LINK);
  assert.equal(registros[0].tipoMidia, "video");
  assert.equal(registros[0].duracaoSegundos, 12.4);
});

test("limites de vídeo: recusa acima de 120 s ou de 70 MB", () => {
  assert.equal(validarVideo({ duracaoSegundos: 119, tamanhoBytes: VIDEO_MAX_BYTES }), "");
  assert.equal(validarVideo({ duracaoSegundos: 160, tamanhoBytes: 10 }), "Vídeo muito longo (2 min 40 s). O limite é 2 minutos.");
  assert.equal(validarVideo({ duracaoSegundos: 30, tamanhoBytes: 85 * 1024 * 1024 }), "Vídeo muito grande (85 MB). O limite é 70 MB: grave um vídeo mais curto.");
  assert.equal(validarVideo({ duracaoSegundos: 30, tamanhoBytes: VIDEO_MAX_BYTES + 1 }), "Vídeo muito grande (71 MB). O limite é 70 MB: grave um vídeo mais curto.");
  assert.equal(validarVideo({ duracaoSegundos: null, tamanhoBytes: 10 }), "");
});

test("despesa não aceita vídeo; as outras telas aceitam", () => {
  assert.equal(permiteVideo("despesa"), false);
  for (const tela of ["recebimento", "manutencao", "finalizar", "colisao", "checklist"] as const) assert.equal(permiteVideo(tela), true);
});

test("arquivo sem prova (ex.: galeria ou PDF) não chama o registrar", async () => {
  const { porta, registros } = portaGravando();
  const { prova } = montar({ porta });
  assert.equal(await prova.registrarArquivo("data:application/pdf;base64,JVBERi0=", LINK), "sem-prova");
  assert.equal(registros.length, 0);
});

test("prova que sempre falha no registrar mantém a data da captura e expira em 7 dias", async () => {
  const { porta } = portaGravando({ ...portaProvaMock, registrarProvaMidia: async () => { throw new Error("rede caiu"); } });
  const { prova, itens, avancar } = montar({ porta });
  const sessao = await prova.iniciar(ORIGEM);
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-ao-vivo");
  const criadoEm = itens()[0].criadoEm;

  avancar(60 * 60 * 1000);
  await prova.registrarArquivo(foto.dataUrl, LINK);
  assert.equal(itens()[0].criadoEm, criadoEm);

  avancar(8 * 24 * 60 * 60 * 1000);
  assert.equal(await prova.reenviarPendentes(), 0);
  assert.equal(itens().length, 0);
});

test("reenvios simultâneos registram cada prova uma vez só", async () => {
  let fora = true;
  const { porta, registros } = portaGravando({
    ...portaProvaMock,
    registrarProvaMidia: async (comando) => { if (fora) throw new Error("rede caiu"); return portaProvaMock.registrarProvaMidia(comando); }
  });
  const { prova } = montar({ porta });
  const sessao = await prova.iniciar(ORIGEM);
  const foto = await prova.aplicarNaFoto(sessao, "data:image/jpeg;base64,AAAA", {}, "camera-ao-vivo");
  await prova.registrarArquivo(foto.dataUrl, LINK);

  fora = false;
  const antes = registros.length;
  await Promise.all([prova.reenviarPendentes(), prova.reenviarPendentes()]);
  assert.equal(registros.length - antes, 1);
});
