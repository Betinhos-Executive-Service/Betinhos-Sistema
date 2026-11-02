import assert from "node:assert/strict";
import test from "node:test";
import {
  anexoUrl,
  blocosDoConteudo,
  corrigirQuiz,
  formatValidade,
  mapParticipacao,
  mapTreinamento,
  mudancaAssinatura,
  mudancaConfirmacao,
  mudancaQuiz,
  participacaoPorTreinamento,
  parsePerguntas,
  proximaEtapa,
  resolverVideo,
  isAnexoVideo,
  separarTreinamentos,
  statusTreinamento,
  trechos,
  type Participacao,
  type Treinamento
} from "../src/lib/treinamentos.ts";

const QUIZ = { perguntas: [
  { id: "q1", texto: "P1", alternativas: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }], corretaId: "a" },
  { id: "q2", texto: "P2", alternativas: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }], corretaId: "b" },
  { id: "q3", texto: "P3", alternativas: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }], corretaId: "a" }
] };

const treinamento = (extra: Partial<Treinamento> = {}): Treinamento => ({
  ...mapTreinamento({
    cr40f_treinamentoid: "{A1A1A1A1-0000-4000-8000-000000000001}", cr40f_name: "Atendimento", cr40f_descricao: "d", cr40f_conteudo: "# T\n- i",
    cr40f_videourl: "https://youtu.be/dQw4w9WgXcQ", cr40f_anexosjson: JSON.stringify([{ nome: "g.pdf", caminho: "/sites/x/g.pdf", tamanho: 10, mime: "application/pdf" }, { nome: "sem caminho" }]),
    cr40f_exigeassinatura: true, cr40f_exigequiz: true, cr40f_notaminima: 70, cr40f_quizjson: JSON.stringify(QUIZ), cr40f_validade: "2026-12-15T00:00:00Z", cr40f_publicadoem: "2026-10-30T09:30:00Z"
  }),
  ...extra
});

const participacao = (extra: Partial<Participacao> = {}): Participacao => ({
  ...mapParticipacao({ cr40f_treinamentoparticipacaoid: "B2B2B2B2-0000-4000-8000-000000000002", _cr40f_treinamento_value: "a1a1a1a1-0000-4000-8000-000000000001", _cr40f_funcionario_value: "11111111-1111-4111-8111-111111111111" }),
  ...extra
});

const AGORA = "2026-11-02T15:00:00Z";
const STROKES: [number, number][][] = [[[0.1, 0.2], [0.4, 0.5], [0.6, 0.4]]];

test("mapeia treinamento e participação a partir das colunas do Dataverse", () => {
  const t = treinamento();
  assert.equal(t.id, "a1a1a1a1-0000-4000-8000-000000000001");
  assert.equal(t.validade, "2026-12-15");
  assert.equal(formatValidade(t.validade), "15/12/2026");
  assert.equal(t.perguntas.length, 3);
  assert.deepEqual(t.anexos.map((a) => a.nome), ["g.pdf"]);
  const p = participacao();
  assert.equal(p.id, "b2b2b2b2-0000-4000-8000-000000000002");
  assert.equal(p.tentativas, 0);
  assert.equal(p.nota, null);
  assert.equal(mapTreinamento({ cr40f_notaminima: null }).notaMinima, 70);
});

test("quiz inválido, com alternativa única ou sem resposta correta reconhecível é descartado; ids ausentes ganham um padrão", () => {
  assert.deepEqual(parsePerguntas("texto"), []);
  assert.deepEqual(parsePerguntas(JSON.stringify({ perguntas: [{ texto: "só uma", alternativas: [{ texto: "A" }], corretaId: "a0-0" }] })), []);
  // Sem correta (ou apontando para alternativa inexistente) a pergunta nunca pontuaria e travaria a conclusão.
  assert.deepEqual(parsePerguntas(JSON.stringify({ perguntas: [{ texto: "sem correta", alternativas: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }], corretaId: "" }] })), []);
  assert.deepEqual(parsePerguntas(JSON.stringify({ perguntas: [{ texto: "correta errada", alternativas: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }], corretaId: "zz" }] })), []);
  const [p] = parsePerguntas(JSON.stringify({ perguntas: [{ texto: "ok", alternativas: [{ texto: "A" }, { texto: "B" }, { texto: " " }], corretaId: "a0-1" }] }));
  assert.equal(p.id, "p0");
  assert.deepEqual(p.alternativas.map((a) => a.id), ["a0-0", "a0-1"]);
});

