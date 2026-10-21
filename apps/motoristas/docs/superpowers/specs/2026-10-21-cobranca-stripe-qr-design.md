# Cobrança por QR code (Stripe Checkout)

Status em 21/10/2026: o app está implementado e testado em modo mock; o plugin `QrChargePlugin` (Custom API `new_CobrancaQR`) e o provisionamento estão prontos e testados localmente, mas ainda não foram publicados no DEV (ver "Ordem de implantação"). O schema já existe no DEV. A conta Stripe está em ativação, então por enquanto tudo roda em modo teste.

## Objetivo

Quando a maquininha não funcionar, ou quando o passageiro estrangeiro não conseguir pagar nela, o motorista gera pelo App Motoristas um QR code de pagamento.
- O passageiro lê o QR no próprio celular e paga com Apple Pay, Google Pay ou cartão, inclusive internacional.
- O motorista vê **no celular dele, em tempo real**, se o pagamento foi confirmado.
- Antes do QR, o motorista informa **quem vai pagar**, o **e-mail para o recibo** e o **idioma do passageiro**; o QR aparece com uma explicação para o passageiro nesse idioma.
- A cobrança paga substitui a foto do comprovante.

O motorista não tem acesso à conta Stripe e não depende de NFC.

## Decisões de negócio (21/10/2026)

1. **Quem cobra:** só os motoristas marcados no campo novo "Pode cobrar por QR code" em `cr40f_funcionarios`.
2. **Valor:** vem preenchido com o valor a receber. O motorista pode diminuir, mas não aumentar; extras e gorjeta não entram.
3. **Moeda:** **sempre em reais**, e o motorista não escolhe moeda. Um cartão estrangeiro paga em BRL e o banco do passageiro faz a conversão. O teste de 21/10 mostrou que a conta também cobraria em USD, mas essa opção foi descartada.
4. **Recibo por e-mail:** o Stripe envia. Ligar em Settings → Customer emails → "Successful payments". No modo teste o e-mail não sai sozinho; dá para reenviar pelo painel.
5. **Reembolso:** só o financeiro, pelo painel do Stripe.
6. **Conta:** em ativação. Implementar e testar em modo teste; o modo live entra quando a ativação terminar.

## Por que Stripe Checkout

- **Menos dados para o cliente:** comparado com o PayPal, que pede e-mail, telefone e CEP, o Stripe exige muito menos. Com Apple Pay ou Google Pay é um toque; com cartão digitado, só número, validade, CVC e e-mail.
- **Recomendação do Stripe:** para pagamento avulso com o cliente presente, o Stripe recomenda a Checkout Sessions API com página hospedada por ele. Os dados do cartão nunca passam pela Betinhos, o que dispensa escopo PCI.
- **Descartados:**
  - Payment Links: o link é reutilizável e não carrega a reserva.
  - Invoicing: gera fatura e e-mails a mais.
  - Tap to Pay: exige NFC no celular do motorista e acesso à conta.

## Arquitetura

```
App (celular do motorista)            Dataverse (plugin; chave na config. segura)       Stripe
  Recebimento → "Cobrar por QR code"
  QrChargeScreen ──{acao:criar}──────▶ Custom API new_CobrancaQR ──▶ POST /v1/checkout/sessions
  desenha o QR (local) ◀── contrato ──┘   (QrChargePlugin)
  a cada 3 s ──{acao:consultar}──────▶ new_CobrancaQR ──▶ GET  /v1/checkout/sessions/{id}
  cancelar   ──{acao:cancelar}───────▶ new_CobrancaQR ──▶ POST /v1/checkout/sessions/{id}/expire
  Webhook Stripe ─▶ Flow Webhook Stripe | Cobrança QR ──{acao:sincronizar}──▶ new_CobrancaQR ──▶ GET de novo
```

- **Por que plugin e não Flow:** motoristas conseguem ler variáveis de ambiente e definições de Flow, então a chave do Stripe não pode ficar lá. Ela fica na **configuração segura do step** do plugin, que só administrador lê (mesmo padrão do token da Infleet).
- **Quem é o motorista:** o plugin usa o funcionário do usuário que chama (e-mail Microsoft → `cr40f_funcionarios`); o app não manda `motoristaId`.
- **Gravação:** o plugin grava `cr40f_cobrancastripe` com o serviço do sistema; o motorista não precisa de privilégio na tabela. O dono é conferido pelo lookup `cr40f_motorista`.
- **Código:** `plugins/DriverRecordSharing/QrChargePlugin.cs` (plugin e regras com Dataverse), `QrChargeRules.cs` (saldo, status, formulário e JSON do Stripe) e `StripeCheckoutGateway.cs` (HTTP, `Stripe-Version: 2024-06-20`). Testes em `plugins/DriverRecordSharing.Tests/QrChargePluginTests.cs`.

