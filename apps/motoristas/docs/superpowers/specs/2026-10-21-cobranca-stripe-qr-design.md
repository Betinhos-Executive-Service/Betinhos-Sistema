# Cobrança por QR code (Stripe Checkout)

Status em 21/10/2026: a parte do app está implementada e testada em modo mock. Os Flows, o schema e o webhook ainda precisam ser criados no Dataverse DEV (ver "Ordem de implantação"). A conta Stripe está em ativação, então por enquanto tudo roda em modo teste.

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
App (celular do motorista)              Power Automate                       Stripe
  Recebimento → "Cobrar por QR code"
  QrChargeScreen ──{reservaId,motoristaId,valorCentavos}──▶ Flow Cobrança QR ──▶ POST /v1/checkout/sessions
  desenha o QR (local) ◀──────── contrato de cobrança ──────┘
  a cada 3 s ──{sessionId, acao}──▶ Flow Status Cobrança QR ──▶ GET  /v1/checkout/sessions/{id}
                                                            └──▶ POST /v1/checkout/sessions/{id}/expire (cancelar)
                                    Webhook (completed/expired) ─▶ busca a sessão de novo e grava no Dataverse
```

## App (implementado)

- **Biblioteca `src/lib/qrCharge.ts`:** permissão, valor a receber em centavos, limite do valor, contagem regressiva e validação da resposta do Flow. A biblioteca só aceita link `https://checkout.stripe.com/` para virar QR. Os testes ficam em `tests/qrCharge.test.ts`.
- **`src/lib/dataverse.ts`:**
  - `createQrChargeRemote` e `updateQrChargeRemote`, com URLs em `new_FlowURLCobrancaQR` e `new_FlowURLCobrancaQRStatus`.
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
  - A confirmação só vem do Flow lendo `payment_status=paid` no Stripe; nada do lado do passageiro marca como pago.
- **Navegação:** a rota é `#cobranca-qr`. Se a página recarregar, volta ao Recebimento, porque a sessão do QR fica só na memória.

## Contrato dos Flows

**Resposta comum aos dois Flows** (HTTP 200), validada por `parseQrChargeResponse`:

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
- **Erro de negócio** (sem permissão, valor acima do saldo, reserva de outro motorista): volta HTTP 200 com `{ "erro": "mensagem" }`. O app mostra o texto como veio, então escreva para o motorista ler.

**1. Flow Cobrança QR (`new_FlowURLCobrancaQR`)** — entrada `{ reservaId, motoristaId, valorCentavos, pagante: { nome, email }, idioma }`. `idioma` é `pt-BR`, `en-US` ou `es-ES`; `email` pode vir vazio.
1. **Permissão:** o funcionário `motoristaId` precisa ter `cr40f_podecobrarqrcode` = Sim. Se não tiver: `{ erro: "Você não está liberado para cobrar por QR code." }`.
2. **Reserva:** `_cr40f_motorista_value` precisa ser igual a `motoristaId`.
3. **Saldo:** `cr40f_valor_a_receber` menos as cobranças `pago` da reserva. Um `valorCentavos` acima do saldo é recusado com `erro`.
4. **Sessão já aberta:** se houver cobrança `aguardando`, não vencida e com o mesmo valor, devolva essa mesma. Assim, dois toques não criam duas cobranças.
5. **Criar a sessão:** `POST https://api.stripe.com/v1/checkout/sessions`, em form-urlencoded, com `Authorization: Bearer <chave restrita>` e `Idempotency-Key: reserva-<id>-<n>`.
   - Parâmetros:
     - `mode=payment`, `expires_at` = agora + 30 min (o mínimo do Stripe) e `locale` pelo idioma: `pt-BR` → `pt-BR`, `en-US` → `en`, `es-ES` → `es`.
     - `line_items[0][price_data][currency]=brl`, `[unit_amount]=<valorCentavos>` e `[product_data][name]=Serviço <nº>`, com `line_items[0][quantity]=1`.
     - `client_reference_id=<reservaId>`, `metadata[reserva_id]`, `metadata[motorista_id]` e `metadata[pagante_nome]`.
     - `success_url` apontando para a página de agradecimento da Betinhos.
     - `customer_email=<pagante.email>` quando vier preenchido: o passageiro não precisa digitar e-mail na página e o recibo do Stripe vai para ele.
   - **Não** envie `payment_method_types`: o Stripe recusa esse parâmetro. Os meios de pagamento vêm do painel: Cards, Apple Pay e Google Pay ligados; Pix e Boleto desligados.
6. **Registrar:** crie a linha em `cr40f_cobrancastripe` com status `aguardando`, nome e e-mail do pagante e idioma, e responda no contrato acima.