test("status e próxima etapa seguem leitura → assinatura → quiz → concluído", () => {
  const t = treinamento();
  assert.equal(statusTreinamento(participacao()), "novo");
  assert.equal(statusTreinamento(participacao({ abertoEm: AGORA })), "andamento");
  // Abertura não gravada, leitura confirmada depois: está em andamento, não é "novo".
  assert.equal(statusTreinamento(participacao({ confirmadoEm: AGORA })), "andamento");
  assert.equal(statusTreinamento(participacao({ concluidoEm: AGORA })), "concluido");
  assert.equal(proximaEtapa(t, participacao({ abertoEm: AGORA })), "leitura");
  assert.equal(proximaEtapa(t, participacao({ confirmadoEm: AGORA })), "assinatura");
  assert.equal(proximaEtapa(t, participacao({ confirmadoEm: AGORA, assinadoEm: AGORA })), "quiz");
  assert.equal(proximaEtapa(t, participacao({ confirmadoEm: AGORA, assinadoEm: AGORA, aprovado: false, nota: 66 })), "quiz");
  assert.equal(proximaEtapa(t, participacao({ confirmadoEm: AGORA, assinadoEm: AGORA, aprovado: true })), "concluido");
  assert.equal(proximaEtapa(treinamento({ exigeAssinatura: false, exigeQuiz: false }), participacao({ confirmadoEm: AGORA })), "concluido");
  assert.equal(proximaEtapa(treinamento({ exigeAssinatura: false }), participacao({ confirmadoEm: AGORA })), "quiz");
});

test("sem exigências, confirmar a leitura conclui; com exigências, só grava a confirmação", () => {
  const simples = mudancaConfirmacao(treinamento({ exigeAssinatura: false, exigeQuiz: false }), participacao({ abertoEm: AGORA }), AGORA);
  assert.deepEqual(simples.patch, { cr40f_confirmadoem: AGORA, cr40f_concluidoem: AGORA });
  assert.equal(simples.participacao.concluidoEm, AGORA);
  const completo = mudancaConfirmacao(treinamento(), participacao({ abertoEm: AGORA }), AGORA);
  assert.deepEqual(completo.patch, { cr40f_confirmadoem: AGORA });
  // Confirmar de novo não é uma etapa válida.
  assert.throws(() => mudancaConfirmacao(treinamento(), participacao({ confirmadoEm: "2026-11-01T10:00:00Z" }), AGORA), /já foi confirmada/);
});

test("assinatura exige leitura confirmada, traço válido e nome; grava assinaturajson e nome", () => {
  const t = treinamento({ exigeQuiz: false });
  assert.throws(() => mudancaAssinatura(t, participacao(), STROKES, "Renan"), /etapa de assinatura/);
  assert.throws(() => mudancaAssinatura(t, participacao({ confirmadoEm: AGORA }), [], "Renan"), /Desenhe/);
  assert.throws(() => mudancaAssinatura(t, participacao({ confirmadoEm: AGORA }), STROKES, "  "), /nome/);
  assert.throws(() => mudancaAssinatura(treinamento({ exigeAssinatura: false }), participacao({ confirmadoEm: AGORA }), STROKES, "Renan"), /etapa de assinatura/);
  const m = mudancaAssinatura(t, participacao({ confirmadoEm: AGORA }), STROKES, " Renan Mendonça ", AGORA);
  assert.deepEqual(m.patch, { cr40f_assinadoem: AGORA, cr40f_nomeassinante: "Renan Mendonça", cr40f_assinaturajson: JSON.stringify(STROKES), cr40f_concluidoem: AGORA });
  // Com quiz exigido, assinar não conclui.
  assert.equal("cr40f_concluidoem" in mudancaAssinatura(treinamento(), participacao({ confirmadoEm: AGORA }), STROKES, "Renan", AGORA).patch, false);
});

test("quiz com nota mínima 70: 2 de 3 (66) reprova e permite refazer; 3 de 3 aprova e conclui", () => {
  const t = treinamento();
  const p = participacao({ confirmadoEm: AGORA, assinadoEm: AGORA });
  assert.deepEqual(corrigirQuiz(t.perguntas, { q1: "a", q2: "b", q3: "b" }, 70), { nota: 66, aprovado: false, acertos: 2, total: 3 });
  assert.throws(() => mudancaQuiz(t, p, { q1: "a" }), /todas as perguntas/);
  assert.throws(() => mudancaQuiz(t, participacao({ confirmadoEm: AGORA }), { q1: "a", q2: "b", q3: "a" }), /etapa do quiz/);
  const reprovado = mudancaQuiz(t, p, { q1: "a", q2: "b", q3: "b" }, AGORA);
  assert.deepEqual(reprovado.patch, { cr40f_nota: 66, cr40f_aprovado: false, cr40f_tentativas: 1, cr40f_respostasjson: JSON.stringify({ q1: "a", q2: "b", q3: "b" }) });
  assert.equal(proximaEtapa(t, reprovado.participacao), "quiz");
  const aprovado = mudancaQuiz(t, reprovado.participacao, { q1: "a", q2: "b", q3: "a" }, AGORA);
  assert.equal(aprovado.resultado.nota, 100);
  assert.equal(aprovado.patch.cr40f_tentativas, 2);
  assert.equal(aprovado.patch.cr40f_concluidoem, AGORA);
  assert.equal(proximaEtapa(t, aprovado.participacao), "concluido");
  // Já aprovado: não há mais quiz a responder.
  assert.throws(() => mudancaQuiz(t, aprovado.participacao, { q1: "b", q2: "b", q3: "b" }, AGORA), /etapa do quiz/);
});