## App (implementado)

- **Biblioteca `src/lib/qrCharge.ts`:** permissão, valor a receber em centavos, limite do valor, contagem regressiva e validação da resposta do plugin. A biblioteca só aceita link `https://checkout.stripe.com/` para virar QR. Os testes ficam em `tests/qrCharge.test.ts`.
- **`src/lib/dataverse.ts`:**
  - `createQrChargeRemote` e `updateQrChargeRemote` chamam a Custom API `new_CobrancaQR` pela Web API (`new_Command` → `new_Result`).
  - Modo mock em localhost: a cobrança vira paga 5 s depois. Com `?mockRecusa=1`, o mock simula um cartão recusado antes.
  - O cadastro do motorista passa a ler `cr40f_podecobrarqrcode`. Se a coluna ainda não existir no ambiente, o login continua funcionando e a cobrança fica desligada.
- **`ReceiveScreen`:**
  - Botão "Cobrar por QR code" só para motorista liberado e serviço com valor a receber.
  - Depois do pagamento, mostra "Pago por QR code".
  - Pago no valor total, o comprovante vira opcional e o FINALIZAR segue sem foto. Pago em parte, a foto do restante continua obrigatória.
- **`QrChargeScreen`:**
  - O valor vem preenchido; um valor acima do limite é bloqueado com mensagem.
  - O QR é desenhado no app (`qrcode-generator`), sem mandar o link a nenhum serviço externo.
  - Mostra a contagem de 30 min e tem o botão "Cancelar cobrança"; expirado ou cancelado, oferece "Gerar outro QR code".
- **Confirmação em tempo real:**
  - Enquanto o pagamento não entra, uma faixa amarela diz "Aguardando pagamento."
  - Cartão recusado mostra o motivo e avisa que o mesmo QR continua valendo.
  - Quando o Stripe confirma, a tela vira o painel verde "Pagamento confirmado" e o celular vibra.
  - A confirmação só vem do plugin lendo `payment_status=paid` no Stripe; nada do lado do passageiro marca como pago.
- **Navegação:** a rota é `#cobranca-qr`. Se a página recarregar, volta ao Recebimento, porque a sessão do QR fica só na memória.

## Contrato da Custom API `new_CobrancaQR`

Entrada `new_Command` (texto JSON com `acao`), saída `new_Result` (texto JSON).

**Resposta comum** (validada por `parseQrChargeResponse`):

```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "status": "aguardando | pago | expirado | cancelado",
  "valorCentavos": 38000,
  "expiraEm": "2026-10-21T15:30:00Z",
  "recusa": ""
}
```

- **Valores:** em centavos inteiros e sempre em BRL.
- **`recusa`:** é o `payment_intent.last_payment_error.message` da última tentativa; vazio se nenhuma falhou.
- **Erro de negócio** (sem permissão, valor acima do saldo, reserva de outro motorista, Stripe fora do ar): volta `{ "erro": "mensagem" }`, não exceção. O app mostra o texto como veio, então é escrito para o motorista ler. Falha do Stripe nunca leva a chave nem o corpo da resposta; o rastreamento do plugin guarda só status e código.

**`criar`** — `{ acao: "criar", reservaId, valorCentavos, pagante: { nome, email }, idioma }`. `idioma` é `pt-BR`, `en-US` ou `es-ES`; `email` pode vir vazio.
1. **Motorista:** o funcionário do usuário que chama. Precisa ter `cr40f_podecobrarqrcode` = Sim; se não: "Você não está liberado para cobrar por QR code.".
2. **Reserva:** `_cr40f_motorista_value` precisa ser esse funcionário; se não: "Este serviço não está com você.".
3. **Sessão já aberta:** cobrança `aguardando`, não vencida, do mesmo motorista e com o mesmo valor é consultada no Stripe e devolvida (se já estiver paga, também). Dois toques não criam duas cobranças.
4. **Um QR aberto por reserva:** as outras cobranças `aguardando` não vencidas da reserva são expiradas no Stripe e viram `cancelado`; se ao expirar o Stripe disser que já foi paga, grava `pago`. Sem isso, um QR de R$ 500 aberto mais um novo de R$ 300 somariam R$ 800 pagáveis.
   - **Saldo:** `cr40f_valor_a_receber` menos as cobranças `pago` e as em processamento (pagamento assíncrono). Valor `<= 0`, abaixo de R$ 0,50 (mínimo do Stripe em BRL) ou acima do saldo é recusado.
