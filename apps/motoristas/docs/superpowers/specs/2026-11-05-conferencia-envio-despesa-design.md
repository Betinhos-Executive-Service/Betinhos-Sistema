# Conferência da despesa no envio (IA + popup "Dúvida")

Data: 05/11/2026. Decisões tomadas com o Renan na sessão de 05/11 (grilling). Ambiente: só DEV até ok explícito para PROD.

## Objetivo

Quando o motorista toca **Enviar** (gasto novo ou completar gasto do cartão), uma IA confere na hora se o gasto faz sentido. Se houver dúvida, o envio pausa e abre o popup **"Dúvida"** com uma pergunta; o motorista justifica (texto ou microfone) e o envio continua com a justificativa gravada na despesa.

## Fluxo no app

1. Enviar → overlay de envio (o mesmo de hoje) com etapa nova no início: **"Conferindo o gasto…"**.
2. O app chama o flow **"Flow Despesas | Conferência no envio"** (HTTP síncrono) com o contexto abaixo.
3. Resposta `sem_duvida` → segue para as etapas atuais (salvar, enviar comprovante). Sem atrito.
4. Resposta `duvida` → o overlay pausa e abre o popup "Dúvida":
   - título "Dúvida", a pergunta da IA (uma só, juntando os pontos), campo de texto com o botão de ditado do campo de observação;
   - **"Responder e enviar"** (justificativa obrigatória, mínimo 10 caracteres sem espaços nas pontas) e **"Voltar e corrigir"** (volta ao formulário; a conferência roda de novo no próximo Enviar);
   - fechar pelo X/fora conta como "Voltar e corrigir" (nada é gravado).
5. Timeout de 12 s, sem rede ou erro/resposta inválida → envia normal e grava `conferencia = indisponível`. O motorista nunca fica travado.
6. Uma rodada só: a resposta do motorista não volta para a IA no envio.

## O que a IA confere (versão 1)

- **Acima da política, só faixa vermelha** (`semaforo()` de `gastosRelatorio.ts`, metas de `METAS_GASTOS`): refeição (almoço/jantar) acima de R$ 44,10; litro acima de R$ 6,222.
- **Repetição em pouco tempo** (hora do gasto, ver abaixo):
  - almoço/jantar a menos de 3 h de outro almoço/jantar;
  - abastecimento a menos de 4 h ou com menos de 150 km rodados desde o anterior do mesmo veículo;
  - mais de 3 cafés/lanches no mesmo dia;
  - mesmo valor e mesma data de um gasto já enviado (possível duplicidade).
- **Refeição sem serviço no dia** (almoço, jantar, café, lanche): nenhum serviço do motorista "tocando o dia" — saída ou retorno previsto naquele dia, inclusive serviço que começa na véspera e passa da meia-noite; aberto ou concluído conta, cancelado não.
- **Data:** data digitada diferente da data lida no cupom pela leitura rápida; ou sem serviço no dia mas com serviço em dia vizinho (a pergunta sugere a data, ex.: "Era dia 04/11?"). Data futura continua bloqueada pelo formulário.

Fora da v1: foto x valor/KM/litros acima do tanque, cidade longe do serviço.

### Quem decide

A IA decide se pergunta e redige a pergunta (modelo `claude-haiku-5-5`). Para ser previsível e testável, o **app calcula os fatos** (meta e faixa, intervalos, contagens, serviços do dia, divergência de data) e os manda como "sinais". A IA julga os sinais junto com a descrição que o motorista já escreveu e devolve **uma** pergunta curta em pt-BR, citando valores e datas, ou `sem_duvida` quando a descrição já explica (ex.: "almoço do passageiro, pago a pedido do cliente").

**Sem sinal, o app não chama o flow** (custo e espera zero) e grava `Não conferido (sem sinal)`.

### Hora do gasto

A despesa hoje grava só a data. A leitura rápida passa a extrair também a **hora impressa no cupom** (`hora_compra`, `HH:mm` ou null). A leitura rápida já devolve `hora` (HH:MM); o app grava em `new_horagasto` (coluna própria, para não mudar `cr40f_datagasto`, que vários leitores tratam como data). Sem hora legível, a conferência usa a hora do envio.

## Contexto enviado ao flow

```json
{
  "gasto": { "categoria": "Almoço", "valor": 58.0, "data": "2026-11-05", "hora": "12:40|null", "litros": null, "km": null,
             "estabelecimento": "…", "descricao": "…", "cidade": "…", "origem": "manual|cartao" },
  "leitura": { "valor": 58.0, "data": "2026-11-05", "hora": "12:40" },
  "metas": { "refeicao": { "meta": 42, "tolerancia": 0.05 }, "litro": { "meta": 6.1, "tolerancia": 0.02 } },
  "sinais": [ { "tipo": "acima_politica", "detalhe": "R$ 58,00 contra meta R$ 42,00 (+38%)" },
              { "tipo": "refeicao_proxima", "detalhe": "Jantar R$ 45,00 às 11:10 no mesmo dia" } ],
  "recentes": [ { "categoria": "Jantar", "valor": 45, "data": "2026-11-05", "hora": "11:10" } ],
  "servicos_no_dia": 0, "servico_dia_vizinho": "2026-11-04|null"
}
```

