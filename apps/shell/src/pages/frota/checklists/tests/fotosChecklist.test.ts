import assert from "node:assert/strict";
import { test } from "vitest";
import { createFotos, FLOW_VAR_FOTOS, lerVariavelAmbiente } from "../data/fotosChecklist";
import { usarXrmFalso } from "./xrmFalso";

usarXrmFalso();

const FLOW = "https://flow.example.com/consultar";
const PNG_BASE64 = Buffer.from("png-bytes").toString("base64");

type Chamada = { entity: string; options: string };

// Xrm falso: devolve o valor sobrescrito e/ou o padrão da definição da variável de ambiente.
function instalarXrm({ valor = "", padrao = "" }: { valor?: string; padrao?: string } = {}) {
  const chamadas: Chamada[] = [];
  const WebApi = {
    retrieveMultipleRecords: async (entity: string, options: string) => {
      chamadas.push({ entity, options });
      if (entity === "environmentvariablevalue") return { entities: valor ? [{ value: valor }] : [] };
      if (entity === "environmentvariabledefinition") return { entities: padrao ? [{ defaultvalue: padrao }] : [] };
      throw new Error(`Tabela inesperada: ${entity}`);
    }
  };
  (globalThis as { window?: unknown }).window = { Xrm: { WebApi }, parent: undefined };
  return chamadas;
}

type Resposta = { status?: number; corpo?: unknown };

// fetch falso: registra cada POST e responde pelo que `responder` devolver para o link.
function fetchFalso(responder: (link: string) => Resposta | Promise<Resposta> = () => ({ corpo: { sucesso: true, nomeArquivo: "Pneus-1.jpg", mimeType: "image/jpeg", conteudoBase64: PNG_BASE64 } })) {
  const posts: { url: string; body: { link: string; nomeArquivo: string } }[] = [];
  const fetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    posts.push({ url, body });
    const { status = 200, corpo } = await responder(body.link);
    return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
  };
  return { fetch: fetch as unknown as typeof globalThis.fetch, posts };
}

let blobs = 0;
const criarUrl = () => `blob:teste/${++blobs}`;
const foto = (n: number) => ({ link: `https://betinhos-my.sharepoint.com/:i:/g/foto-${n}`, nomeArquivo: `Pneus-${n}.jpg` });

test("lê a URL do flow uma vez só e posta link e nomeArquivo", async () => {
  const chamadas = instalarXrm({ valor: FLOW });
  const { fetch, posts } = fetchFalso();
  const carregar = createFotos({ fetch, criarUrl });
  const [a, b] = await Promise.all([carregar(foto(1)), carregar(foto(2))]);
  assert.match(a.url, /^blob:/);
  assert.notEqual(a.url, b.url);
  assert.equal(a.mime, "image/jpeg");
  assert.equal(chamadas.length, 1, "valor sobrescrito encontrado: não lê a definição");
  assert.match(chamadas[0].options, new RegExp(`schemaname eq '${FLOW_VAR_FOTOS}'`));
  assert.deepEqual(posts.map((post) => post.url), [FLOW, FLOW]);
  assert.deepEqual(posts[0].body, foto(1));
});

test("sem valor sobrescrito usa o padrão da definição", async () => {
  const chamadas = instalarXrm({ padrao: ` ${FLOW} ` });
  assert.equal(await lerVariavelAmbiente(FLOW_VAR_FOTOS), FLOW);
  assert.deepEqual(chamadas.map((chamada) => chamada.entity), ["environmentvariablevalue", "environmentvariabledefinition"]);
});

test("guarda a foto em cache por link durante a sessão", async () => {
  instalarXrm({ valor: FLOW });
  const { fetch, posts } = fetchFalso();
  const carregar = createFotos({ fetch, criarUrl });
  const primeira = await carregar(foto(1));
  const segunda = await carregar(foto(1));
  assert.equal(segunda, primeira);
  assert.equal(posts.length, 1);
});

test("não guarda erro em cache: a próxima tentativa busca de novo", async () => {
  instalarXrm({ valor: FLOW });
  let falhar = true;
  const { fetch, posts } = fetchFalso(() => falhar
    ? { corpo: { sucesso: false, erro: "Arquivo não encontrado no OneDrive." } }
    : { corpo: { sucesso: true, nomeArquivo: "Pneus-1.jpg", mimeType: "image/jpeg", conteudoBase64: PNG_BASE64 } });
  const carregar = createFotos({ fetch, criarUrl });
  await assert.rejects(carregar(foto(1)), /Arquivo não encontrado no OneDrive\./);
  falhar = false;
  const ok = await carregar(foto(1));
  assert.match(ok.url, /^blob:/);
  assert.equal(posts.length, 2);
});

test("erro HTTP do flow sem corpo vira mensagem com o status", async () => {
  instalarXrm({ valor: FLOW });
  const { fetch } = fetchFalso(() => ({ status: 502 }));
  await assert.rejects(createFotos({ fetch, criarUrl })(foto(1)), /HTTP 502/);
});

