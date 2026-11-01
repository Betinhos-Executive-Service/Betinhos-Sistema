# Plano: tirar segredos e URLs de Flow do alcance dos motoristas

Data: 01/11/2026. Decisão do Renan: migrar segredos para tipo Segredo e planejar a saída das URLs de Flow. Origem: achados S1, S2 e S5 de `2026-11-revisao-app-motoristas.md`.

Estado: **nada executado**. O piloto no DEV está bloqueado nesta máquina: MCP do Dataverse desativado, sem `az`, `pac`, `dotnet` nem `pwsh`, e sem Key Vault conhecido. Cada passo abaixo diz o que precisa existir antes.

## Regra de ordem
O app lê as URLs dos Flows com a sessão do motorista (`src/lib/dataverse.ts:3629`) e o `Basic User` é o que permite essa leitura. Por isso a retirada do `Basic User` é o último passo. Antes dela, nenhum Flow pode depender de variável legível pelo motorista.

## Fase 1. Inventário (somente leitura, sem risco)
1. Listar todas as definições de variável de ambiente sem o limite de 20 linhas do MCP (a consulta do relatório parou em 20). Marcar quais guardam segredo e quais guardam URL.
2. Para cada segredo, achar os consumidores: plugins (`rg EnvironmentVariables.Read` no repo e no Sistema Betinhos), Flows (ações que usam a variável) e scripts.
3. Resultado esperado: tabela `variável, tipo de conteúdo, consumidor, caminho alvo`. Conhecido até agora:

| Variável | Consumidor | Caminho alvo |
|---|---|---|
| `new_AnthropicKeyObservacaoMotorista` | plugin `OrganizeObservationPlugin.cs:26` | configuração segura do step |
| `new_AnthropicApiKey`, `new_AnthropicKey*` (8 sem valor no DEV) | a descobrir | a descobrir |
| `cr40f_GerarPagantesGraphClientSecret`, `cr40f_GerarPagantesCieloClientSecret` | provável Flow de pagantes | variável tipo Segredo (Key Vault) |
| `new_RDStationClientSecret`, `new_RDStationRefreshToken` | a descobrir | variável tipo Segredo; refresh token exige regravação pelo consumidor |
| `new_JevApiKey` | a descobrir | a descobrir |

## Fase 2. Piloto no DEV com um segredo
Escolha: `new_AnthropicKeyObservacaoMotorista`, porque o consumidor é um plugin deste repo.
1. Registrar a chave na **configuração segura** do step de `new_OrganizarObservacao`, mesmo padrão de `new_CobrancaQR` (Stripe) e do plugin Acesso. Não precisa de Key Vault.
2. Mudar `OrganizeObservationPlugin` para ler a chave da configuração segura, com teste unitário. Manter a leitura antiga como reserva só até a validação.
3. Publicar o plugin **a partir de uma `main` atualizada** (o assembly é único e compartilhado entre frentes).
4. Validar no DEV: organizar uma observação, conferir que o texto volta organizado e que a chamada à Anthropic acontece.
5. Esvaziar o valor da variável de ambiente antiga e rotacionar a chave.
6. Verificar como motorista: `GET environmentvariablevalues` não mostra mais a chave.

Precisa existir: MCP DEV reativado ou execução local no Windows; `dotnet` para compilar e rodar os testes do plugin; trava `~/.claude/locks/dataverse-dev.lock` para escrita no DEV.

## Fase 3. Demais segredos
- Segredos usados por plugin: mesmo caminho da fase 2.
- Segredos usados por Flow: criar a variável tipo **Segredo** apontando para um Key Vault, dar ao serviço do Power Platform acesso de leitura ao cofre e trocar a ação do Flow para usar a variável. **Decisão pendente:** qual Key Vault e quem o administra.
- Depois de cada migração: rotacionar o valor no fornecedor (Anthropic, Graph, Cielo, RD Station, Jev), porque os atuais estiveram legíveis por qualquer motorista.
- Conferir o PROD só em leitura antes de planejar a mesma troca lá.

## Fase 4. Flows chamados pelo app (S2)
Cada URL deixa de ir para o app. O app chama uma Custom API que usa a identidade do motorista e valida o vínculo antes de acionar o Flow. Ordem por risco:

| # | Flow | Risco hoje | Validação no servidor |
|---|---|---|---|
| 1 | Enviar recibo ao cliente | e-mail em nome da Betinhos para qualquer destinatário, com anexo arbitrário | destinatário vem da reserva, não do app; reserva é do motorista |
| 2 | Gerar voucher | geração de voucher para qualquer serviço | serviço é do motorista |
| 3 | Salvar arquivos no OneDrive | gravação arbitrária de arquivos | manutenção ou serviço é do motorista; tipo e tamanho limitados |
| 4 | Despesa assíncrona | envio de despesa em nome de outro | verificar se `new_ExpenseUploadTransition` já cobre; se sim, só remover o uso da URL |
| 5 | Leitura rápida do comprovante (IA) | consumo de IA por qualquer pessoa | limite de tamanho e de chamadas por motorista |

Por Flow: criar a Custom API com *Execute Privilege*, mudar o Flow para exigir autenticação, trocar a chamada no app (`runHttpFlow` e `readReceiptQuick`), regenerar a URL antiga e testar no DEV com motorista real. Cada troca é um PR.

## Fase 5. Retirar o `Basic User`
Só depois das fases 3 e 4. Criar papel mínimo se algo do `Basic User` ainda for usado, remover da equipe `Team-Betinhos-Canvas-DEV`, testar abertura do app, agenda, gastos e recibo com um motorista real, e só então repetir no PROD por `scripts/deploy-prod.ps1`.

## Reversão
- Fase 2: manter a leitura antiga até a validação; republicar o assembly anterior se falhar.
- Fase 4: manter a URL antiga ativa até o app novo estar publicado; só então regenerar.
- Fase 5: reatribuir o papel na equipe.

## O que preciso de você
1. Reativar o MCP do Dataverse apenas para o DEV, ou rodar os passos da fase 2 no Windows.
2. Dizer qual Key Vault usar na fase 3, ou autorizar a criação de um.
3. Confirmar se o PROD tem os mesmos segredos preenchidos.