5. **Criar a sessão:** `POST https://api.stripe.com/v1/checkout/sessions`, form-urlencoded, `Authorization: Bearer <chave>` e `Idempotency-Key: reserva-<id>-<n>-<valor>-<expira>` (n = tentativa da reserva).
   - `mode=payment`; `expires_at` = minuto atual + 32 min (30 min do mínimo do Stripe + folga de relógio e latência; arredondar ao minuto deixa o toque duplo idêntico para a idempotência); `locale`: `pt-BR` → `pt-BR`, `en-US` → `en`, `es-ES` → `es`.
   - `line_items[0][price_data][currency]=brl`, `[unit_amount]=<valorCentavos>`, `[product_data][name]=Serviço <cr40f_id>` e `line_items[0][quantity]=1`.
   - `client_reference_id=<reservaId>`, `metadata[reserva_id]`, `metadata[motorista_id]` e `metadata[pagante_nome]`.
   - `success_url`: padrão `https://betinhos.com.br`; muda com `successUrl` na configuração (segura ou não segura) do step.
   - `customer_email=<pagante.email>` só quando vier preenchido.
   - **Não** envia `payment_method_types`: o Stripe recusa esse parâmetro. Os meios vêm do painel: Cards, Apple Pay e Google Pay ligados; Pix e Boleto desligados.
6. **Registrar:** cria a linha em `cr40f_cobrancastripe` com status `aguardando` e responde no contrato. Se a linha da mesma sessão já existir (toque duplo concorrente devolve a mesma sessão pela idempotência), devolve a existente sem gravar outra; consultas toleram linha duplicada e usam a mais antiga.

**`consultar`** — `{ acao: "consultar", sessionId }`. Só o motorista dono da cobrança. O app chama a cada 3 s; a meta é menos de 2 s.
- `GET /v1/checkout/sessions/{id}?expand[]=payment_intent.latest_charge.balance_transaction`.
- `payment_status=paid` ou `no_payment_required` → `pago`; `status=expired` → `expirado`; qualquer outro → `aguardando`.
- **Pagamento assíncrono** (`status=complete` com `payment_status=unpaid`): continua `aguardando` no registro, mas a sessão já não tem link; o motorista recebe o aviso "O pagamento está em processamento no banco do passageiro. Aguarde a confirmação." (como `erro`, porque o app só aceita `aguardando` com link do Stripe). `cancelado` local continua `cancelado`, salvo se o Stripe disser que pagou; `pago` nunca volta atrás.
- Ao virar `pago`, grava tarifa, valor líquido, país do cartão, bandeira, carteira digital, PaymentIntent e data do pagamento.

**`cancelar`** — `{ acao: "cancelar", sessionId }`. Só o dono. Se a sessão já estiver paga, devolve `pago` (e grava): o dinheiro entrou e o motorista precisa saber. Pagamento em processamento é recusado com aviso e não vira `cancelado`. Senão, `POST /v1/checkout/sessions/{id}/expire` e status `cancelado`.

**`sincronizar`** — `{ acao: "sincronizar", sessionId }`. Para o webhook: qualquer chamador autenticado; mesmo efeito do `consultar`, sem conferir o dono, porque só espelha o estado do Stripe. Responde só `{ "ok": true }`, sem dados da cobrança. Falha técnica do Stripe (rede, 5xx, 429, chave) vira exceção, para o Flow responder 500 e o Stripe reenviar; erro de negócio (sessão de outro ambiente) volta `{ "erro" }` e o Flow responde 200.

**Webhook** — Flow "Flow Webhook Stripe | Cobrança QR" (`scripts/cobranca-qr-webhook-flow.cjs`), eventos `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed`.
- Gatilho HTTP; lê só `data.object.id` e chama `new_CobrancaQR` com `sincronizar` (Dataverse PerformUnboundAction). Responde 200; 500 se a chamada falhar, para o Stripe tentar de novo.
- O Power Automate não valida a assinatura HMAC. Por isso o conteúdo do evento nunca é usado direto, e um webhook forjado não marca pagamento.
- Garante o registro mesmo se o motorista fechar o app antes do pagamento cair.

