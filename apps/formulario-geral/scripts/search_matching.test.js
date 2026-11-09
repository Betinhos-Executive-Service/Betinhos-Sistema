const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

function extractFunction(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Funcao nao encontrada: ${name}`);
  const start = match.index;
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Funcao incompleta: ${name}`);
}

const body = `
${extractFunction(app, "normalize")}
${extractFunction(app, "escapeODataString")}
${extractFunction(app, "searchTokens")}
${extractFunction(app, "searchableTextMatches")}
${extractFunction(app, "buildPassengerServerSearchFilter")}
return { searchableTextMatches, buildPassengerServerSearchFilter };`;

const { searchableTextMatches, buildPassengerServerSearchFilter } = Function(body)();

assert.ok(
  searchableTextMatches("Renan Rodrigues Santos", "renan santos"),
  "busca por primeiro e ultimo nome deve encontrar nome completo com nomes no meio"
);
assert.ok(
  searchableTextMatches("São Paulo Guarulhos Aeroporto", "guarulhos sao"),
  "busca deve ignorar acento e ordem dos termos"
);
assert.ok(
  searchableTextMatches("Betinhos Executive Service Renan Rodrigues Santos financeiro", "ren fin"),
  "busca deve aceitar prefixo parcial em campos diferentes"
);
assert.equal(
  searchableTextMatches("Renan Rodrigues Santos", "renan almeida"),
  false,
  "busca com termo inexistente nao deve casar"
);

const filter = buildPassengerServerSearchFilter("Renan Santos", ["nome", "email", "telefone", "cr"]);
assert.match(filter, /contains\(nome,'renan'\)/, "filtro server deve procurar primeiro token");
assert.match(filter, /contains\(nome,'santos'\)/, "filtro server deve procurar ultimo token");
assert.match(filter, /\) and \(/, "filtro server deve exigir todos os tokens");

console.log("search_matching: ok");
