# Agentes por departamento (Financeiro, Logística, Pessoas)

Data: 14/10/2026. Aprovado por Renan no brainstorm desta data. Previsto no caderno para dezembro de 2026.

## Objetivo

Três assistentes internos no Sistema Betinhos, um por departamento, que leem o Dataverse, analisam e **propõem**. Nenhuma escrita acontece sem um humano clicar em Aprovar. Toda decisão fica registrada para medir acerto e decidir, depois, se algum agente pode ganhar autonomia.

## Decisões

| Tema | Decisão |
|---|---|
| Agentes | Financeiro (interno), Logística (interno), Pessoas/RH (interno). |
| Canal | Página no shell React, uma entrada de menu por departamento. |
| Autonomia | Só sugere. Aprovar executa a ação com a sessão do usuário logado. |
| Hospedagem | Power Automate (gatilho Dataverse + HTTP premium) chamando a API da Anthropic. Mesmo padrão de `Flow Despesas | Análise IA`. |
| Modelo | `claude-opus-5-5`, `output_config.effort: medium`, structured output. Troca por Sonnet 5.5 só por avaliação offline, não por preço. |
| Segredos | Variáveis de ambiente do Dataverse (`new_AnthropicApiKey`, chave do Infleet). O repositório é público: só nomes e scripts, nunca valores. |
| Legado | Tabelas `cr40f_*ia*`, `cr40f_decisaooperacionalia`, `cr40f_contextooperacionalia`, `cr40f_filaagendamentoclaude`, `cr40f_solicitacaoiaagendamento` e Custom APIs `cr40f_AI*` não são usadas. |
| Ambiente | Só DEV (`org23b93544`). PROD exige pedido explícito. |

## Alternativas descartadas

- **Azure Function + SDK Anthropic com tools**: mais capaz (loop agêntico, cache), mas exige serviço novo, Key Vault, identidade de aplicativo e CI/CD extra. Fica como evolução se um agente precisar de ferramentas. O pacote TS desta spec já serve de base.
- **Plugin C# Custom API**: fora do stack, limite de 2 min, difícil de testar.
- **Copilot Studio**: licença extra e sem Claude.

## Comportamento por agente

### Financeiro
- Roda às 07:00 (dias úteis) e sob demanda. Janela: últimos 60 dias.
- Lê `cr40f_financeiro`, `cr40f_recibos`, `cr40f_pagamentoaterceiro`, `cr40f_reservadeveculos`.
- Propostas: `SemRecibo`, `FaturaVencendo`, `FaturaVencida`, `RepasseDivergente`, `OSSemCobranca`.
- Ação ao Aprovar: `CriarPendencia` (cria `cr40f_plannertarefa`). Nunca altera valores.

### Logística
- Roda ao abrir a página se a última execução tiver mais de 30 min, e sob demanda. Janela: hoje + 2 dias.
- Lê `cr40f_reservadeveculos`, `cr40f_funcionarios` (motoristas), `cr40f_veiculos`, `cr40f_trocasdecarro` e posição atual dos veículos no Infleet.
- Propostas: `ServicoSemMotorista`, `ServicoSemVeiculo`, `ConflitoHorario`, `RiscoAtraso`, `CarroForaDaBase`.
- Ações ao Aprovar: `AtribuirMotorista`, `AtribuirVeiculo` (update em `cr40f_reservadeveculos`).

### Pessoas (RH e gestão de pessoas)
- Roda às 07:00 (dias úteis) e sob demanda. Janela: 90 dias à frente.
- Lê `cr40f_funcionarios`, `cr40f_documento`, `cr40f_multas`, `cr40f_comunicadohome`.
- Propostas: `CNHVencendo`, `ASOVencendo`, `DocumentoVencido`, `Aniversario`, `MultaSemMotorista`, `ComunicadoSugerido`.
- Ações ao Aprovar: `CriarPendencia`, `CriarComunicadoRascunho` (cria `cr40f_comunicadohome` inativo).

Comum aos três: campo de pergunta livre; histórico de execuções com tokens; cada decisão humana gravada.

## Dados

Duas tabelas novas na solução AppBetinhos.

