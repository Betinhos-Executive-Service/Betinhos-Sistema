# Cobrança por QR code (Stripe Checkout) — plano de integração

Status: perguntas de negócio respondidas em 21/10/2026; falta só confirmar USD (ver "Pendências"). Nada implementado. Conta Stripe em ativação: por enquanto tudo roda em modo teste.
Data: 21/10/2026.

## Objetivo

Quando a maquininha não funcionar, ou quando o passageiro estrangeiro não conseguir pagar nela, o motorista gera pelo App Motoristas um QR code de pagamento com o valor da reserva. O passageiro lê o QR no próprio celular e paga com Apple Pay, Google Pay ou cartão internacional. O app confirma sozinho que o pagamento entrou, e esse pagamento substitui a foto do comprovante.

O motorista não tem acesso à conta Stripe, não digita o valor e não depende de NFC.

## Por que Stripe Checkout

- Comparado com o PayPal, o cliente preenche muito menos: com Apple Pay ou Google Pay é um toque, e com cartão digitado são número, validade, CVC e e-mail.
- Segue a orientação do Stripe para pagamento avulso com o cliente presente: usar a Checkout Sessions API com página hospedada pelo Stripe. Os dados do cartão nunca passam pela Betinhos, o que dispensa escopo PCI.
- Payment Links foi descartado porque o link é reutilizável e não carrega a reserva. Cada reserva precisa de uma sessão própria, com valor fixo e prazo de validade.
- Invoicing foi descartado porque gera fatura e e-mails e adiciona etapas para o cliente.

## Arquitetura

```
App (ReceiveScreen)                Servidor (Power Automate)                Stripe
  "Cobrar por QR code"  ──HTTP──▶  Flow "Criar cobrança Stripe"   ──REST──▶  POST /v1/checkout/sessions
  mostra o QR (gerado no app)  ◀──  { sessionId, url, expiraEm }  ◀──
  consulta o status a cada 3 s ──▶ Flow "Status cobrança Stripe"   ──REST──▶  GET /v1/checkout/sessions/{id}
                                    Flow "Webhook Stripe" ◀── checkout.session.completed / expired
                                      └─ busca a sessão de novo na API e grava no Dataverse
```

### Servidor

O servidor segue o padrão já usado no app: Flows HTTP com a URL vinda de variável de ambiente (`FLOW_URLS` em `src/lib/dataverse.ts`, chamados por `runHttpFlow`).

**1. Criar cobrança** (nova variável de ambiente `new_FlowURLCriarCobrancaStripe`)
- A entrada é `{ reservaId, valor, moeda }`.
- O Flow confere no Dataverse se o motorista tem a função liberada no cadastro. Sem permissão, recusa a cobrança.
- O Flow lê o "valor a receber" da reserva e recusa um `valor` maior que ele, já descontando o que foi pago antes por QR. Valor menor é aceito, para quando parte já foi paga de outra forma.
- `moeda` é `brl` ou `usd`; ver "Pendências".
- Se a reserva já tiver uma sessão aberta e não vencida, o Flow devolve essa mesma sessão. Isso evita cobrar duas vezes.
- Chama `POST /v1/checkout/sessions` com:
  - `mode=payment`, `currency` igual à moeda escolhida e um item "Serviço {nº reserva}".
  - `client_reference_id={reservaId}` e `metadata[reserva_id]`.
  - `expires_at` em agora + 30 min, que é o mínimo permitido pelo Stripe.
  - `locale=auto`, para a página abrir no idioma do turista.
  - `customer_email` com o e-mail do passageiro, se existir.
  - `success_url` apontando para uma página simples de "Pagamento recebido" da Betinhos.
  - `payment_method_configuration` com uma configuração **só de cartão, Apple Pay e Google Pay**, sem Pix e sem boleto. O boleto é assíncrono e não serve para quem está dentro do carro.
  - Cabeçalho `Idempotency-Key` igual a `reserva-{id}-{tentativa}`.
- Cria a linha de cobrança no Dataverse com status "Aguardando" e devolve `{ sessionId, url, expiraEm }`.

**2. Status da cobrança** (nova variável `new_FlowURLStatusCobrancaStripe`)
- Recebe o `sessionId`, consulta `GET /v1/checkout/sessions/{id}` e devolve `payment_status` e `status`.
- Atualiza o Dataverse quando o pagamento já tiver entrado.

**3. Webhook do Stripe**
- Escuta `checkout.session.completed` e `checkout.session.expired`.
- O Power Automate não valida a assinatura HMAC do Stripe de forma nativa. Por isso o Flow **ignora o conteúdo recebido**: lê apenas o `id`, busca a sessão de novo na API do Stripe e só então grava. Um webhook forjado não consegue marcar um pagamento falso.
- Garante o registro mesmo que o motorista feche o app antes de o pagamento cair.

**Chave da API**
- Usar uma *Restricted key* com permissão de escrita só em Checkout Sessions e de leitura em PaymentIntents, Charges e Balance transactions. A leitura é necessária para buscar a tarifa.
- A chave fica em variável de ambiente do tipo **Secret** (Azure Key Vault) ou em conexão personalizada.
- A chave nunca vai para o webresource nem para o Git. Usar uma chave para DEV (modo teste) e outra para PROD (modo live).

### App (`src/`)

- **`ReceiveScreen.tsx`:** novo botão secundário "Cobrar por QR code". Ele só aparece quando existe valor a receber **e** o motorista está liberado no cadastro.
- **Antes de gerar o QR:** o motorista confere o valor, que já vem preenchido com o valor a receber. Ele pode diminuir o valor, mas não aumentar, e escolhe BRL ou USD.
- **Nova tela ou sheet `QrChargeScreen`:**
  - Mostra o QR code em tela cheia e com brilho alto, junto com o valor e o tempo restante.
  - Mostra o estado: "Aguardando pagamento", "Pago" ou "Expirou, gerar outro".
  - Tem um botão "Cancelar cobrança", que chama `POST /v1/checkout/sessions/{id}/expire` pelo Flow para impedir pagamento depois do cancelamento.
