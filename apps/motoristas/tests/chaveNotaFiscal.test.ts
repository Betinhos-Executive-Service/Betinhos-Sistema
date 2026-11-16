import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  camposDaNota,
  chaveDoCodigo,
  chaveDoPdf,
  chaveNoTexto,
  cnpjValido,
  conferirChaveDaDespesa,
  despesaTemNota,
  completarCnpj,
  resumoDaNota,
  validarNotasDaDespesa,
  formatarChave,
  formatarCnpj,
  mesDaChaveConfere,
  normalizarChave,
  validarChave
} from "../src/features/despesas/chaveNotaFiscal.ts";

// Só chaves e CNPJs gerados aqui (o repositório é público): nada de nota real.
// DV calculado à parte, com os pesos escritos por extenso, para não testar o módulo com ele mesmo.
const v = (c: string) => c.charCodeAt(0) - 48;
const dv = (texto: string, pesos: number[]) => {
  const soma = [...texto].reduce((total, c, i) => total + v(c) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
};
const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
function gerarCnpj(base12: string) {
  const d1 = dv(base12, PESOS_CNPJ_1);
  return `${base12}${d1}${dv(base12 + d1, PESOS_CNPJ_2)}`;
}
const PESOS_CHAVE = Array.from({ length: 43 }, (_, i) => 2 + ((42 - i) % 8));
function gerarChave({ uf = "33", aamm = "2611", cnpj = gerarCnpj("123456780001"), modelo = "65", meio = "001000004321" + "1" + "12345678" } = {}) {
  const meioFinal = modelo === "59" ? "900012345" + "004321" + "123456" : meio;
  const chave43 = `${uf}${aamm}${cnpj}${modelo}${meioFinal}`;
  assert.equal(chave43.length, 43);
  return `${chave43}${dv(chave43, PESOS_CHAVE)}`;
}
const trocarUm = (chave: string, i: number) => chave.slice(0, i) + String((Number(chave[i]) + 1) % 10) + chave.slice(i + 1);

test("chave gerada de NF-e, NFC-e e CF-e SAT passa e é decomposta", () => {
  const nfe = validarChave(gerarChave({ modelo: "55", uf: "35" }));
  assert.ok(nfe.ok);
  assert.equal(nfe.nota.uf, "SP");
  assert.equal(nfe.nota.modelo, "55");
  assert.equal(nfe.nota.serie, "001");
  assert.equal(nfe.nota.numero, "4321");
  assert.equal(nfe.nota.aamm, "2611");

  const nfce = validarChave(gerarChave({ modelo: "65", uf: "33" }));
  assert.ok(nfce.ok);
  assert.equal(nfce.nota.uf, "RJ");

  const sat = validarChave(gerarChave({ modelo: "59", uf: "35" }));
  assert.ok(sat.ok);
  assert.equal(sat.nota.modelo, "59");
  assert.equal(sat.nota.serie, "900012345");
  assert.equal(sat.nota.numero, "4321");
});

test("CNPJ alfanumérico é aceito, na chave e sozinho", () => {
  const cnpj = gerarCnpj("12ABC34501DE");
  assert.ok(cnpjValido(cnpj));
  const r = validarChave(gerarChave({ cnpj, modelo: "55" }));
  assert.ok(r.ok);
  assert.equal(r.nota.cnpj, cnpj);
  assert.equal(formatarCnpj(cnpj), `12.ABC.345/01DE-${cnpj.slice(12)}`);
  // Numérico continua com o resultado de sempre.
  assert.ok(cnpjValido(gerarCnpj("112223330001")));
  assert.ok(!cnpjValido("11222333000100"));
});

test("aceita a chave com espaços, pontos e minúsculas no CNPJ", () => {
  const chave = gerarChave({ cnpj: gerarCnpj("12ABC34501DE") });
  const impressa = formatarChave(chave).toLowerCase().replace(/ /, ".");
  assert.equal(normalizarChave(impressa), chave);
  assert.ok(validarChave(impressa).ok);
});

test("chave com um número trocado é recusada pelo DV", () => {
  const chave = gerarChave();
  for (const i of [0, 10, 25, 43]) {
    const r = validarChave(trocarUm(chave, i));
    assert.ok(!r.ok);
  }
  const r = validarChave(trocarUm(chave, 30));
  assert.ok(!r.ok && /digitado errado/.test(r.erro));
});

test("recusa tamanho errado, UF inexistente, mês inválido, modelo que não é nota e CNPJ errado", () => {
  assert.match((validarChave("1234") as { erro: string }).erro, /44 números/);
  assert.match((validarChave(gerarChave({ uf: "34" })) as { erro: string }).erro, /estado/);
  assert.match((validarChave(gerarChave({ aamm: "2613" })) as { erro: string }).erro, /mês/);
  assert.match((validarChave(gerarChave({ aamm: "2600" })) as { erro: string }).erro, /mês/);
  assert.match((validarChave(gerarChave({ modelo: "57" })) as { erro: string }).erro, /não é de nota/);
  assert.match((validarChave(gerarChave({ cnpj: "12345678000100" })) as { erro: string }).erro, /CNPJ/);
});

test("mês da chave igual ao da despesa, com o vizinho só no primeiro e no último dia", () => {
  assert.ok(mesDaChaveConfere("2611", "2026-11-15"));
  assert.ok(!mesDaChaveConfere("2610", "2026-11-15"));
  assert.ok(mesDaChaveConfere("2610", "2026-11-01"));
  assert.ok(!mesDaChaveConfere("2612", "2026-11-01"));
  assert.ok(mesDaChaveConfere("2612", "2026-11-30"));
  assert.ok(!mesDaChaveConfere("2610", "2026-11-30"));
  // Virada do ano.
  assert.ok(mesDaChaveConfere("2612", "2027-01-01"));
  assert.ok(mesDaChaveConfere("2701", "2026-12-31"));
  // Fevereiro: o último dia é 28 em 2026.
  assert.ok(mesDaChaveConfere("2603", "2026-02-28"));

  const chave = gerarChave({ aamm: "2610" });
  const r = conferirChaveDaDespesa(chave, "2026-11-16");
  assert.ok(!r.ok && /outubro de 2026/.test(r.erro));
  assert.ok(conferirChaveDaDespesa(chave, "2026-10-20").ok);
});

test("QR da NFC-e versões 2 e 3, QR do SAT, Code 128 do DANFE e QR só com a chave", () => {
  const chave = gerarChave();
  assert.equal(chaveDoCodigo(`https://www.fazenda.rj.gov.br/nfce/consulta?p=${chave}|2|1|1|ABCDEF0123456789`), chave);
  assert.equal(chaveDoCodigo(`http://nfce.fazenda.sp.gov.br/qrcode?p=${chave}%7C3%7C1`), chave);
  assert.equal(chaveDoCodigo(`https://sat.sef.sc.gov.br/nfce/consulta?p=${chave}|2|2|15|112.50|7a8b|1|ABCD&outro=1`), chave);
  const sat = gerarChave({ modelo: "59", uf: "35" });
  assert.equal(chaveDoCodigo(`${sat}|20261116103000|45.90||assinaturaBase64==`), sat);
  assert.equal(chaveDoCodigo(`CFe${sat}`), sat);
  assert.equal(chaveDoCodigo(chave), chave);
  assert.equal(chaveDoCodigo(`https://exemplo/consulta?p=${trocarUm(chave, 30)}|2|1`), null);
  assert.equal(chaveDoCodigo("https://www.betinhos.com.br"), null);
  assert.equal(chaveDoCodigo(""), null);
});

test("acha a chave num texto com grupos de 4 e ignora sequências que não passam", () => {
  const chave = gerarChave({ modelo: "55" });
  assert.equal(chaveNoTexto(`CHAVE DE ACESSO\n${formatarChave(chave)}\nConsulte`), chave);
  assert.equal(chaveNoTexto(`Protocolo 1${trocarUm(chave, 20)} sem chave`), null);
});

async function pdfCom(linhas: string[]) {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const pagina = pdf.addPage([400, 400]);
  linhas.forEach((linha, i) => pagina.drawText(linha, { x: 20, y: 360 - i * 20, size: 9, font: fonte }));
  return pdf.save();
}

test("PDF com a chave em texto comprimido devolve a chave; PDF sem chave devolve null", async () => {
  const chave = gerarChave({ modelo: "55" });
  const comChave = await pdfCom(["DANFE", "CHAVE DE ACESSO", formatarChave(chave)]);
  // pdf-lib comprime o conteúdo (FlateDecode) e escreve o texto em hexadecimal: a chave não aparece nos bytes crus.
  assert.ok(!Buffer.from(comChave).toString("latin1").includes(chave.slice(0, 8)));
  assert.equal(await chaveDoPdf(comChave), chave);
  assert.equal(await chaveDoPdf(await pdfCom(["Recibo de estacionamento", "Valor 20,00"])), null);
});

test("campos do anexo por caminho e obrigatoriedade por despesa", () => {
  const chave = gerarChave();
  assert.deepEqual(camposDaNota({ situacao: "verificada", chave, origem: "qr" }), { cr40f_chaveacesso: chave, cr40f_origemchave: 100000000, cr40f_situacaonota: 100000000 });
  assert.deepEqual(camposDaNota({ situacao: "nao-verificada" }), { cr40f_situacaonota: 100000001 });
  assert.deepEqual(camposDaNota({ situacao: "sem-nota" }), { cr40f_situacaonota: 100000002 });
  assert.deepEqual(camposDaNota(undefined), {});
  assert.ok(!despesaTemNota([undefined, undefined]));
  assert.ok(despesaTemNota([undefined, { situacao: "sem-nota" }]));
});

test("envio exige a nota de um comprovante e recusa chave de outro mês da data do gasto", () => {
  const chave = gerarChave({ aamm: "2611" });
  assert.equal(validarNotasDaDespesa([], "2026-11-16"), "");
  assert.match(validarNotasDaDespesa([undefined], "2026-11-16"), /Informe a nota fiscal/);
  assert.equal(validarNotasDaDespesa([undefined, { situacao: "verificada", chave, origem: "digitada" }], "2026-11-16"), "");
  assert.match(validarNotasDaDespesa([{ situacao: "verificada", chave, origem: "qr" }], "2026-12-10"), /^Comprovante 1: .*novembro de 2026/);
  assert.equal(validarNotasDaDespesa([{ situacao: "nao-verificada" }], "2026-12-10"), "");
  assert.equal(resumoDaNota({ situacao: "verificada", chave, origem: "qr" }), "Chave conferida · NFC-e 4321 · RJ");
  assert.equal(resumoDaNota({ situacao: "sem-nota" }), "Sem nota fiscal");
  assert.equal(completarCnpj("12ABC34501DE"), gerarCnpj("12ABC34501DE"));
});

test("PDF com /Length indireto (objeto 10 ou mais) e escape octal ainda acha a chave", async () => {
  const { deflateSync } = await import("node:zlib");
  const chave = gerarChave({ modelo: "55" });
  const grupos = formatarChave(chave).split(" ");
  // Primeiro grupo escrito com escapes octais de 3 dígitos ("3" vira \063), como alguns geradores fazem.
  const primeiro = [...grupos[0]].map((c) => "\\" + c.charCodeAt(0).toString(8).padStart(3, "0")).join("");
  const conteudo = `BT /F1 9 Tf (CHAVE DE ACESSO) Tj (${primeiro}) Tj (${grupos.slice(1).join(" ")}) Tj ET`;
  const corpo = deflateSync(Buffer.from(conteudo, "latin1"));
  const pdf = Buffer.concat([
    Buffer.from("%PDF-1.4\n15 0 obj\n<< /Length 16 0 R /Filter /FlateDecode >>\nstream\n", "latin1"),
    corpo,
    Buffer.from(`\nendstream\nendobj\n16 0 obj\n${corpo.length}\nendobj\n%%EOF\n`, "latin1")
  ]);
  assert.equal(await chaveDoPdf(new Uint8Array(pdf)), chave);
});
