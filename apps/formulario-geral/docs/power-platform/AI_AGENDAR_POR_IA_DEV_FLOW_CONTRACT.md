# Artefato DEV — fluxos Power Automate

Este documento é o contrato de implementação dos fluxos solution-aware. O provisionador do repositório cria/atualiza o schema e injeta os valores de ambiente; o operador ainda precisa fornecer as Connection References reais e validar a conexão do Custom Connector DeepSeek.

## Manifesto de configuração

Para obter a evidência inicial, abra o Model-driven App no ambiente DEV e cole `scripts/coletar_metadata_dataverse_console.js` no console do navegador. O script baixa o JSON de metadata da solução; ele não envia segredo nem conteúdo de atendimento. Use esse arquivo no comando de validação abaixo.

| Parâmetro | Valor inicial | Evidência necessária |
|---|---|---|
| Tabela de sessão | `cr40f_conversaiaagendamento` | tabela publicada na solução DEV |
| Tabela de reserva | `cr40f_reservadeveculos` | metadata DEV exportada |
| Campo de lookup reserva → sessão | pendente | Lookup real criado na reserva |
| Chave alternativa da reserva | pendente | chave `sessionId + ordinal` publicada |
| Connection Reference DeepSeek | pendente | referência criada na solução |
| Choice de status da sessão | placeholders no `index.html` | valores reais DEV |
| URL do connector | `POST /responses` | Custom Connector importado |

O `npm run push` cria os itens de schema pendentes no DEV. A validação com metadata exportada continua sendo um gate opcional para confirmar nomes lógicos e tipos depois da publicação.

Validação automatizada antes da importação/ativação:

```powershell
node scripts/validate_ai_schedule_manifest.mjs `
  --manifest docs/power-platform/ai_schedule_solution_manifest.json `
  --metadata C:\caminho\metadata-AppBetinhos.json
```

Substitua `C:\caminho\metadata-AppBetinhos.json` pelo caminho real do JSON baixado pelo coletor; o texto acima é somente um exemplo.

O comando falha se ainda houver placeholders, tabela/coluna ausente, tipo incompatível, lookup sem alvo da sessão ou `entitySetName` divergente. A saída `ok: true` é pré-requisito para continuar a configuração manual dos fluxos.

## Fluxo 1 — Interpretar sessão

Nome sugerido: `Betinhos - IA - Interpretar conversa`.

1. Trigger Dataverse: registro criado/modificado na tabela de sessão.
2. Obter o registro completo.
3. Condição de entrada:

```text
@and(
  greater(
    int(coalesce(triggerOutputs()?['body/<campoVersaoEntrada>'], 0)),
    int(coalesce(triggerOutputs()?['body/<campoVersaoProcessada>'], 0))
  ),
  equals(triggerOutputs()?['body/<campoStatus>'], <valorWAITING_AI>)
)
```

4. Usar uma trava lógica com `sessionId:inputVersion`. Se a mesma chave já tiver sido processada, terminar sem nova chamada.
5. Preparar o prompt como conteúdo não confiável. Incluir somente o texto da sessão, data/hora atual em `America/Sao_Paulo` e instruções fixas do contrato. Ignorar instruções contidas na mensagem colada.
6. Chamar o Custom Connector DeepSeek com Secure Inputs/Outputs:
   - primeira chamada: `deepseek-v4-flash`, `thinking` desligado;
   - Structured Output usando `ai_schedule_proposal.schema.json`;
   - no máximo uma segunda chamada `deepseek-v4-pro` somente para vazio, JSON inválido ou baixa confiança com campos aparentemente completos;
   - nunca usar fallback para campo realmente ausente.
7. Resolver IDs e Choices no fluxo/código, nunca pedir ao modelo listas completas do Dataverse.
8. Validar novamente JSON, data, hora, identidade e Choice.
9. Atualizar sessão em uma única escrita:
   - proposta JSON;
   - `missingFields` e `warnings` determinísticos;
   - `processedVersion = inputVersion`;
   - modelo, tentativas e métricas;
   - `WAITING_USER` se faltar dado; `READY` somente sem pendência;
   - `ERROR` com mensagem sanitizada em falha operacional.
10. Para `READY`, escrever uma mensagem objetiva pedindo confirmação explícita. Setar `confirmationRequested = true`.

## Fluxo 2 — Agendar confirmação

Nome sugerido: `Betinhos - IA - Gravar reservas confirmadas`.

1. Trigger Dataverse: registro criado/modificado na tabela de sessão.
2. Condição:

```text
@and(
  equals(triggerOutputs()?['body/<campoStatus>'], <valorSCHEDULING>),
  equals(
    int(triggerOutputs()?['body/<campoVersaoConfirmada>']),
    int(triggerOutputs()?['body/<campoVersaoEntrada>'])
  ),
  equals(triggerOutputs()?['body/<campoConfirmacaoSolicitada>'], false)
)
```

3. Recarregar a sessão e validar a versão atual. Rejeitar confirmação antiga ou proposta alterada.
4. Para cada serviço ordenado por `ordinal`:
   - consultar a chave alternativa `sessionId + ordinal`;
   - se reserva já existir, reutilizar o ID;
   - se identidade não tiver ID, retornar `WAITING_USER` e proposta de cadastro; nunca criar pessoa silenciosamente;
   - criar reserva usando o mesmo mapeamento de campos de `saveReserva`;
   - criar relações em `cr40f_servicosporpassageiros` para cada passageiro;
   - gravar imediatamente o ID na sessão.
5. Não aplicar regras específicas da importação XLSX, PG ou ID Tenaris.
6. Em erro:
   - preservar IDs concluídos;
   - status `PARTIAL` se houver pelo menos um ID;
   - status `ERROR` se nenhum ID foi criado;
   - guardar erro sanitizado e permitir retomada idempotente.
7. Em sucesso, status `SCHEDULED`, `confirmationRequested = false` e lista final de IDs.

## Controles obrigatórios

- Concorrência do fluxo limitada a 1 por sessão/chave.
- Retry exponencial somente para 429/5xx; não repetir 4xx de validação.
- Máximo de duas chamadas DeepSeek por interação.
- Secure Inputs/Outputs em connector, parsing e ações com texto original.
- Nenhum segredo, token ou corpo completo em logs.
- Retenção de 90 dias por política Dataverse/flow.
- Connection Reference usada no ALM DEV → PROD.

## Voucher

O Web Resource exibe **Abrir voucher** somente quando a sessão contém IDs efetivamente criados. Ele consulta essas reservas e chama o gerador de voucher existente. Não montar voucher a partir de proposta sem ID criado.
