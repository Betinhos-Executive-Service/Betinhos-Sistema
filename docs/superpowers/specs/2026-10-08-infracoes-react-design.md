# Infrações de Trânsito em React — design

**Data:** 08/10/2026 · **Status:** escolhas do Renan em conversa · **Escopo:** rota `#/infracoes` no shell, no lugar da lista nativa `cr40f_infracaodetransito` (grupo Cadastros).

## 1. Decisões

- Infração = item do catálogo do CTB (código, descrição, enquadramento, gravidade, pontos, valor). É o lookup `_cr40f_codigodainfracao_value` das multas (`cr40f_multas`).
- Escopo: catálogo + uso. Lista com busca e filtros; ficha com as multas que usaram a infração.
- Edição: criar, editar e inativar/reativar (`statecode`/`statuscode`). Sem excluir: multas antigas continuam apontando para a infração.
- Fora do escopo: importar tabela do CTB, editar multas (continuam no Painel da Frota), ações em lote.

## 2. Schema (metadata de DEV, 08/10/2026 — 236 registros, códigos únicos)

| Coluna | Tipo | Uso |
|---|---|---|
| `cr40f_infracaodetransitoid` | id | |
| `cr40f_codigodainfracao` | texto 850 (nome primário) | código, obrigatório e único na tela |
| `cr40f_descricaodainfracao` | texto 4000 | descrição, obrigatória na tela |
| `cr40f_enquadramentonoctb` | texto 4000 | artigo do CTB |
| `cr40f_gravidadedainfracao` | choice | Leve (0), Média (1), Grave (2), Gravíssima (3) |
| `cr40f_pontosnacnh` | inteiro | 0–21 |
| `cr40f_valordamulta` | moeda | BRL |
| `cr40f_competencia` | **multi-choice**, obrigatório | Municipal (202410000), Rodoviário (202410001), Estadual (202410002) |
| `cr40f_responsabilidade` | choice, obrigatório | Condutor (0), Proprietário (1) |
| `statecode`/`statuscode` | estado | Ativo (0/1), Inativo (1/2) |

Rótulos fixos no código (lidos da metadata acima); `metadata.choices` do pacote só cobre choice simples.

## 3. Uso nas multas

Carga única das multas ativas com infração (`$filter=_cr40f_codigodainfracao_value ne null`): título, data, status, placa, motorista. Índice por infração: total, últimos 12 meses e última ocorrência. Coluna "Multas" na lista, filtro "Só com multas" e lista na ficha (30 mais recentes). Falha nessa carga não derruba o catálogo: aviso próprio.

## 4. Busca e filtros

Busca local por código, descrição e enquadramento (sem acento e caixa). Filtros: gravidade (múltipla), competência, responsabilidade, situação (Ativas — padrão, Inativas, Todas) e "Só com multas". Ordem por código.

## 5. Formulário

Drawer com seções: Identificação (código*, enquadramento, descrição*), Penalidade (gravidade, pontos, valor) e Aplicação (competência*, responsabilidade*). Ao escolher a gravidade com pontos vazios, sugere os pontos do CTB (3/4/5/7). Valor aceita `1.467,35`. Grava só o que mudou. Código repetido bloqueia. Fechar com alteração pede "Descartar alterações?"; durante o salvamento não fecha.

Inativar pede confirmação e informa quantas multas usam a infração; reativar é direto.

## 6. Layout e aceite

Molde de Pessoas: `PageLayout` (Cadastros › Infrações de trânsito, contador, "Nova infração"), `PageToolbar filters`, tabela paginada em 50 com clique na linha, cartões abaixo de 820 px, ficha em `Drawer wide`. Aceite: lista, busca e filtros em mock e DEV; ficha com uso; criar, editar, inativar e reativar refletem na lista; testes e typecheck verdes; 320 px sem rolagem horizontal.