test("lista separa pendentes (publicação mais recente primeiro) e concluídos (conclusão mais recente primeiro)", () => {
  const a = { treinamento: treinamento({ id: "a", publicadoEm: "2026-10-01T00:00:00Z" }), participacao: participacao() };
  const b = { treinamento: treinamento({ id: "b", publicadoEm: "2026-10-20T00:00:00Z" }), participacao: participacao({ abertoEm: AGORA }) };
  const c = { treinamento: treinamento({ id: "c" }), participacao: participacao({ concluidoEm: "2026-10-05T00:00:00Z" }) };
  const d = { treinamento: treinamento({ id: "d" }), participacao: participacao({ concluidoEm: "2026-10-09T00:00:00Z" }) };
  const { pendentes, concluidos } = separarTreinamentos([a, c, b, d]);
  assert.deepEqual(pendentes.map((x) => x.treinamento.id), ["b", "a"]);
  assert.deepEqual(concluidos.map((x) => x.treinamento.id), ["d", "c"]);
});

test("vídeo: YouTube e Vimeo viram embed, outros https viram link, URL inválida é null", () => {
  assert.deepEqual(resolverVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), { kind: "embed", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0", href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10" });
  assert.equal(resolverVideo("https://youtu.be/dQw4w9WgXcQ")?.kind, "embed");
  assert.equal(resolverVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.kind, "embed");
  assert.deepEqual(resolverVideo("https://vimeo.com/123456"), { kind: "embed", src: "https://player.vimeo.com/video/123456", href: "https://vimeo.com/123456" });
  assert.deepEqual(resolverVideo("https://betinhos.sharepoint.com/sites/x/stream.aspx?id=1"), { kind: "link", href: "https://betinhos.sharepoint.com/sites/x/stream.aspx?id=1" });
  assert.deepEqual(resolverVideo("https://betinhos.sharepoint.com/sites/x/Treinamentos/Manobra%20de%20r%C3%A9.MP4?download=1"), { kind: "arquivo", src: "https://betinhos.sharepoint.com/sites/x/Treinamentos/Manobra%20de%20r%C3%A9.MP4?download=1" });
  assert.equal(resolverVideo("http://www.youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(resolverVideo("isso não é url"), null);
  assert.equal(resolverVideo(""), null);
  assert.equal(isAnexoVideo({ mime: "video/mp4", nome: "x" }), true);
  assert.equal(isAnexoVideo({ mime: "", nome: "Manobra.MOV" }), true);
  assert.equal(isAnexoVideo({ mime: "image/jpeg", nome: "foto.jpg" }), false);
});

test("anexo vira link do SharePoint com o caminho codificado; links absolutos passam direto", () => {
  assert.equal(anexoUrl({ caminho: "/sites/BetinhosGestoInterna/Documentos Compartilhados/Treinamentos/DEV/a1/Guia rápido.pdf" }), "https://betinhos.sharepoint.com/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Treinamentos/DEV/a1/Guia%20r%C3%A1pido.pdf");
  assert.equal(anexoUrl({ caminho: "Treinamentos/x.pdf" }), "https://betinhos.sharepoint.com/sites/BetinhosGestoInterna/Treinamentos/x.pdf");
  assert.equal(anexoUrl({ caminho: "https://outro.exemplo/arquivo.pdf" }), "https://outro.exemplo/arquivo.pdf");
});

test("marcação simples: títulos, listas, parágrafos e negrito", () => {
  assert.deepEqual(blocosDoConteudo("# Título\n- um\n- dois\n\nTexto **forte** aqui\ncontinua"), [
    { tipo: "h", texto: "Título" }, { tipo: "ul", itens: ["um", "dois"] }, { tipo: "p", texto: "Texto **forte** aqui\ncontinua" }
  ]);
  assert.deepEqual(trechos("Texto **forte** aqui"), [{ negrito: false, texto: "Texto " }, { negrito: true, texto: "forte" }, { negrito: false, texto: " aqui" }]);
});

test("participação duplicada: fica a mais adiantada (concluída > aberta > nova), sem voltar atrás", () => {
  const nova = participacao({ id: "p-nova" });
  const aberta = participacao({ id: "p-aberta", abertoEm: AGORA });
  const concluida = participacao({ id: "p-concluida", confirmadoEm: AGORA, concluidoEm: AGORA });
  assert.equal(participacaoPorTreinamento([nova, aberta]).get(nova.treinamentoId)?.id, "p-aberta");
  assert.equal(participacaoPorTreinamento([aberta, nova]).get(nova.treinamentoId)?.id, "p-aberta");
  // Concluída sem abertoem (gravação da abertura falhou) não é trocada por uma só aberta.
  assert.equal(participacaoPorTreinamento([concluida, aberta]).get(nova.treinamentoId)?.id, "p-concluida");
  assert.equal(participacaoPorTreinamento([aberta, concluida]).get(nova.treinamentoId)?.id, "p-concluida");
  // Confirmada sem abertoem empata com a aberta (ambas em andamento): fica a primeira, nunca a nova.
  const confirmada = participacao({ id: "p-confirmada", confirmadoEm: AGORA });
  assert.equal(participacaoPorTreinamento([nova, confirmada]).get(nova.treinamentoId)?.id, "p-confirmada");
});