### `cr40f_agenteexecucao` (uma por rodada)

| Coluna | Tipo | Observação |
|---|---|---|
| `cr40f_agente` | choice | Financeiro, Logistica, Pessoas |
| `cr40f_origem` | choice | Agendado, Manual |
| `cr40f_pergunta` | texto 2000 | opcional |
| `cr40f_status` | choice | Pendente, Processando, Concluida, Erro |
| `cr40f_erro` | texto 2000 | motivo legível |
| `cr40f_contexto` | memo | JSON enviado ao Claude |
| `cr40f_resposta` | memo | JSON bruto devolvido |
| `cr40f_resumo` | texto 500 | cabeçalho da tela |
| `cr40f_modelo` | texto 100 | |
| `cr40f_tokensentrada`, `cr40f_tokenssaida` | inteiro | custo observável |

### `cr40f_agenteproposta` (N por execução)

| Coluna | Tipo | Observação |
|---|---|---|
| `cr40f_execucao` | lookup | para `cr40f_agenteexecucao` |
| `cr40f_tipo` | choice | união dos tipos dos três agentes |
| `cr40f_titulo` | texto 200 | |
| `cr40f_justificativa` | texto 2000 | |
| `cr40f_prioridade` | choice | Alta, Media, Baixa |
| `cr40f_entidadealvo`, `cr40f_idalvo` | texto | nome lógico e GUID |
| `cr40f_acao` | memo | JSON `{tipo, campos}` ou vazio |
| `cr40f_decisao` | choice | Pendente, Aprovada, Descartada |
| `cr40f_motivodescarte` | texto 500 | obrigatório ao descartar |
| `cr40f_decididopor` | lookup systemuser | |
| `cr40f_decididoem` | data/hora | |

Limites: `$top` 150 por consulta, `$select` só nos campos usados, sem CPF, RG, conta bancária ou telefone no contexto.

## Fluxo

1. Shell (Manual) ou flow agendado cria `cr40f_agenteexecucao` com status Pendente. Se já houver Pendente/Processando do mesmo agente, o shell reaproveita.
2. Flow **"Agentes | Executar"** (gatilho Create): marca Processando; Switch por agente monta o contexto com consultas fixas; grava `cr40f_contexto`; chama `POST https://api.anthropic.com/v1/messages` (`anthropic-version: 2023-06-01`, chave em `new_AnthropicApiKey`, entradas e saídas seguras, retry exponencial 2x, timeout PT110S); valida a resposta contra o schema e contra os tipos e ações permitidos do agente; grava resposta, tokens, modelo e resumo; cria as propostas; marca Concluida.
3. Qualquer falha cai no escopo de erro: status Erro, `cr40f_erro` com motivo (tempo esgotado, HTTP com mensagem, resposta fora do schema, consulta sem permissão). Nunca cria propostas parciais.
4. Flow **"Agentes | Agendado"**: recorrência 07:00 America/Sao_Paulo, dias úteis; cria uma execução Financeiro e uma Pessoas com origem Agendado.
5. Shell faz polling a cada 3 s até Concluida ou Erro; para após 90 s com aviso.
6. Aprovar mostra a prévia da ação, executa `cr40f_acao` via `packages/dataverse` com a sessão do usuário e grava a decisão. Descartar exige motivo.

Guardas: teto diário de 20 execuções por agente (checado no flow, acima disso Erro "limite diário"); o script de provisionamento falha se as variáveis de ambiente não existirem.

## Prompts e schema

Pacote novo `packages/agentes-ia` (TS, espelha `packages/despesas-ia`):

- `src/financeiro.ts`, `src/logistica.ts`, `src/pessoas.ts`: system prompt, `montarContexto(dados)`, `montarTextoUsuario(ctx, pergunta?)`, lista de tipos de proposta e de ações permitidas.
- `src/schema.ts`: schema JSON único de saída.
- `src/validar.ts`: valida resposta contra schema e contra tipos/ações do agente.
- `scripts/gerar-constantes.ts`: gera `constantes.json` consumido pelo script de provisionamento. O flow nunca tem prompt escrito à mão.
- `scripts/avaliar.ts` + `scripts/casos/*.json`: avaliação offline.