- **QR code:** gerado no próprio app com uma biblioteca local (por exemplo `qrcode`). A URL não é enviada a nenhum serviço externo de QR.
- **Consulta do status:** a cada 3 s enquanto a tela estiver aberta, parando quando o pagamento entrar, a sessão expirar ou a tela fechar.
- **Comprovante:** com a cobrança paga, o `ReceiveScreen` aceita continuar sem foto. A linha de cobrança paga no Dataverse passa a ser o comprovante.
- **Recibo pessoal:** `metodoPagamento` passa a ser "Cartão (QR Stripe)" ou o equivalente no idioma do recibo.
- **Modo mock (localhost):** sessão falsa que passa a "paga" depois de 5 s, para permitir testar a UI sem o Stripe.

### Dataverse

**Permissão por motorista:** novo campo Sim/Não em `cr40f_funcionarios`, `cr40f_podecobrarqrcode` ("Pode cobrar por QR code"), com padrão Não. O nome lógico final deve ser confirmado na criação. O app lê o campo junto com o cadastro do motorista para mostrar ou esconder o botão, e o Flow confere o mesmo campo no servidor. Esconder o botão sozinho não basta, porque a URL do Flow pode ser chamada direto.

A proposta é criar uma tabela filha, **`cr40f_cobrancastripe`**, com:
- lookup para a reserva;
- `sessionId`, status (Aguardando / Pago / Expirado / Cancelado), valor e moeda;
- `paymentIntentId`, tarifa do Stripe e valor líquido;
- país e bandeira do cartão, e tipo de carteira digital;
- data de criação, data do pagamento e motorista.

Uma tabela filha guarda cada tentativa. Campos direto na reserva perderiam o histórico de cobranças expiradas ou canceladas.

Os nomes lógicos do "valor a receber" e do e-mail do passageiro precisam ser confirmados na metadata antes de implementar.

## Verificação

| Cenário | Esperado |
|---|---|
| Cartão de teste `4242 4242 4242 4242` (EUA) | O QR fica "Pago" em até ~5 s e a linha de cobrança registra o país US e a tarifa |
| Cartão recusado `4000 0000 0000 0002` | A página do Stripe mostra a recusa e o app continua em "Aguardando" |
| Autenticação 3DS `4000 0025 0000 3155` | Depois da autenticação, o pagamento fica "Pago" |
| O app é fechado antes do pagamento | O webhook grava o pagamento, e ao reabrir a reserva ela aparece como paga |
| Dois toques em "Cobrar" | Uma única sessão (reaproveitada e protegida pela chave de idempotência) |
| A sessão expira (30 min) | "Expirou, gerar outro", e o QR antigo não aceita mais pagamento |
| O motorista cancela | A sessão é expirada no Stripe e o link não aceita pagamento |
| Motorista sem a permissão | O botão não aparece, e uma chamada direta ao Flow é recusada |
| Valor maior que o valor a receber | O app bloqueia e o Flow também recusa |
| Valor menor (pagamento parcial) | O QR é gerado com o valor menor; o saldo continua a receber |
| Cobrança em USD | Sessão criada em USD, ou erro claro se a conta brasileira não aceitar (ver "Pendências") |
| O valor da reserva muda depois de gerado o QR | A sessão aberta é expirada e uma nova é gerada com o valor atual |
| Webhook forjado com id inexistente ou não pago | Nada é gravado |
| Sem internet no celular do motorista | Erro claro e o fluxo da foto do comprovante continua disponível |
| Apple Pay ou Google Pay num celular real | Pagamento em um toque (fazer manualmente no modo teste) |

Não dá para verificar na nuvem: os Flows reais, o Dataverse DEV e o Apple Pay ou Google Pay em aparelho. Esses testes são feitos localmente, com chave de teste.

## Decisões de negócio (21/10/2026)

1. **Quem cobra:** só os motoristas liberados pelo campo novo em `cr40f_funcionarios`.
2. **Valor:** no máximo o valor a receber. Valores menores são permitidos, e extras ou gorjeta não.
3. **Moeda:** BRL ou USD, à escolha do motorista.
4. **Recibo por e-mail:** sim. Ligar em Stripe → Settings → Customer emails → "Successful payments". No modo teste o Stripe não envia o e-mail automaticamente; dá para reenviar pelo painel.
5. **Reembolso:** só o financeiro, pelo painel do Stripe.
6. **Conta:** em ativação. Implementar e testar em modo teste; o live entra quando a ativação terminar.

## Pendências

- **USD numa conta brasileira:** não está confirmado se uma conta Stripe do Brasil pode cobrar em USD. Teste: rodar `stripe-teste.ps1 -Moeda usd` com a chave de teste.
  - **Se aceitar:** falta definir de onde vem a cotação para converter o valor a receber, que está em BRL. As opções são uma cotação fixa cadastrada, a cotação do dia de uma API ou o motorista digitar o valor em USD com um limite.
  - **Se recusar:** cobrar em BRL e ligar o Adaptive Pricing do Checkout, que mostra ao turista o valor na moeda do cartão dele, se estiver disponível para conta brasileira. Nesse caso, a escolha de moeda some do app.

## Fora do escopo

- Reembolso pelo app.
- Pix: a cobrança local já funciona por outros meios.
- Conciliação contábil automática.
- PayPal: descartado pelo atrito no pagamento.
