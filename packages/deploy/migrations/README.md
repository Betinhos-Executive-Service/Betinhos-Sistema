# Migrations de schema (DEV)

Tabela, coluna ou choice novos, alterados ou removidos entram por uma migration neste diretório. O workflow Deploy aplica no DEV
(conta de serviço) tudo o que foi adicionado desde a tag `schema-dev-publicado`, antes de publicar a tela e os plugins. O PROD recebe
o schema pelas soluções (`publicar.yml`), como qualquer outra mudança. Ninguém roda script de schema à mão.

## Regras
- Nome: `AAAAMMDD-HHMM-descricao.ps1` (data e hora, não número sequencial: PRs paralelos não colidem). Rodam em ordem de nome.
- Primeira linha útil: `param([string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/", [switch] $Apply)`, depois
  `. "$PSScriptRoot\_dv.ps1"` e `Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)`. Sem `-Apply` é dry-run (só diz o que faria).
- Idempotente: confere o que existe antes de criar. Aditiva por padrão. Só DEV (`Connect-Dv` recusa outro host).
- Tem BOM UTF-8 (o Deploy usa Windows PowerShell 5.1) e comentários em ASCII.
- Coluna ou tabela nova: crie, depois `Add-ComponenteNaSolucao <MetadataId> <tipo>` (AppBetinhos) e `Publish-Tabela`. O Deploy distribui nas 4 soluções no fim.
- **Migration publicada é imutável**: não edite, renomeie nem apague uma que já está na base. O CI reprova. Para corrigir, crie outra.
- Schema novo só por migration: o CI reprova `provision-*.ps1` novo que não seja `provision-flow-*`. Flow novo e `sitemap:*` continuam à mão.
- Os `provision-*` antigos ficam como base histórica.

## Remoção (destrutiva)
Remover coluna ou tabela exige as duas coisas:
1. cabeçalho na migration: `# destrutiva: <tabela>[.<coluna>] - <motivo>`;
2. entrada em `remocoes.json`: `{ "alvo": "<tabela>[.<coluna>]", "migration": "<arquivo>.ps1", "decisao": "quem decidiu, quando" }`.

Use `Remove-Coluna` / `Remove-Tabela` do `_dv.ps1` (recusam sem o cabeçalho). No DEV a remoção apaga o componente (sai da AppBetinhos).
No PROD o upgrade das soluções apaga o que saiu delas, e os registros da tabela vão junto.

O CI confere que cada migration com cabeçalho tem entrada em `remocoes.json` e vice-versa. O comparador de fotos
(`solucoes/comparar-fotos.mjs`) trata a **tabela** declarada como informativo (`remocoesDeclaradas`): ela some da foto e a queda
de registros dela não reprova. Tabela não declarada que some continua perda.

Limite: a foto do ambiente guarda registros por tabela e os componentes por id, sem nome de coluna. Uma **coluna** removida que estava
como componente solto da solução (tipo 2, o caso de coluna adicionada com `Add-ComponenteNaSolucao`) aparece em `componentesSumiram`
sem nome e reprova; o comparador não consegue casá-la com `remocoes.json`. Nesse caso, confira o comparacao.json, e se o único sumiço
for a coluna declarada, aprove à mão a publicação (ou inclua o nome da coluna na foto, mudança futura em `foto-ambiente.ps1`).
