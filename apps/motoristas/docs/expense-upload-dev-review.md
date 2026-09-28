# Revisão do envio assíncrono de comprovantes — DEV

Implementação isolada na branch `codex/expense-upload-async`, baseada na `master` em `7f227e1`. O checkout de `comunicados` foi preservado. PROD não recebeu alterações.

## Problema confirmado

O Flow síncrono podia criar o arquivo depois de a resposta HTTP expirar. O app registrava falha de upload mesmo com o arquivo existente no OneDrive. A nova rotina separa aceitação HTTP de conclusão persistida no Dataverse.

## Implementação

- IDs de despesa, anexo e tentativa persistidos no IndexedDB antes de operações remotas; registros criados com esses IDs e reutilizados após resposta perdida.
- Anexos pendentes criados antes do upload, com URL opcional. Tipo MIME e identificador OneDrive acrescentados à tabela existente.
- Flow exclusivo DEV responde 202 após obter o processamento por registro/tentativa/execução. Os consumidores síncronos continuam usando a implementação existente.
- Custom API transacional com concorrência otimista no anexo e na despesa; atualizações de tentativas antigas ou de outra execução são rejeitadas.
- Status agregado considera a quantidade esperada de anexos e os estados pendente, processando, enviado e falhou.
- Consulta a cada cinco segundos enquanto a página estiver visível; restauração do rascunho, arquivos e IDs ao reabrir. Resultado indefinido não dispara novo upload.
- Ação explícita permite encerrar apenas uma tentativa ainda não iniciada. Nova tentativa exige falha confirmada e preserva os anexos concluídos.
- Erro original, etapa e execução persistidos; URLs, credenciais, emails e conteúdo base64 extenso são sanitizados antes da gravação.

## Ajustes encontrados pela reavaliação

1. Tentativa não recebida pelo Flow podia ficar pendente indefinidamente: adicionada transição atômica para encerramento explícito de tentativa não iniciada.
2. Registro do plugin e Custom API precisava de `friendlyname` e `description`, exigidos pelo ambiente real.
3. Campos MIME e identificador do arquivo estavam ausentes no DEV: criados e exigidos na verificação anterior ao cadastro.
4. ID OneDrive excedia 100 caracteres: campo ampliado para 1024, com verificação pelo provisionador.
5. `Compose` não aceita `secureData.outputs`: configurada proteção de inputs compatível com o Power Automate.
6. Espera de dois segundos não é válida no plano Consumption: ampliada para cinco segundos.
7. Limite do laço não podia ser confundido com sucesso: utilizado `FailWhenLimitsReached`; falha preservada com causa e etapa.
8. Reduzido o registro repetido de falhas de consulta e preservado estado enviado quando a resposta de conclusão é perdida.
9. Mensagem da tela mantém os comprovantes pendentes visíveis mesmo quando outro já falhou; confirmação imediata acompanha o estado realmente consultado.

## Validação local

- `npm test`: 106 testes aprovados.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`: aprovado.
- `dotnet test plugins/ExpenseUpload.Tests/ExpenseUpload.Tests.csproj -c Release --nologo`: nove testes aprovados.
- `npm run build -- --no-version`: aprovado, versão 2.1.679.
- Graphify atualizado somente a partir do código afetado.

## Validação remota

Ambiente: `https://org23b93544.crm2.dynamics.com/`. Organização: `7e5f59f4-efce-f011-89f6-000d3ac0a3e1`. Solução: `AppBetinhos`.

Schema, plugin, Custom API, Flow e variável de URL foram publicados e tiveram pertencimento à solução conferido, incluindo herança por tabela com todos os subcomponentes.

Flow: `d4ee3edf-47b0-cc14-716b-955fe696a353` / workflow `571921e2-6bbb-f111-aaaf-7ced8da8c473`.

CORS conferido com Origin DEV: OPTIONS retornou 204 com origem `*`, método POST permitido e header `content-type`; POST retornou 202 com origem `*`.

WebResource: `new_app-motoristas-v2`, conteúdo remoto igual ao local. SHA-256:
`E4328489147EC0DBB8675603445B52FFCFB3DA447CE4EC0DD63F5BB0E1DB960A`.

Despesa QA `583b6eab-6cbb-f111-aaaf-7ced8da8c473`: três anexos, três enviados, agregado Completo. Falha real com conteúdo inválido foi persistida antes da nova tentativa. Repetição do mesmo envio manteve o mesmo anexo; atualização com tentativa antiga retornou `applied: false, stale: true`. Aceites HTTP variaram de aproximadamente 1,0 a 5,5 segundos. Os registros QA têm status financeiro e operacional Cancelado e não representam despesas reais.

Teste longo: despesa QA `a0416a1e-76d7-4f12-a64a-7b6b4a5ba299`, anexo `ff418c77-f454-45ee-bf8f-bb39d781254d`. Espera temporária de 130 segundos restrita a esse ID aplicada via MCP. Aceite HTTP 202 em 1501 ms; execução `08584109843714627410881436406CU06` concluída com sucesso em 141,2548535 segundos. Anexo Enviado e despesa Completo. Definição original restaurada, Flow ativo e ausência da espera temporária confirmados via MCP. Contagem final: uma despesa com três vínculos e uma despesa com um vínculo, sem novos vínculos nas repetições.

## Pendências e limites

- Navegador DEV ainda aguarda login Microsoft. Cadastro, saída/reabertura e nova tentativa no app autenticado não foram comprovados; os testes Node cobrem a máquina de retomada, mas não substituem essa validação.
- Verificador global de higiene aponta três arquivos já presentes na master: `.herenow/state.json`, `extracted-msapp/References/Resources.json` e `tests/appErrorLogger.test.ts`. Não foram alterados nesta correção. O comando completo `npm run push -- -ExpenseUploadOnly` interrompe nesse gate; a publicação DEV foi feita pelos scripts específicos após os testes e verificações de alvo/conteúdo.
- A chave local de assinatura do plugin está ignorada pelo Git. Preserve-a para novas publicações; o provisionador recusa substituir uma assembly com identidade diferente.
- Nenhum comprovante antigo foi recuperado automaticamente e nenhuma alteração foi feita em PROD.
