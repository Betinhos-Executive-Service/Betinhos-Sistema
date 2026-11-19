# Nota do motorista em tabela (Infleet → Dataverse)

Data: 19/11/2026. Base: `2026-11-19-nota-infleet-app-design.md` (PR #626). Decisões do Renan em 19/11/2026: tabela no lugar da consulta sob demanda, sincronização 1x por dia às 05:00, histórico mês a mês completo sem apagar, 5 comportamentos de condução em colunas e o resto em JSON.

## Por quê
- O App abre a nota na hora: lê o Dataverse, não espera os ~3 s da Infleet.
- O dashboard de gestão (fase seguinte) lê a mesma tabela, sem chamar a Infleet.
- O histórico fica com a Betinhos; a Infleet só responde por período.

## Tabela `new_notamotorista` ("Nota do motorista")
Uma linha por motorista e período. Dona: organização. Entra pela migration `packages/deploy/migrations/AAAAMMDD-HHMM-tabela-nota-motorista.ps1` e chega ao PROD pelas soluções (BetinhosCore).

| Coluna | Tipo | Conteúdo |
|---|---|---|
| `new_name` | texto (primária) | "<nome do motorista> · 90 dias" ou "<nome> · 2026-10" |
| `new_chave` | texto 100, chave alternativa | `<cr40f_funcionariosid>|90d` ou `<id>|2026-10` (upsert idempotente) |
| `new_motorista` | lookup `cr40f_funcionarios` | motorista |
| `new_periodo` | choice | 90 dias (atual, sobrescrita) / Mês |
| `new_mes` | data | 1º dia do mês (só linhas Mês) |
| `new_inicio`, `new_fim` | data | janela consultada (fronteiras 00:00 America/Sao_Paulo) |
| `new_situacao` | choice | Ok / Em formação (km < 50 ou nota nula) |
| `new_nota` | decimal (1 casa) | `generalGrade` |
| `new_km` | decimal (1 casa) | km no período |
| `new_frenagem`, `new_curva`, `new_aceleracao`, `new_velocidade`, `new_motorocioso` | decimal (1 casa) | hardBraking, hardCornering, hardAcceleration, deviceOverspeed, deviceIdle |
| `new_outroscomportamentos` | texto longo | JSON `[{chave, nota}]` dos demais (câmera: celular, fadiga, cinto...) |
| `new_sincronizadoem` | data e hora | última gravação |

- Motorista sem `new_infleetdriverid` não ganha linha.
- Mês sem km não ganha linha. Linha existente nunca é apagada pela sincronização.
- Privilégios: nenhum papel de motorista; leitura para o papel de gestão (o mesmo que lê o dashboard). O plugin grava como SYSTEM.

## Sincronização
- **Custom API `new_SincronizarNotasInfleet`** (unbound, action) no `Betinhos.DriverRecordSharing`, plugin como SYSTEM, token `infleet.token` da `cr40f_segredo`.
  - Entrada opcional `Meses` (inteiro, padrão 2: mês corrente, parcial, e o anterior, que fecha). Carga inicial: rodada única com `Meses` = 24 para trazer tudo o que a Infleet tiver.
  - Lê os funcionários ativos com `new_infleetdriverid` e consulta a Infleet em lotes de vários motoristas por chamada GraphQL (aliases), para 23 motoristas caberem folgado no limite de 2 min do plugin.
  - Faz upsert pela `new_chave`: a linha 90 dias e as linhas Mês da janela.
  - Resposta `new_Result` em JSON: motoristas lidos, linhas gravadas e falhas, só com ids, sem token.
  - Falha de um motorista não para os outros.
- **Flow "Infleet - Sincronizar notas dos motoristas"**, novo: recorrência diária às 05:00 America/Sao_Paulo, chama a Custom API e manda e-mail de alerta se houver falha, no molde de `provision-flow-carro-atual.ps1`.
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
- Uma mudança de critério da Infleet altera notas passadas só dentro da janela de `Meses`; os meses mais antigos ficam congelados. É desejável, porque preserva o histórico.
- Flow novo nasce na conta de serviço: o dono e a conexão seguem o passo manual de sempre.

## Verificação
- Testes do plugin, com a Infleet falsa:
  - lotes;
  - upsert idempotente, rodando duas vezes sem duplicar;
  - mês sem km fica sem linha;
  - falha parcial.
- DEV: carga com `Meses` = 24, conferindo as linhas por motorista. Depois o App abre a nota em menos de 1 s com o dado da tabela.
- Skill `verificar-minha-nota` atualizada; skill nova `verificar-nota-motorista-sync`.
