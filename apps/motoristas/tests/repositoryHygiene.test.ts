import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

// Higiene do repositório, única fonte das regras (scripts/check-repository-hygiene.ps1 só chama este teste).
// URL com parâmetro de credencial (SAS de Flow/Blob, code, token), também com `&` escapado em XML (`&amp;`) e JSON (`\u0026`).
// O nome pode ter prefixo (`access_token`, `api_key`, `client_secret`); o valor aceita base64 cru (`+/=`).
// Só valores longos contam; fixtures como `?sig=abc` não.
const CREDENTIAL_URL_PATTERN = /https:\/\/[^\s"'<>]+(?:[?&]|&amp;|\\u0026)[A-Za-z0-9_-]*(sig|code|token|secret|key)=[A-Za-z0-9%_.~+\/=-]{20,}/i;
// Assinatura SAS solta (campo `sig=` fora da URL, como em exports de dataflow): só o valor longo já condena.
const SAS_SIGNATURE_PATTERN = /(?:^|[?&;]|&amp;|\\u0026)sig=[A-Za-z0-9%_.~+\/=-]{20,}/i;
const CREDENTIAL_GREP = `(?:${CREDENTIAL_URL_PATTERN.source})|(?:${SAS_SIGNATURE_PATTERN.source})`;
// Artefatos locais que nunca entram no git: exports, saída de build .NET, ZIPs e estado de ferramentas (here.now guarda token).
const FORBIDDEN_PATH_PATTERN = /(^|\/)(tmp|\.tmp|\.dev-backups|bin|obj|\.herenow)\/|(^|\/)graphify-out\/cache\/|\.zip$/;

const ROOT = new URL("..", import.meta.url);

function gitLines(args: string[]) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch (error) {
    // `git grep` sai com 1 quando nada casa.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

test("padrão reconhece SAS de Flow e ignora fixture curta", () => {
  assert.match("https://prod-00.brazilsouth.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", CREDENTIAL_URL_PATTERN);
  assert.match("https://x.blob.core.windows.net/a.png?sv=2023&amp;sig=AbCdEfGhIjKlMnOpQrStUvWxYz0123", CREDENTIAL_URL_PATTERN);
  assert.match('{"claimUrl":"https://here.now/claim?slug=x\\u0026token=AbCdEfGhIjKlMnOpQrStUvWxYz0123"}', CREDENTIAL_URL_PATTERN);
  assert.match("https://graph.microsoft.com/v1.0/me?access_token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.abc", CREDENTIAL_URL_PATTERN);
  assert.match("https://fn.azurewebsites.net/api/x?code=aB3dE5fG7h/jK1lM2+nO4pQ6rS8tU0vW==", CREDENTIAL_URL_PATTERN);
  assert.doesNotMatch("https://example.com/invoke?sig=secret", CREDENTIAL_URL_PATTERN);
  assert.match('"Token":"sv=2023-01-03&amp;se=2026-01-16T01%3A54%3A56Z&amp;sig=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"', SAS_SIGNATURE_PATTERN);
  assert.doesNotMatch("sig=REDACTED", SAS_SIGNATURE_PATTERN);
  assert.doesNotMatch("https://www.google.com/maps/search/?api=1&query=Rua+Augusta+1000+Sao+Paulo", CREDENTIAL_URL_PATTERN);
});

test("nenhum arquivo versionado contém URL com credencial (sig, code, token, secret, key)", () => {
  // -I pula binários; -P aceita a mesma sintaxe do regex acima.
  assert.deepEqual(gitLines(["grep", "-I", "-l", "-i", "-P", CREDENTIAL_GREP, "--", "."]), []);
});

test("nenhum artefato local versionado (tmp, bin, obj, zip, estado de ferramentas)", () => {
  assert.deepEqual(gitLines(["ls-files"]).filter((file) => FORBIDDEN_PATH_PATTERN.test(file)), []);
});
