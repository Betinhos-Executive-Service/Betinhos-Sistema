// Numero do build: patch + 1 sobre a maior entre a versao do repositorio e a publicada no ambiente.
// O workflow Deploy nao commita o package.json; sem partir da publicada, a versao retrocederia.
function partes(version) {
  const lista = String(version).split(".").map((parte) => Number(parte));
  if (lista.length !== 3 || lista.some((parte) => !Number.isInteger(parte) || parte < 0)) {
    throw new Error(`Versao invalida: ${version}`);
  }
  return lista;
}

function maiorVersao(a, b) {
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] > y[i] ? String(a) : String(b);
  }
  return String(a);
}

function proximaVersao(versaoDoRepo, versaoPublicada) {
  const base = versaoPublicada ? maiorVersao(versaoDoRepo, versaoPublicada) : String(versaoDoRepo);
  const [major, minor, patch] = partes(base);
  return `${major}.${minor}.${patch + 1}`;
}

module.exports = { maiorVersao, proximaVersao };