**Chave da API**
- *Restricted key* com escrita em Checkout Sessions e leitura em PaymentIntents, Charges e Balance transactions.
- Fica na configuração segura do step do `QrChargePlugin` (`{"chave":"rk_test_..."}`). Nunca vai para o webresource, Flow, variável de ambiente nem Git.
- DEV: o provisionador lê `%USERPROFILE%\.betinhos\stripe-dev.env` (`STRIPE_SECRET_KEY=...`, fora do repositório; chave live é recusada). Sem o arquivo, ele avisa e não mexe na configuração segura.
- A configuração segura não viaja na solução: o PROD precisa da chave live gravada no step de lá.

## Dataverse

- **Permissão:** coluna Sim/Não `cr40f_podecobrarqrcode` ("Pode cobrar por QR code") em `cr40f_funcionarios`, com padrão Não. O script é `scripts/add-funcionario-cobranca-qr-permission.console.js`.
- **Histórico:** tabela `cr40f_cobrancastripe`, criada por `scripts/create-cobranca-stripe-table.console.js`. Guarda uma linha por tentativa.
  - Colunas: sessão, status, valor (R$), pagante (nome e e-mail), idioma, PaymentIntent, tarifa, valor líquido, país do cartão, bandeira, carteira, expira em e pago em.
  - Lookups: reserva e motorista.

## Ordem de implantação (DEV)

1. Schema: já criado no DEV (`scripts/create-cobranca-stripe-table.console.js` e `scripts/add-funcionario-cobranca-qr-permission.console.js`).
2. No Stripe (modo teste), confira em Payment methods: Cards, Apple Pay e Google Pay ligados; Pix e Boleto desligados. Crie a Restricted key.
3. Grave a chave em `%USERPROFILE%\.betinhos\stripe-dev.env` com a linha `STRIPE_SECRET_KEY=rk_test_...`.
4. `npm run push` a partir da `main` atualizada: publica o plugin e roda `scripts/provision-cobranca-qr.ps1` (Custom API, step com a chave, Flow do webhook ativo, tudo na AppBetinhos) antes do webresource. O script imprime a URL do webhook.
5. No Stripe: Developers → Webhooks → Add endpoint com essa URL e os eventos `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed`.
6. Marque "Pode cobrar por QR code" num motorista de teste.

## Verificação

| Cenário | Esperado | Situação |
|---|---|---|
| Motorista liberado, serviço com valor a receber | Botão "Cobrar por QR code" no Recebimento | OK no mock |
| Serviço sem valor a receber | Sem botão | OK no mock |
| Valor acima do valor a receber | Bloqueio com "O valor não pode passar de R$ …" | OK no mock e nos testes |
| QR gerado | Faixa "Aguardando pagamento", painel do passageiro no idioma escolhido (título, valor em R$, QR, instrução) e contagem de 30 min | OK no mock |
| Quem vai pagar | Lista com passageiros (idioma pela bandeira) e solicitante + "Outra pessoa"; o cliente (empresa) não entra | OK no mock e nos testes |
| E-mail inválido | "Confira o e-mail." e foco no campo | OK no mock e nos testes |
| Cartão recusado | Motivo na tela e QR continua valendo | OK no mock (`?mockRecusa=1`) |
| Pagamento confirmado | Painel verde "Pagamento confirmado" e vibração | OK no mock (vibração só em aparelho) |
| Pago no total | FINALIZAR segue sem foto | OK no mock |
| Pago em parte | "Envie o comprovante do restante" e foto obrigatória | OK no mock |
| Cancelar cobrança | "Cobrança cancelada" e o QR não aceita mais pagamento | OK no mock |
| Recarregar a página no QR | Volta ao Recebimento | OK no mock |
| Motorista sem permissão chamando a Custom API direto | `erro` do plugin | OK nos testes do plugin; pendente no DEV |
| Cartão de teste `4242 4242 4242 4242` | "Pago" em até ~5 s e tarifa gravada | Pendente (DEV) |
| 3DS `4000 0025 0000 3155` | Pago depois da autenticação | Pendente (DEV) |
| App fechado antes do pagamento | O webhook grava | Pendente (DEV) |
| Apple Pay ou Google Pay em aparelho real | Um toque | Pendente (aparelho) |

## Fora do escopo

- Reembolso pelo app.
- Pix e outras moedas.
- Conciliação contábil automática.
- Segunda cobrança por QR na mesma reserva depois de um pagamento parcial; o restante segue por foto.
