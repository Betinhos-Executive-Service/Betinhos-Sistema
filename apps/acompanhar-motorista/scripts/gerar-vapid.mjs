// Gera um par VAPID novo (P-256) para os avisos por web push deste Worker. Não reutilize o par do App Motoristas.
// Uso: node scripts/gerar-vapid.mjs  →  imprime as chaves e os comandos `wrangler secret put` (nada é gravado).
import { toBase64Url } from "../src/webpush.mjs";

const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publica = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)));
const { kty, crv, x, y, d } = await crypto.subtle.exportKey("jwk", par.privateKey);
const privada = JSON.stringify({ kty, crv, x, y, d });

console.log(`VAPID_PUBLIC_KEY=${publica}`);
console.log(`VAPID_PRIVATE_JWK=${privada}`);
console.log(`
Grave no Worker (cada comando pede o valor; cole o da linha acima):
  npx wrangler secret put VAPID_PUBLIC_KEY
  npx wrangler secret put VAPID_PRIVATE_JWK
  npx wrangler secret put VAPID_SUBJECT     (ex.: mailto:ti@seu-dominio)
Guarde a chave privada só no Cloudflare; quem a tiver consegue enviar avisos em nome do link.`);
