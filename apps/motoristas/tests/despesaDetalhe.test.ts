import assert from "node:assert/strict";
import test from "node:test";
import { corpoConsultaArquivo, mapAnexos, mapDespesaDetalhe, mimeDoArquivo } from "../src/features/despesas/despesaDetalhe.ts";

const FV = "@OData.Community.Display.V1.FormattedValue";

test("detalhe usa os nomes formatados dos lookups e choices", () => {
  const detalhe = mapDespesaDetalhe({
    [`_cr40f_formapagamento_value${FV}`]: "Cartão corporativo",
    [`_cr40f_cidade_value${FV}`]: "Campinas",
    [`_cr40f_veiculo_value${FV}`]: "ABC1D23",
    cr40f_observacao: "  almoço com cliente ",
    [`cr40f_statusfinanceiro${FV}`]: "Pendente",
    createdon: "2026-11-05T13:20:00Z"
  });
  assert.equal(detalhe.formaPagamento, "Cartão corporativo");
  assert.equal(detalhe.cidade, "Campinas");
  assert.equal(detalhe.veiculo, "ABC1D23");
  assert.equal(detalhe.reserva, "");
  assert.equal(detalhe.observacao, "almoço com cliente");
  assert.equal(detalhe.statusFinanceiro, "Pendente");
});

test("anexos: link de compartilhamento primeiro, sem arquivo localizável fica de fora", () => {
  const anexos = mapAnexos([
    { cr40f_anexodespesaoperacionalid: "{AAA}", cr40f_nomearquivo: "nota.jpg", cr40f_sharelink: "https://x-my.sharepoint.com/s", cr40f_urlsharepoint: "https://x.sharepoint.com/p", cr40f_driveitemid: "" },
    { cr40f_anexodespesaoperacionalid: "bbb", cr40f_nome: "vazio", cr40f_sharelink: "javascript:alert(1)" },
    { cr40f_anexodespesaoperacionalid: "ccc", cr40f_driveitemid: "b!123", cr40f_urlsharepoint: "https://x.sharepoint.com/sites/a/Despesas/c.jpg" }
  ]);
  assert.deepEqual(anexos.map((a) => [a.id, a.nome, a.url]), [["aaa", "nota.jpg", "https://x-my.sharepoint.com/s"], ["ccc", "comprovante", "https://x.sharepoint.com/sites/a/Despesas/c.jpg"]]);
});

test("corpo do flow: id com origem sharepoint só fora do OneDrive; sem id, vai o link", () => {
  assert.deepEqual(corpoConsultaArquivo({ id: "1", nome: "c.jpg", driveItemId: "b!1", url: "https://x.sharepoint.com/sites/a/c.jpg" }), { id: "b!1", nomeArquivo: "c.jpg", origem: "sharepoint" });
  assert.deepEqual(corpoConsultaArquivo({ id: "1", nome: "c.jpg", driveItemId: "b!1", url: "https://x-my.sharepoint.com/p/c.jpg" }), { id: "b!1", nomeArquivo: "c.jpg" });
  assert.deepEqual(corpoConsultaArquivo({ id: "1", nome: "c.jpg", driveItemId: "", url: "https://x-my.sharepoint.com/s" }), { link: "https://x-my.sharepoint.com/s", nomeArquivo: "c.jpg" });
});

test("mime: o informado vale, octet-stream cai na extensão", () => {
  assert.equal(mimeDoArquivo("a.pdf", "image/png; charset=x"), "image/png");
  assert.equal(mimeDoArquivo("a.PDF", "application/octet-stream"), "application/pdf");
  assert.equal(mimeDoArquivo("sem-extensao", ""), "application/octet-stream");
});