`recentes`: gastos dos últimos 7 dias do motorista (o app já carrega para o relatório). Sem nome de passageiro, cliente ou dado pessoal além do próprio gasto.

Resposta (sempre 200 JSON): `{ "ok": true, "resultado": "sem_duvida" | "duvida", "pergunta": "…|null", "motivos": ["acima_politica", …] }`; erro do modelo → `{ "ok": false }`.

## Dataverse (DEV, solução AppBetinhos)

Colunas novas em `cr40f_despesaoperacional`:

| Coluna | Tipo | Conteúdo |
|---|---|---|
| `new_conferenciaenvio` | Choice | Sem dúvida · Dúvida respondida · Indisponível · Não conferido (sem sinal) |
| `new_conferenciapergunta` | Memo 2000 | Pergunta exibida ao motorista |
| `new_conferenciajustificativa` | Memo 4000 | Resposta do motorista |
| `new_conferenciamotivos` | Texto 400 | Motivos separados por vírgula (`acima_politica,refeicao_proxima`) |

| `new_horagasto` | Texto 5 | Hora do cupom `HH:mm` (leitura rápida), quando legível |

Prefixo `new_` (publicador da AppBetinhos). A tabela está na solução com todos os subcomponentes, então as colunas entram no export sem passo extra. Gravadas no mesmo payload do envio (`expenses.payload.ts`) e no PATCH de completar gasto do cartão. Script: `scripts/provision-conferencia-envio-schema.ps1` (aplicado no DEV em 05/11/2026).

## Flow "Flow Despesas | Conferência no envio"

Mesmo padrão da leitura rápida: gatilho HTTP síncrono (URL SAS em `new_FlowURLDespesaConferenciaEnvio`, lida por `resolveFlowUrl`), chamada a `https://api.anthropic.com/v1/messages` com `x-api-key` da variável `new_AnthropicApiKey` (já existe no DEV), `claude-haiku-5-5`, `max_tokens` 512, saída estruturada `json_schema`, timeout da ação `PT10S`, sem retry, `secureData` nas ações HTTP. Condição de gatilho rejeita corpo sem `sinais` ou acima de 20 KB. Prompt, schema e validação em `Sistema Betinhos/packages/despesas-ia/src/conferencia-envio/` (vitest); provisionamento em `packages/deploy/provision-flow-despesas-conferencia-envio.ps1`.

## Tarefas

1. **Sinais (app, puro e testado):** `src/lib/conferenciaEnvio.ts` — calcula sinais a partir do rascunho, leitura, gastos recentes e serviços do dia; testes de cada regra e dos limites (3 h, 4 h, 150 km, 3 cafés, faixa vermelha, véspera passando da meia-noite, cancelado não conta).
2. **Serviços do dia:** consulta de serviços do motorista que tocam a data do gasto (reutiliza os filtros de `dataverse.ts`), com mock local.
3. **Leitura rápida com hora:** `hora_compra` no schema/prompt do pacote `despesas-ia` + reprovisionar o flow; app lê e guarda a hora.
4. **Schema:** script `scripts/provision-conferencia-envio-schema.ps1` cria as 4 colunas e inclui na AppBetinhos; payload e PATCH do cartão gravam os campos.
5. **Flow:** pacote `conferencia-envio` (prompt, schema, validação, testes) + script de provisionamento + variável da URL.
6. **UI:** etapa "Conferindo o gasto…" no overlay de envio, popup "Dúvida" (`ConferenciaDuvidaDialog`) com ditado, justificativa obrigatória, "Voltar e corrigir"; timeout 12 s. Mock local com `?mockConferencia=duvida|sem|erro`.
7. **Verificação:** testes, `tsc` estrito, skill `verificar-gastos` (ou nova `verificar-conferencia-envio`), navegador a 390 px nos três cenários do mock; publicação no DEV e teste autenticado do Renan com um almoço acima da meta e um sem serviço no dia.

## Fora de escopo (próxima sessão, Sistema Betinhos)

Exibir pergunta e justificativa ao financeiro; a IA de validação do back-office usar a justificativa; metas configuráveis pela tela do gestor; casos foto x digitado/KM e cidade.

## Riscos

- Latência do Haiku em rede móvel: coberto pelo timeout de 12 s → "Indisponível".
- Custo: só chama quando há sinal (estimativa: minoria dos envios).
- URL SAS exposta no cliente: condição de gatilho limita tamanho e exige `sinais`; resposta não devolve nada além da pergunta.
- Hora do cupom ilegível: regras de intervalo caem para a hora do envio, que pode gerar dúvida falsa em envio atrasado; a pergunta cita a hora usada para o motorista corrigir.
