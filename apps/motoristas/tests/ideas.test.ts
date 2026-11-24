import assert from "node:assert/strict";
import test from "node:test";
import {
  IDEA_STATUS,
  IDEA_TITLE_MAX_LENGTH,
  buildIdeaRecord,
  IDEA_ATTACHMENT_MAX,
  IDEA_MEDIA_TYPE,
  buildIdeaAttachmentRecord,
  classifyIdeaFile,
  getIdeaStatusOption,
  ideaFileMimeType,
  isMissingEntityError,
  safeAttachmentLink,
  normalizeIdeaAttachmentRecord,
  normalizeIdeaRecord,
  summarizeAttachments,
  validateIdeaDraft,
  validateIdeaMedia
} from "../src/features/ideias/ideas.ts";

test("validateIdeaDraft exige título e respeita limites da tabela cr40f_boasideias", () => {
  assert.deepEqual(validateIdeaDraft({ title: "   ", details: "" }), { title: "Informe o título da ideia." });
  assert.ok(validateIdeaDraft({ title: "a".repeat(IDEA_TITLE_MAX_LENGTH + 1), details: "" }).title);
  assert.ok(validateIdeaDraft({ title: "Ok", details: "x".repeat(2001) }).details);
  assert.deepEqual(validateIdeaDraft({ title: "Água no carro", details: "" }), {});
});

test("buildIdeaRecord usa o mesmo payload da Tela Planner com status Nova", () => {
  assert.deepEqual(buildIdeaRecord({ title: "  Facilitar trocas  ", details: " Detalhe " }), {
    cr40f_name: "Facilitar trocas",
    cr40f_detalhes: "Detalhe",
    cr40f_status: IDEA_STATUS.nova
  });
});

test("normalizeIdeaRecord converte registro Dataverse e assume Nova sem status", () => {
  assert.deepEqual(
    normalizeIdeaRecord({ cr40f_boasideiasid: "abc", cr40f_name: "Título", cr40f_detalhes: null, createdon: "2026-10-01T12:00:00Z" }),
    { id: "abc", title: "Título", details: "", status: IDEA_STATUS.nova, createdAt: "2026-10-01T12:00:00Z", attachments: [] }
  );
  assert.equal(normalizeIdeaRecord({ cr40f_status: IDEA_STATUS.aprovada }).status, IDEA_STATUS.aprovada);
});

test("getIdeaStatusOption expõe rótulo textual dos quatro status reais", () => {
  assert.equal(getIdeaStatusOption(IDEA_STATUS.emAvaliacao)?.label, "Em avaliação");
  assert.equal(getIdeaStatusOption(IDEA_STATUS.implementada)?.label, "Implementada");
  assert.equal(getIdeaStatusOption(42), null);
});

test("classifyIdeaFile separa foto, vídeo e recusa o resto", () => {
  assert.equal(classifyIdeaFile({ type: "image/jpeg" }), "foto");
  assert.equal(classifyIdeaFile({ type: "video/mp4" }), "video");
  assert.equal(classifyIdeaFile({ type: "", name: "IMG_1.HEIC" }), "foto");
  assert.equal(classifyIdeaFile({ type: "application/pdf", name: "a.pdf" }), null);
});

test("validateIdeaMedia aplica limite de 5, tipo e duração do vídeo", () => {
  const foto = { type: "image/jpeg", name: "a.jpg", size: 1000 };
  assert.equal(validateIdeaMedia(0, foto, null), "");
  assert.equal(validateIdeaMedia(IDEA_ATTACHMENT_MAX - 1, foto, null), "");
  assert.match(validateIdeaMedia(IDEA_ATTACHMENT_MAX, foto, null), /até 5 arquivos/);
  assert.match(validateIdeaMedia(0, { type: "application/pdf", name: "a.pdf", size: 10 }, null), /só fotos e vídeos/);
  const video = { type: "video/mp4", name: "v.mp4", size: 1000 };
  assert.equal(validateIdeaMedia(0, video, 119), "");
  assert.match(validateIdeaMedia(0, video, 121), /muito longo/);
  assert.match(validateIdeaMedia(0, video, null), /duração/);
});

test("summarizeAttachments resume fotos e vídeos no singular e no plural", () => {
  assert.equal(summarizeAttachments([]), "");
  assert.equal(summarizeAttachments([{ kind: "foto" }]), "1 foto");
  assert.equal(summarizeAttachments([{ kind: "foto" }, { kind: "foto" }, { kind: "video" }]), "2 fotos · 1 vídeo");
  assert.equal(summarizeAttachments([{ kind: "video" }, { kind: "video" }]), "2 vídeos");
});

test("buildIdeaAttachmentRecord monta a linha de cr40f_boasideiaanexos e a leitura volta igual", () => {
  const record = buildIdeaAttachmentRecord({ ideaTitle: " Água gelada ", kind: "video", order: 2, fileName: "ideia-video-2.mp4", link: "https://x/y", sizeBytes: 2048.4 });
  assert.deepEqual(record, {
    cr40f_name: "Vídeo 2 - Água gelada",
    cr40f_link: "https://x/y",
    cr40f_nomearquivo: "ideia-video-2.mp4",
    cr40f_tipomidia: IDEA_MEDIA_TYPE.video,
    cr40f_ordem: 2,
    cr40f_tamanhobytes: 2048
  });
  assert.equal(buildIdeaAttachmentRecord({ ideaTitle: "x".repeat(300), kind: "foto", order: 1, fileName: "a", link: "l", sizeBytes: 1 }).cr40f_name.length, 100);
  const back = normalizeIdeaAttachmentRecord({ cr40f_boasideiaanexoid: "id1", ...record });
  assert.equal(back.kind, "video");
  assert.equal(back.order, 2);
  assert.equal(back.link, "https://x/y");
});

test("isMissingEntityError reconhece tabela inexistente e ignora outros erros", () => {
  assert.equal(isMissingEntityError(new Error("Could not find an entity with name cr40f_boasideiaanexo")), true);
  assert.equal(isMissingEntityError(new Error("Resource not found for the segment 'cr40f_boasideiaanexos'.")), true);
  assert.equal(isMissingEntityError(new Error("Falha de rede")), false);
});

test("safeAttachmentLink aceita só http(s) e ideaFileMimeType cai na extensão quando o tipo vem vazio", () => {
  assert.equal(safeAttachmentLink("https://x.sharepoint.com/a.jpg"), "https://x.sharepoint.com/a.jpg");
  assert.equal(safeAttachmentLink("javascript:alert(1)"), "");
  assert.equal(safeAttachmentLink(null), "");
  assert.equal(normalizeIdeaAttachmentRecord({ cr40f_link: "data:text/html,x" }).link, "");
  assert.equal(ideaFileMimeType({ type: "", name: "IMG_1.HEIC" }, "foto"), "image/heic");
  assert.equal(ideaFileMimeType({ type: "", name: "v.mov" }, "video"), "video/quicktime");
  assert.equal(ideaFileMimeType({ type: "image/png", name: "a.bin" }, "foto"), "image/png");
});
