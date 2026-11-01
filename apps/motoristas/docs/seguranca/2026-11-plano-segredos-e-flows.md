# Plano: tirar segredos e URLs de Flow do alcance dos motoristas

Data: 01/11/2026. Decisão do Renan: migrar segredos para tipo Segredo e planejar a saída das URLs de Flow. Origem: achados S1, S2 e S5 de `2026-11-revisao-app-motoristas.md`.

Estado: **fase 1 concluída em 01/11/2026**; fases 2 em diante não executadas. O MCP do DEV foi reativado, mas a máquina que gerou este plano não tem `dotnet` nem `pwsh`, então o piloto (que muda e publica o plugin) precisa rodar no Windows. Cada passo abaixo diz o que precisa existir antes.

## Regra de ordem
O app lê as URLs dos Flows com a sessão do motorista (`src/lib/dataverse.ts:3629`) e o `Basic User` é o que permite essa leitura. Por isso a retirada do `Basic User` é o último passo. Antes dela, nenhum Flow pode depender de variável legível pelo motorista.

## Fase 1. Inventário (somente leitura, sem risco)
1. Listar todas as definições de variável de ambiente sem o limite de 20 linhas do MCP (a consulta do relatório parou em 20). Marcar quais guardam segredo e quais guardam URL.
2. Para cada segredo, achar os consumidores: plugins (`rg EnvironmentVariables.Read` no repo e no Sistema Betinhos), Flows (ações que usam a variável) e scripts.
3. Resultado do DEV em 01/11/2026 (somente leitura, valores não lidos): 54 definições, 52 do tipo String e 2 de outros tipos da Microsoft. **Nenhuma é do tipo Segredo.**

| Variável | Onde a chave está | Consumidor encontrado | Caminho alvo |
|---|---|---|---|
| `new_AnthropicKeyObservacaoMotorista` | valor padrão da definição | plugin `OrganizeObservationPlugin.cs:26`, step "Organizar observacao do motorista" (pós-operação, síncrono, sem configuração segura hoje) | configuração segura do step |
| `new_AnthropicKeyDespesasAnalise`, `new_AnthropicKeyDespesasLeitura` | valor padrão | Flows "Flow Despesas \| Análise IA" e "Flow Despesas \| Leitura rápida" | variável tipo Segredo |
| `new_AnthropicKeyAgentes`, `new_AnthropicKeyFinanceiro`, `new_AnthropicKeyLogistica`, `new_AnthropicKeyPessoas`, `new_AnthropicKeyFrota` | valor padrão | "Flow Agentes \| Executar" referencia Agentes e Financeiro; Logistica, Pessoas e Frota sem referência no código | variável tipo Segredo; confirmar se as três últimas estão em uso |
| `new_AnthropicApiKey` | valor | a confirmar entre os Flows acima | variável tipo Segredo |
| `new_JevApiKey` | valor | Flows "Tela Frota - Classificar manutenção (JEV)" e "... agora (JEV)" | variável tipo Segredo |
| `new_RDStationClientSecret`, `new_RDStationRefreshToken` | valor | "Flow API RD Station BD para Leads" | variável tipo Segredo; o refresh token é regravado pelo Flow, então o Flow precisa gravar no cofre |
| `cr40f_GerarPagantesCieloClientSecret`, `cr40f_GerarPagantesGraphClientSecret` | valor | nenhum Flow do DEV os referencia; consumidor não achado no código | confirmar o consumidor (talvez só PROD) antes de migrar |

Achado novo: as oito chaves `new_AnthropicKey*` estão no **valor padrão da definição**, não em `environmentvariablevalue`. O `Basic User` tem leitura da definição, então o motorista enxerga a chave sem nem consultar o valor.

## Fase 2. Piloto no DEV com um segredo
Escolha: `new_AnthropicKeyObservacaoMotorista`, porque o consumidor é um plugin deste repo.

**Já feito no PR (Linux, 01/11/2026):**
- `OrganizeObservationPlugin` recebe a configuração segura do step e a usa primeiro (`ObservationApiKey.Resolve`); sem ela, continua lendo a variável de ambiente. Comportamento do step atual não muda.
- `scripts/provision-observacao-organizada.ps1 -Apply -ConfigurarChaveSegura` pede a chave com entrada oculta e a grava na configuração segura do step.
- Plugin compila em net462 sem erros; 5 testes novos passam em net8. A suíte inteira do projeto de testes não compila fora do Windows (há um `string.Contains` com dois argumentos em `ExchangePossessionFinalizerTests`, de outra frente).
- Script PowerShell **não executado** (sem `pwsh`).

**Falta, no Windows, nesta ordem:**
1. Atualizar a `main` local e publicar o assembly no DEV pelo fluxo normal (o assembly é único e compartilhado entre frentes). Usar a chave de nome forte real; a que gerei aqui é descartável e nunca vai a lugar nenhum.
2. Gerar uma **chave nova** no console da Anthropic para a observação do motorista e rodar `scripts/provision-observacao-organizada.ps1 -Apply -ConfigurarChaveSegura`. Valide o primeiro `-Apply`: o `Invoke-Dv` manda o cabeçalho de solução também para a tabela de configuração segura, e não conferi se ela aceita.
3. Chamar `new_OrganizarObservacao` e conferir os tópicos.
4. Esvaziar o valor padrão de `new_AnthropicKeyObservacaoMotorista`, repetir a chamada e revogar a chave antiga no console.
5. Verificar como motorista: a definição não mostra mais a chave.
6. Só depois, incluir o step "Organizar observacao do motorista" em `$secureSteps` de `scripts/deploy-prod.ps1`. Antes disso o deploy do PROD passaria a falhar.

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
1. Rodar a fase 2 no Windows (compilação e publicação do plugin), ou liberar `dotnet` e `pwsh` nesta máquina.
2. Dizer qual Key Vault usar na fase 3, ou autorizar a criação de um.
3. Confirmar se o PROD tem os mesmos segredos preenchidos.
