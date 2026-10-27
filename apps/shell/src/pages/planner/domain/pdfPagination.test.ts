import assert from 'node:assert/strict'
import { test } from 'vitest'
import { paginatePdf } from "./pdfPagination";

test("move parágrafo inteiro para a página seguinte sem perder pixels", () => {
  assert.deepEqual(paginatePdf(2400, 1100, [{ top: 1060, bottom: 1160 }]), [
    { top: 0, bottom: 1060 }, { top: 1060, bottom: 2160 }, { top: 2160, bottom: 2400 },
  ]);
});

test("considera linhas sobrepostas em colunas e mantém todas as quebras fora delas", () => {
  const ranges = [{ top: 1090, bottom: 1120 }, { top: 1080, bottom: 1100 }, { top: 2180, bottom: 2210 }];
  const pages = paginatePdf(3500, 1100, ranges);
  for (const page of pages) {
    assert.ok(page.bottom - page.top <= 1100);
    assert.ok(!ranges.some((range) => range.top < page.bottom && range.bottom > page.bottom));
  }
  assert.equal(pages[0].bottom, 1080);
  assert.equal(pages.at(-1)!.bottom, 3500);
});

test("recusa elemento maior que A4 em vez de cortar seu conteúdo", () => {
  assert.throws(() => paginatePdf(2400, 1100, [{ top: 0, bottom: 1500 }]), /excede a altura/);
});

test("margem de segurança no fim da imagem não cria página vazia", () => {
  assert.deepEqual(paginatePdf(1200, 1100, [{ top: 1080, bottom: 1202 }]), [
    { top: 0, bottom: 1080 }, { top: 1080, bottom: 1200 },
  ]);
});
