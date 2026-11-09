const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function extractRule(selector, source = css) {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `Regra nao encontrada: ${selector}`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(braceStart + 1, index);
  }
  throw new Error(`Regra incompleta: ${selector}`);
}

function extractMedia(query) {
  let start = css.indexOf(query);
  assert.ok(start >= 0, `Media query nao encontrada: ${query}`);
  while (start >= 0) {
    const braceStart = css.indexOf("{", start);
    let depth = 0;
    for (let index = braceStart; index < css.length; index += 1) {
      const char = css[index];
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        const mediaBody = css.slice(braceStart + 1, index);
        if (mediaBody.includes(".passenger-edit-fields")) return mediaBody;
        break;
      }
    }
    start = css.indexOf(query, start + query.length);
  }
  throw new Error(`Media query sem passenger-edit-fields: ${query}`);
}

const baseFields = extractRule(".passenger-edit-fields");
assert.match(
  baseFields,
  /grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  "campos de editar pax devem ocupar 100% do popup no layout base"
);
assert.doesNotMatch(
  baseFields,
  /repeat\(\s*2\s*,/,
  "editar pax nao deve usar duas colunas"
);

const mobileCss = extractMedia("@media (max-width: 760px)");
const mobileDialog = extractRule(".passenger-edit-dialog", mobileCss);
assert.match(
  mobileDialog,
  /grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\);/,
  "popup mobile deve reservar uma linha flexivel para os campos"
);
assert.match(
  mobileDialog,
  /overflow:\s*hidden;/,
  "popup mobile deve conter o scroll dentro da lista de campos"
);

const mobileFields = extractRule(".passenger-edit-fields", mobileCss);
assert.match(
  mobileFields,
  /grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  "campos de editar pax devem continuar em 100% no mobile"
);
assert.match(
  mobileFields,
  /height:\s*100%;/,
  "lista de campos deve ocupar a linha rolavel do popup no mobile"
);
assert.match(
  mobileFields,
  /overflow-x:\s*hidden;/,
  "lista de campos nao deve gerar quebra horizontal no mobile"
);

const mobileField = extractRule(".passenger-edit-field", mobileCss);
assert.match(
  mobileField,
  /border:\s*0;/,
  "campo mobile de editar pax nao deve criar moldura externa duplicada"
);
assert.match(
  mobileField,
  /background:\s*transparent;/,
  "campo mobile de editar pax nao deve parecer card dentro do popup"
);
assert.match(
  mobileField,
  /box-shadow:\s*none;/,
  "campo mobile de editar pax nao deve ter sombra de card"
);
assert.match(
  mobileField,
  /min-height:\s*auto;/,
  "campo mobile de editar pax deve ter altura natural"
);

console.log("passenger_edit_layout: ok");