Schema de saída:

```json
{
  "resumo": "string, até 300 caracteres",
  "propostas": [
    {
      "tipo": "enum do agente",
      "titulo": "string",
      "justificativa": "string",
      "prioridade": "alta | media | baixa",
      "registroAlvo": { "entidade": "string", "id": "guid" },
      "acao": { "tipo": "enum", "campos": {} }
    }
  ]
}
```

`acao` é opcional por proposta. Valor fora dos tipos permitidos invalida a execução inteira (status Erro).

Regras comuns do system prompt: pt-BR; afirmar só o que está no contexto; não inventar valores, datas ou nomes; dado ausente vira "sem dado"; no máximo 20 propostas ordenadas por prioridade; nunca citar CPF, RG, conta bancária ou telefone. Ordem da mensagem: contexto estável primeiro, pergunta livre por último, para aproveitar cache de prompt em execuções repetidas.

## Tela no shell

Página `agentes` em `apps/shell/src/pages/agentes/`, rota `#agentes?agente=financeiro|logistica|pessoas`. Entrada "Assistente" no menu dos grupos Operacional (Logística), Financeiro e Cadastros/Pessoas. Mesmo componente, três entradas.

Layout com `PageLayout` e primitives, tema claro, `#FCFCFB` em listas e cabeçalhos, Design System obrigatório:

- **Cabeçalho**: nome do agente, última execução (data, origem, tokens), botão "Analisar agora", campo "Pergunta" (Enter envia).
- **Resumo**: texto `resumo` da IA.
- **Propostas**: cards agrupados por prioridade com título, justificativa, link para o registro alvo, botões Aprovar e Descartar. Aprovar mostra a prévia do que será gravado antes de executar. Após decisão o card fica neutro com quem decidiu e quando.
- **Histórico**: últimas 10 execuções, expansíveis com propostas e decisões.

Estados: carregando (skeleton só durante a execução, "Analisando… ~15 s"), vazio ("Nenhuma proposta para hoje"), erro (mensagem do flow e "Tentar de novo"). Versão de build no canto como nas outras telas.

Permissões: a página aparece só para quem lê `cr40f_agenteexecucao`; Aprovar falha de forma visível quando o usuário não pode gravar o alvo, porque a escrita usa a sessão dele.

## Custo (estimativa)

| Item | Valor |
|---|---|
| Por execução (~8k tokens de entrada, ~1,5k de saída, Opus 5.5 a US$ 4/20 por MTok) | ≈ US$ 0,06 |
| 3 agentes × ~30 execuções/dia × 22 dias | ≈ 2.000 execuções/mês |
| API por mês | ≈ US$ 120 (≈ R$ 680) |

Infra: incluída na licença premium já usada. Medição real pelos campos de tokens.

## Testes e verificação

1. **Unitário** (`packages/agentes-ia`, vitest): contexto por agente com fixtures (remove campos sensíveis, respeita janela e limite); validação aceita resposta boa e rejeita tipo/ação fora da lista; `constantes.json` determinístico. Sem chamada paga.
2. **Avaliação offline**: 5 a 10 casos rotulados por agente; roda uma vez por mudança de prompt, imprime acerto por tipo e custo. Só com `ANTHROPIC_API_KEY` local, nunca no CI.
3. **Shell** (vitest + testing-library): quatro estados; polling para em Concluida/Erro; Aprovar só grava após confirmação; Descartar exige motivo.
4. **DEV**: script de provisionamento cria tabelas, variáveis e flows e confere lendo de volta (`secureData`, retry, timeout, constantes). Depois: uma execução manual por agente, conferência das propostas contra dados reais, uma aprovação e um descarte por agente, um erro forçado (chave inválida) visível na tela.
5. **Pronto**: três agentes com execução Concluida no DEV, decisões gravadas, custo por execução até US$ 0,10, build do shell publicado com versão informada.

## Fora do escopo

Autonomia (gravar sem aprovação), WhatsApp da Débora, estudo Jev + agendamento@bet, Teams, PROD. Cada um vira spec própria quando for a vez.
