// Gera o par VAPID do Web Push. A chave pública vai para WEB_PUSH_PUBLIC_KEY (src/lib/webPush.ts) e para o Worker;
// a privada (JWK) vai só para o segredo VAPID_PRIVATE_JWK do Worker e nunca para o repositório.
// Uso: node scripts/generate-vapid-keys.mjs <arquivo-da-chave-privada>   (grava com permissão 600 e imprime só a pública)
import { chmodSync, existsSync, writeFileSync } from "node:fs";

const target = process.argv[2];
if (!target) { console.error("Informe o arquivo onde gravar a chave privada, fora do repositório."); process.exit(1); }
if (existsSync(target)) { console.error(`${target} já existe; não vou sobrescrever.`); process.exit(1); }

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
const publicB64 = Buffer.from(raw).toString("base64url");
writeFileSync(target, JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)), { mode: 0o600 });
chmodSync(target, 0o600);
console.log(`Chave pública (WEB_PUSH_PUBLIC_KEY e VAPID_PUBLIC_KEY):\n${publicB64}\nChave privada gravada em ${target}`);
