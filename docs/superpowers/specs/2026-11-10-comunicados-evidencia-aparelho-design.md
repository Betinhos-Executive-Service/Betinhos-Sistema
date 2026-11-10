# Comunicados: evidência do aparelho na abertura e na ciência (Fase 2)

Data: 10/11/2026 · Status: aprovado pelo Renan · Fase 1: `2026-11-10-comunicados-pdf-evidencia-design.md` (DEV v0.0.161)

## Objetivo

Reforçar a prova de ciência. No momento da abertura (que no Informativo vale como leitura) e da assinatura (Ciência), o App Motoristas registra:
- o aparelho;
- a versão do App;
- o IP público, carimbado pelo Worker e conferido pelo plugin;
- a geolocalização.

O PDF da Fase 1 passa a mostrar esses dados.

## Decisões

| Tema | Decisão |
|---|---|
| IP | Rota `POST /carimbo-ip` no Worker `app-motoristas-web-push`. O Worker devolve o IP com data e hora, assinados por HMAC (`IP_STAMP_SECRET`). O plugin confere a assinatura com o segredo na configuração segura do step e recusa carimbo de mais de 5 min. Carimbo inválido não trava: grava `ipVerificado: false`. |
| GPS | Pedido na hora de confirmar. Se o motorista negar, a ação continua e grava `"negada"`. Timeout de 8 s. O PDF mostra coordenadas, precisão e o link do mapa, sem geocodificação. |
| Schema | 2 colunas de texto longo em `new_comunicadodestinatario`: `new_evidenciaaberturajson` e `new_evidenciacienciajson`. |
| Compatibilidade | O parâmetro `new_EvidenciaJson` é **opcional** em `new_AbrirComunicadoMotorista` e `new_RegistrarCienciaComunicado`. A versão antiga do App continua funcionando e o PDF mostra "não registrado". |
| LGPD | Aviso abaixo do botão de confirmar (Ciência e Informativo): "Ao confirmar, registramos data, hora, aparelho, endereço de internet e localização (se você permitir) como comprovante desta ciência." |
| Execução | Código por PR: Sistema (plugin e shell) e `app-motoristas-v2` (Worker, App e provision). Os passos manuais no DEV são feitos pelo Claude com a aprovação do Renan. O PROD vai depois pelo pipeline e pelo roteiro. |

## Contrato

### Worker: `POST /carimbo-ip`

- CORS: só origens `https://*.dynamics.com`. `OPTIONS` responde ao preflight. Sem corpo.
- Resposta `200`: `{ "ip": "<CF-Connecting-IP>", "ts": "<ISO UTC, ex. 2026-11-10T13:40:00.000Z>", "sig": "<base64url HMAC-SHA256(IP_STAMP_SECRET, ip + '|' + ts)>" }`.
- Sem `IP_STAMP_SECRET`: `503`. O App segue sem o IP.

### App → Custom API: `new_EvidenciaJson` (string, opcional, até 4.000 caracteres)

```json
{
  "v": 1,
  "appVersion": "2.1.860",
  "userAgent": "<navigator.userAgent>",
  "platform": "<userAgentData.platform ou ''>",
  "model": "<userAgentData high-entropy model ou ''>",
  "ipStamp": { "ip": "…", "ts": "…", "sig": "…" },
  "geo": { "status": "ok", "lat": -23.18, "lon": -45.88, "accuracy": 30, "ts": "<ISO>" }
}
```

- `ipStamp` pode ser `null` quando o Worker falha ou estoura o tempo (3 s).
- `geo.status` vale `ok`, `negada`, `indisponivel` ou `tempo-esgotado`. Só `ok` traz coordenadas.
- O carimbo do IP e o GPS são pedidos em paralelo. A ação espera no máximo 8 s.

### Plugin (`ComunicadoCommandPlugin`)

- Ganha o construtor `(string unsecureConfig, string secureConfig)`. `secureConfig` é o `IP_STAMP_SECRET` (texto puro). Vazio = nenhum IP é verificado.
- **Abrir:** grava `new_evidenciaaberturajson` só quando a coluna está vazia e a abertura (ou a leitura do Informativo) acontece nesta chamada.
- **Registrar ciência:** grava `new_evidenciacienciajson` junto com `new_cienteem`.
- Gravação: guarda o JSON do cliente normalizado. Só ficam os campos do contrato, com texto truncado (userAgent ≤ 400, outros ≤ 100) e números checados (lat entre -90 e 90, lon entre -180 e 180, accuracy ≥ 0). O plugin acrescenta:
  - `ipVerificado`: HMAC confere, com comparação em tempo constante, e `|servidor - ts| ≤ 5 min`;
  - `servidorEm`: UTC.
- JSON inválido ou acima de 4.000 caracteres não trava a ação: grava `{ "v": 1, "erro": "formato", "servidorEm": … }`.

### Shell (PDF)

- `DESTINATARIO_SELECT` ganha as 2 colunas. `Destinatario` ganha `evidenciaAbertura` e `evidenciaCiencia` (já interpretadas, `null` se vazias).
- O comprovante ganha a seção "Aparelho e local", com um bloco "Abertura" e outro "Ciência" (no Informativo, só o primeiro, como "Leitura"). Cada bloco traz:
  - aparelho (plataforma, modelo e userAgent resumido) e versão do App;
  - IP com "(verificado)" ou "(não verificado)";
  - localização: `lat, lon (±N m)` e o link `https://www.google.com/maps?q=lat,lon`, ou "não autorizada", "indisponível" ou "tempo esgotado".
- Sem coluna: "Não registrado (registro anterior à captura do aparelho)".
- A nota fixa do item 8 da Fase 1 passa a dizer: "IP carimbado pelo servidor da Betinhos; aparelho e localização informados pelo aparelho do motorista."

## Ordem de implantação no DEV (dependências)

1. Schema: as 2 colunas e o parâmetro opcional nas 2 Custom APIs (`scripts/provision-comunicados.ps1` do App).
2. Worker: `wrangler deploy` e `wrangler secret put IP_STAMP_SECRET`.
3. Plugin: merge do PR do Sistema → Deploy, mais a configuração segura nos 2 steps (Abrir e Registrar ciência) com o mesmo segredo.
4. App: merge do PR do App → Deploy do App.
5. Shell: vai junto no Deploy do passo 3.

O plugin novo sem as colunas falha ao gravar, por isso o passo 1 vem antes do 3. O App novo sem o parâmetro na API recebe erro de parâmetro desconhecido, por isso o passo 1 vem antes do 4.

## Verificação

- Plugin: testes xUnit para HMAC válido e inválido, carimbo vencido, JSON inválido e grande, sem evidência (compatibilidade), Abrir só na primeira vez e Ciência.
- Worker: teste da assinatura e do CORS.
- App: teste do montador da evidência (GPS negado, tempo esgotado e Worker fora) e do envio do parâmetro.
- Shell: teste do domínio e do PDF com e sem evidência.
- DEV: assinar com o App real (aceitando e negando o GPS), conferir as colunas no Dataverse e gerar o PDF.
- PROD: os passos 1 a 4 ficam documentados no PR. O segredo de PROD é diferente do de DEV.