**2. Flow Status Cobrança QR (`new_FlowURLCobrancaQRStatus`)** — entrada `{ sessionId, acao: "consultar" | "cancelar" }`. O app chama a cada 3 s enquanto o QR está na tela, então a meta de resposta é menos de 2 s.
- **`cancelar`:** `POST /v1/checkout/sessions/{id}/expire`. Se a sessão já estiver paga, devolva `pago`: o dinheiro entrou e o motorista precisa saber.
- **`consultar`:** `GET /v1/checkout/sessions/{id}?expand[]=payment_intent.latest_charge.balance_transaction`.
  - `payment_status=paid` → `pago`; `status=expired` → `expirado`; qualquer outro → `aguardando`.
  - Ao virar `pago`, grave a tarifa, o valor líquido, o país do cartão, a bandeira, a carteira digital e a data do pagamento.

**3. Webhook** (`checkout.session.completed` e `checkout.session.expired`)
- Leia só o `id` do evento e repita o "consultar".
- O Power Automate não valida a assinatura HMAC de forma nativa. Por isso, o conteúdo do evento nunca é usado direto, e um webhook forjado não marca pagamento.
- O webhook garante o registro mesmo se o motorista fechar o app antes do pagamento cair.

**Chave da API**
- Use uma *Restricted key* com escrita em Checkout Sessions e leitura em PaymentIntents, Charges e Balance transactions.
- Guarde a chave como variável de ambiente do tipo Secret (Key Vault). Ela nunca vai para o webresource nem para o Git.
- Use uma chave de teste para DEV e outra live para PROD.

## Dataverse

- **Permissão:** coluna Sim/Não `cr40f_podecobrarqrcode` ("Pode cobrar por QR code") em `cr40f_funcionarios`, com padrão Não. O script é `scripts/add-funcionario-cobranca-qr-permission.console.js`.
- **Histórico:** tabela `cr40f_cobrancastripe`, criada por `scripts/create-cobranca-stripe-table.console.js`. Guarda uma linha por tentativa.
  - Colunas: sessão, status, valor (R$), pagante (nome e e-mail), idioma, PaymentIntent, tarifa, valor líquido, país do cartão, bandeira, carteira, expira em e pago em.
  - Lookups: reserva e motorista.

## Ordem de implantação (DEV)

1. Rode os dois scripts de schema no console do model-driven app.
2. No Stripe (modo teste), confira em Payment methods: Cards, Apple Pay e Google Pay ligados; Pix e Boleto desligados. Crie a Restricted key.
3. Crie os dois Flows e o webhook, e coloque as URLs em `new_FlowURLCobrancaQR` e `new_FlowURLCobrancaQRStatus`.
4. Marque "Pode cobrar por QR code" num motorista de teste e publique o webresource com `npm run push`, a partir da `main` atualizada.

## Verificação

| Cenário | Esperado | Situação |
|---|---|---|
| Motorista liberado, serviço com valor a receber | Botão "Cobrar por QR code" no Recebimento | OK no mock |
| Serviço sem valor a receber | Sem botão | OK no mock |
| Valor acima do valor a receber | Bloqueio com "O valor não pode passar de R$ …" | OK no mock e nos testes |
| QR gerado | Faixa "Aguardando pagamento", painel do passageiro no idioma escolhido (título, valor em R$, QR, instrução) e contagem de 30 min | OK no mock |
| Quem vai pagar | Lista com passageiros (idioma pela bandeira), solicitante e cliente + "Outra pessoa" | OK no mock e nos testes |
| E-mail inválido | "Confira o e-mail." e foco no campo | OK no mock e nos testes |
| Cartão recusado | Motivo na tela e QR continua valendo | OK no mock (`?mockRecusa=1`) |
| Pagamento confirmado | Painel verde "Pagamento confirmado" e vibração | OK no mock (vibração só em aparelho) |
| Pago no total | FINALIZAR segue sem foto | OK no mock |
| Pago em parte | "Envie o comprovante do restante" e foto obrigatória | OK no mock |
| Cancelar cobrança | "Cobrança cancelada" e o QR não aceita mais pagamento | OK no mock |
| Recarregar a página no QR | Volta ao Recebimento | OK no mock |
| Motorista sem permissão chamando o Flow direto | `erro` do Flow | Pendente (Flow) |
| Cartão de teste `4242 4242 4242 4242` | "Pago" em até ~5 s e tarifa gravada | Pendente (Flow) |
| 3DS `4000 0025 0000 3155` | Pago depois da autenticação | Pendente (Flow) |
| App fechado antes do pagamento | O webhook grava | Pendente (Flow) |
| Apple Pay ou Google Pay em aparelho real | Um toque | Pendente (aparelho) |

## Fora do escopo

- Reembolso pelo app.
- Pix e outras moedas.
- Conciliação contábil automática.
- Segunda cobrança por QR na mesma reserva depois de um pagamento parcial; o restante segue por foto.