test("variável ausente: erro claro, nenhum POST, falha guardada por alguns segundos e depois relida", async () => {
  const chamadas = instalarXrm();
  const { fetch, posts } = fetchFalso();
  let relogio = 1_000;
  const carregar = createFotos({ fetch, criarUrl, agora: () => relogio, esperaFalhaFlowMs: 10_000 });
  await assert.rejects(carregar(foto(1)), new RegExp(`falta ${FLOW_VAR_FOTOS}`));
  assert.equal(posts.length, 0);
  const lidas = chamadas.length;
  await assert.rejects(carregar(foto(2)), new RegExp(`falta ${FLOW_VAR_FOTOS}`));
  assert.equal(chamadas.length, lidas, "dentro da espera não consulta a variável de novo");
  relogio += 10_000;
  await assert.rejects(carregar(foto(3)));
  assert.ok(chamadas.length > lidas, "passada a espera, relê a variável");
});

// fetch que só termina quando o signal aborta (como o fetch real com AbortSignal.timeout).
function fetchPendurado() {
  const posts: string[] = [];
  const fetch = (_url: string, init: { body: string; signal?: AbortSignal }) => {
    posts.push(JSON.parse(init.body).link);
    return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
  };
  return { fetch: fetch as unknown as typeof globalThis.fetch, posts };
}

test("fetch que nunca responde: tempo esgotado, erro fora do cache e vaga liberada", async () => {
  instalarXrm({ valor: FLOW });
  const { fetch, posts } = fetchPendurado();
  const carregar = createFotos({ fetch, criarUrl, tempoLimiteMs: 30 });
  const resultados = await Promise.allSettled([1, 2, 3, 4].map((n) => carregar(foto(n))));
  assert.equal(posts.length, 4, "a 4ª busca entra quando uma das 3 primeiras estoura o tempo");
  for (const resultado of resultados) {
    assert.equal(resultado.status, "rejected");
    assert.match(String((resultado as PromiseRejectedResult).reason), /Tempo esgotado/);
  }
  await assert.rejects(carregar(foto(1)), /Tempo esgotado/);
  assert.equal(posts.length, 5, "o erro não ficou no cache");
});

test("fetch que rejeita (rede/CORS): erro fora do cache e vaga liberada", async () => {
  instalarXrm({ valor: FLOW });
  const posts: string[] = [];
  const fetch = (async (_url: string, init: { body: string }) => { posts.push(JSON.parse(init.body).link); throw new TypeError("Failed to fetch"); }) as unknown as typeof globalThis.fetch;
  const carregar = createFotos({ fetch, criarUrl });
  const resultados = await Promise.allSettled([1, 2, 3, 4, 5].map((n) => carregar(foto(n))));
  assert.equal(posts.length, 5);
  assert.ok(resultados.every((resultado) => resultado.status === "rejected"));
  await assert.rejects(carregar(foto(1)), /Failed to fetch/);
  assert.equal(posts.length, 6);
});

test("pronta(link) devolve na hora só a foto que já chegou", async () => {
  instalarXrm({ valor: FLOW });
  const { fetch } = fetchFalso();
  const carregar = createFotos({ fetch, criarUrl });
  const pendente = carregar(foto(1));
  assert.equal(carregar.pronta(foto(1).link), undefined);
  const carregada = await pendente;
  assert.equal(carregar.pronta(foto(1).link), carregada);
  assert.equal(carregar.pronta(foto(2).link), undefined);
});

test("no máximo 3 buscas ao mesmo tempo", async () => {
  instalarXrm({ valor: FLOW });
  let ativas = 0;
  let pico = 0;
  const liberar: (() => void)[] = [];
  const { fetch, posts } = fetchFalso(async () => {
    ativas += 1;
    pico = Math.max(pico, ativas);
    await new Promise<void>((resolve) => liberar.push(resolve));
    ativas -= 1;
    return { corpo: { sucesso: true, nomeArquivo: "f.jpg", mimeType: "image/jpeg", conteudoBase64: PNG_BASE64 } };
  });
  const carregar = createFotos({ fetch, criarUrl });
  const todas = Promise.all([1, 2, 3, 4, 5, 6, 7].map((n) => carregar(foto(n))));
  const esperar = () => new Promise((resolve) => setTimeout(resolve, 5));
  await esperar();
  assert.equal(posts.length, 3);
  while (liberar.length) { liberar.shift()?.(); await esperar(); }
  await todas;
  assert.equal(posts.length, 7);
  assert.equal(pico, 3);
});

test("o mime vem da extensão quando o flow não informa", async () => {
  instalarXrm({ valor: FLOW });
  const { fetch } = fetchFalso(() => ({ corpo: { sucesso: true, nomeArquivo: "Lataria-1.png", conteudoBase64: PNG_BASE64 } }));
  const carregada = await createFotos({ fetch, criarUrl })(foto(1));
  assert.equal(carregada.mime, "image/png");
  assert.equal(carregada.nome, "Lataria-1.png");
});
