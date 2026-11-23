# Nota do motorista em tabela (Infleet → Dataverse)

Data: 19/11/2026. Base: `2026-11-19-nota-infleet-app-design.md` (PR #626). Decisões do Renan em 19/11/2026: tabela no lugar da consulta sob demanda, sincronização 1x por dia às 05:00, histórico completo sem apagar (dia a dia e mês a mês; nota do dia pedida em 19/11 e confirmada na Infleet), 5 comportamentos de condução em colunas e o resto em JSON.

## Por quê
- O App abre a nota na hora: lê o Dataverse, não espera os ~3 s da Infleet.
- O dashboard de gestão (fase seguinte) lê a mesma tabela, sem chamar a Infleet.
- O histórico fica com a Betinhos; a Infleet só responde por período.

## Tabela `new_notamotorista` ("Nota do motorista")
Uma linha por motorista e período. Dona: organização. Entra pela migration `packages/deploy/migrations/AAAAMMDD-HHMM-tabela-nota-motorista.ps1` e chega ao PROD pelas soluções (BetinhosCore).

| Coluna | Tipo | Conteúdo |
|---|---|---|
| `new_name` | texto (primária) | "<nome do motorista> · 90 dias", "<nome> · 2026-10" ou "<nome> · 2026-11-18" |
| `new_chave` | texto 100, chave alternativa | `<cr40f_funcionariosid>|90d`, `<id>|2026-10` ou `<id>|2026-11-18` (upsert idempotente) |
| `new_motorista` | lookup `cr40f_funcionarios` | motorista |
| `new_periodo` | choice | 90 dias (atual, sobrescrita) / Mês / Dia |
| `new_data` | data | dia (linhas Dia) ou 1º dia do mês (linhas Mês); vazio na 90 dias |
| `new_inicio`, `new_fim` | data | janela consultada (fronteiras 00:00 America/Sao_Paulo) |
| `new_situacao` | choice | Ok / Em formação (km < 50 ou nota nula) |
| `new_nota` | decimal (1 casa) | `generalGrade` |
| `new_km` | decimal (1 casa) | km no período |
| `new_frenagem`, `new_curva`, `new_aceleracao`, `new_velocidade`, `new_motorocioso` | decimal (1 casa) | hardBraking, hardCornering, hardAcceleration, deviceOverspeed, deviceIdle |
| `new_outroscomportamentos` | texto longo | JSON `[{chave, nota}]` dos demais (câmera: celular, fadiga, cinto...) |
| `new_sincronizadoem` | data e hora | última gravação |

- Motorista sem `new_infleetdriverid` não ganha linha.
- Dia ou mês sem km não ganha linha. Dia com km mas sem nota (a Infleet devolve nula abaixo de ~50–60 km) ganha linha "Em formação", com o km. Linha existente nunca é apagada pela sincronização.
- Privilégios: nenhum papel de motorista; leitura para o papel de gestão (o mesmo que lê o dashboard). O plugin grava como SYSTEM.

## Sincronização
- **Custom API `new_SincronizarNotasInfleet`** (unbound, action) no `Betinhos.DriverRecordSharing`, plugin como SYSTEM, token `infleet.token` da `cr40f_segredo`.
  - Entrada opcional `Meses` (inteiro, padrão 2: mês corrente, parcial, e o anterior, que fecha). Carga inicial: rodada única com `Meses` = 24 para trazer tudo o que a Infleet tiver.
  - Lê os funcionários ativos com `new_infleetdriverid` e consulta a Infleet em lotes de 15 períodos por chamada GraphQL (aliases). Medido em 19/11/2026: a Infleet recusa complexidade acima de 300 (19 por período com os 16 campos, então 15 cabem) e cada chamada cheia leva ~3,3 s. A rodada diária (23 motoristas × 6 períodos ≈ 10 chamadas) fica em ~35 s, dentro dos 2 min do plugin.
  - Entrada opcional `Ate` (data, padrão ontem em São Paulo): com `Ate` informado, não grava a linha 90 dias (uso da carga retroativa).
  - Para antes de 100 s de execução e devolve `incompleto: true` com o que já gravou, em vez de estourar o limite e perder a transação.
  - Entrada opcional `Dias` (inteiro, padrão 3: ontem e os dois anteriores, para pegar dado que a Infleet recebe atrasado).
  - Faz upsert pela `new_chave`: a linha 90 dias, as linhas Mês e as linhas Dia da janela.
  - Carga inicial: `packages/deploy/carga-notas-infleet.ps1` (à mão; DEV, e PROD só com pedido do Renan) chama a Custom API para trás em janelas de 15 dias (`Ate`, `Dias` = 15, `Meses` = 0; 23 motoristas × 15 = 23 chamadas ≈ 76 s) e, a cada mês fechado, uma chamada com `Meses` = 1 e `Dias` = 0. Para depois de 2 meses seguidos sem linha gravada ou em 36 meses. A Infleet tem histórico de mais de 2 anos, então a carga leva cerca de 1 h.
  - Resposta `new_Result` em JSON: motoristas lidos, linhas gravadas e falhas, só com ids, sem token.
  - Falha de um motorista não para os outros.
- **Flow "Infleet - Sincronizar notas dos motoristas"**, novo: recorrência diária às 05:00 America/Sao_Paulo, chama a Custom API e termina Failed se a chamada falhar, houver falha de motorista ou a rodada ficar incompleta. Sem e-mail (decisão do Renan, 19/11/2026): a falha aparece no histórico do flow e no plantão de erros.
  - Flow novo continua à mão: `provision-flow-nota-motorista.ps1`, rodado do checkout principal na `develop`.

## App Motoristas
- `new_NotaInfleet` passa a ler a tabela, não a Infleet. O contrato JSON continua o mesmo (`schema` 1), então a tela não muda de estrutura. Entram dois campos:
  - `sincronizadoEm`: a tela mostra "Atualizada em dd/mm às HH:mm". Isso resolve o achado da revisão sobre nota antiga mostrada como atual.
  - comportamentos: os 5 de condução sempre aparecem, e os de câmera só quando ficam abaixo de 100.
- Sem linha 90 dias: o motorista com `new_infleetdriverid` vê "em formação" com 0 km; sem id, vê "sem cadastro", como hoje.
- O cache no aparelho continua, e a validade cai de 6 h para 1 h, porque a leitura agora é rápida.
- A grade do Início deixa de pesar na Infleet: passa a ser uma leitura do Dataverse.

## Fora do escopo
- Dashboard de gestão: fase seguinte, lendo `new_notamotorista`. O `scoreMotoristas` atual do dashboard continua como está.
- Ranking entre motoristas.

## Riscos
- O histórico da Infleet pode não chegar a 24 meses: meses vazios simplesmente não geram linha.
- Volume: ~23 motoristas × 365 dias ≈ 8,4 mil linhas por ano; sem problema para o Dataverse.
- A nota do dia oscila muito (ex.: 19,8 → 46,9 → 44,5 em três dias seguidos): o App continua mostrando a de 90 dias; a do dia é para histórico e dashboard.
- Uma mudança de critério da Infleet altera notas passadas só dentro da janela de `Meses`; os meses mais antigos ficam congelados. É desejável, porque preserva o histórico.
- Flow novo nasce na conta de serviço: o dono e a conexão seguem o passo manual de sempre.

## Verificação
- Testes do plugin, com a Infleet falsa:
  - lotes;
  - upsert idempotente, rodando duas vezes sem duplicar;
  - dia/mês sem km fica sem linha; dia com km e nota nula vira "Em formação";
  - falha parcial.
- DEV: carga com `Meses` = 24 e carga diária, conferindo as linhas por motorista contra uma consulta avulsa na Infleet de 3 dias. Depois o App abre a nota em menos de 1 s com o dado da tabela.
- Skill `verificar-minha-nota` atualizada; skill nova `verificar-nota-motorista-sync`.
