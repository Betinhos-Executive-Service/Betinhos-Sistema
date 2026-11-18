# Multas, fase 3: plano de implementação (o motorista resolve no app)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementação com subagentes **Sonnet** (nunca Fable); Opus só revisa entre tarefas.

**Goal:** O motorista com aditivo recebe a multa no app, assina o termo (que vale como o aviso da etapa 2), contesta, declara o aceite da CNH Digital e acompanha a multa até a última parcela; o termo passa a obedecer ao passo a passo da fase 1.

**Architecture:** As regras continuam na classe pura `MultaEtapas` (C#) com espelho em TS e o fixture de paridade. O termo deixa de gravar status: `new_AssinarTermoMulta` e `new_ContestarTermoMulta` chamam `cr40f_PassoMulta` com os passos internos `TermoAssinado`/`TermoContestado`, que só valem com a API do termo no `ParentContext`. As parcelas nascem só no Acertar, presas aos números do termo assinado. O app lê tudo por uma Custom API de leitura (`new_MinhasMultas`, como sistema, filtrada pelo motorista do login) e guarda a última carga para o modo offline. O aditivo é gerado em PDF determinístico (MiniPdf) e o arquivo assinado no gov.br é conferido pelo prefixo de bytes e pelo dicionário de assinatura.

**Tech Stack:** C# net462 (plugins Dataverse, xUnit net48), React + TypeScript + Vitest (`apps/shell`, `apps/motoristas`), Power Automate (JSON + PowerShell 5.1), migrations PowerShell (`packages/deploy/migrations`), Node `node:test` (`packages/deploy`).

**Spec:** `docs/superpowers/specs/2026-11-18-multas-fase3-app-design.md` (aprovada). Bases: `2026-11-17-multas-fase1-design.md`, `2026-11-18-rh-descontos-folha-design.md`, `2026-10-22-termo-multa-assinatura-design.md`. Plano anterior com o mesmo padrão: `docs/superpowers/plans/2026-11-17-multas-fase1.md`.

## Global Constraints

- Códigos de `cr40f_multas.cr40f_status` (não mudam): Identificar 202410000, Indicar 202410004, Pagar 202410001, Acertar 202410006, Encerrada 202410005, Recurso 202410002, Descontado (antigo) 202410003, Cancelada 202410007. Canal Senatran 100000000. Responsável Motorista 100000000 / Empresa 100000001.
- `new_termomulta.new_status`: Pendente 100000000, Assinado 100000001, Contestado 100000002, Expirado 100000003, Cancelado 100000004. `new_formapagamento`: Guia 100000000, Folha 100000001. `new_textotermomulta.new_tipo`: Termo 100000000, Aditivo 100000001. Parcela `new_parcelamultafolha.new_status`: Prevista 100000000, Descontada 100000001, Cancelada 100000002.
- "Hoje" = dia de Brasília (`FrotaPendenciasPlugin.ResolverHoje` no Frota, `SaoPaulo()` no termo, `todaySP()` no shell). Datas `yyyy-MM-dd`; competência `yyyy-MM-01`.
- Termo pendente = `cr40f_multas.new_termovigente` aponta para termo com status Pendente (o `Enviar` grava o vigente; `Encerrar` limpa ao cancelar/expirar).
- Envio do termo: só Folha, 1 a 12 parcelas, primeiro mês na janela do RH (`MultaParcelas.Janela`: do mês anterior até 12 meses à frente).
- Expiração do termo pendente: o que vier primeiro entre `new_enviadoem + 7 dias` e `cr40f_dataparaindicar - 3 dias` (00:00 de Brasília).
- Textos novos (literais, iguais no C#, no TS e nos testes):
  - "Aguarde a assinatura do termo ou cancele o termo."
  - "Cancele o termo antes de avisar pelo WhatsApp."
  - "Aguardando o motorista assinar o termo" (próximo passo)
  - "Decidir a contestação do motorista" (próximo passo na etapa 1 com `contestadaEm`)
  - "Conferir o aceite na CNH Digital (motorista declarou em dd/mm)"
  - "O valor pago passou do valor do termo; envie um termo novo ou registre como empresa assume."
  - "O primeiro mês do termo (mm/aaaa) já passou; as parcelas começam em mm/aaaa."
  - "O texto do termo ainda é provisório."
  - "Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu."
  - "Você tem uma multa para resolver no app" (push; nunca valor nem infração)
  - "Sem conexão, tente de novo" (app offline)
- Repositório público: fixtures, mocks e testes só com dados fictícios (nomes com "(fictício)", placas `TST`/`ABC`, CPF `000.000.000-00`, sem e-mail de pessoa, nenhum PDF real assinado, nada de `sig=`).
- Publicação só pelo GitHub (PR para a `develop`). A sessão de implementação nunca roda `pnpm push`, `pnpm wr`, `push:plugin:*`, `sitemap:*`, `provision-*` nem os scripts de registro; schema só por migration nova (migration publicada é imutável). Flow novo nasce à mão uma vez no DEV, do checkout principal na `develop` atualizada.
- Migrations, `provision-flow-*.ps1` e scripts `.ps1` novos: BOM UTF-8, comentários em ASCII, acentos de texto por `$([char]0x..)` (o Deploy usa Windows PowerShell 5.1).
- **Máquina:** testes, builds e Playwright rodam no desktop `renan-H410M-H` (onde a sessão está). Rodar só o projeto tocado: `dotnet test packages/plugins/<Projeto>.Tests --filter <Classe>`, `pnpm --filter shell exec vitest run <arquivo>`, `pnpm --filter motoristas exec vitest run <arquivo>`. Um de cada vez (vitest pesado dá timeout por carga).
- Mudança de UI: print antes/depois no chat (copiar para `~/.t3/userdata/attachments/<nome>.png`), `ux-audit` modo Fluxo no fim (Task 15). Versão de build: o Deploy sobe a versão; o PR não mexe em `package.json` de versão.
- Commits em português, um por tarefa, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Antes do PR: skills `qualidade-antes-do-pr` e `verificacao-manter`.

## Seção 10 da spec, resolvida

1. **Assinatura do gov.br.** No DEV não há PDF assinado real (nenhum funcionário tem `new_aditivoassinatura`), e um real não pode entrar no repo (o certificado leva nome e CPF). Decisão do plano:
   - O assinador do ITI gera PAdES por **atualização incremental**: o arquivo devolvido começa com os bytes exatos do PDF enviado e acrescenta o dicionário `/Type /Sig` com `/ByteRange`. Como o `MiniPdf` é determinístico (sem data nem ID), `new_RegistrarAditivoMotorista` regenera o aditivo do funcionário com o texto vigente e confere `assinado.StartsWith(gerado)`. Não precisa de coluna de hash.
   - Conferências, nesta ordem: PDF (`%PDF-`), até 5 MB, dicionário de assinatura (`/ByteRange` e `/Type /Sig` ou `/Type/Sig`), prefixo. Prefixo diferente: "Este PDF não é o aditivo gerado para este funcionário com o texto vigente. Gere o aditivo de novo e peça a assinatura."
   - Constante `AditivoPdf.ExigirIntegridade = true`. Se a prova manual (Task 15, passo DEV) mostrar que o gov.br reescreve o arquivo, vira `false` num PR de uma linha e fica só o dicionário (como a spec prevê).
   - Testes com fixture sintético montado no próprio teste: gerado + `"\n% assinatura\n<< /Type /Sig /ByteRange [0 10 20 30] >>\n%%EOF\n"`.
2. **Aviso ao gestor.** Recomendação: o flow "Termo de multa | Aviso ao gestor" fica só para **Contestado** (pede ação imediata; o motorista devolveu a multa); Assinado sai, porque agora aparece no drawer e o próximo passo do e-mail diário já muda. Task 8 implementa a recomendação; se o Renan decidir manter os dois, a Task 8 pula o passo 3. **Decisão pendente no card do resumo.**
3. **Prazo após contestação.** O `PrazoVencido` já vale na etapa 1. Regras novas:
   - a expiração em `dataParaIndicar - 3` deixa pelo menos 3 dias entre a contestação e o vencimento;
   - com `contestadaEm` preenchida e prazo vencido, o "indicou" exige escolher o motorista ("Escolha o motorista que foi indicado."), como se não houvesse responsável;
   - os dois desfechos do `PrazoVencido` e o `DefinirResponsavel` limpam `contestadaEm`;
   - o e-mail diário põe "Contestadas pelo motorista" logo depois de "Prazo vencido"; a contestada com prazo vencido fica só em "Prazo vencido".

## Decisões do plano (não estavam na spec)

- `MultaEstado` ganha: `contestadaEm`, `aceiteDeclaradoEm` (lidos da multa), `termoPendente` (bool), `termoParcelas`, `termoPrimeiroMes`, `termoValor` (lidos do termo vigente; os três últimos só quando ele está Assinado e é Folha). `MultaSituacao` ganha `aguardandoTermo`.
- Passos internos `TermoAssinado` (exige `AvisarMotorista` como primeiro pendente; grava `dataAviso` = data da assinatura) e `TermoContestado` (exige etapa 2 sem aviso; status Identificar e `contestadaEm` = hoje). O `cr40f_PassoMulta` recusa os dois sem `new_AssinarTermoMulta`/`new_ContestarTermoMulta` no `ParentContext`: "Este passo é registrado pelo termo do motorista."
- `PrazoVencido` respondido cancela o termo pendente (status Cancelado e `new_termovigente` limpo), dentro do `cr40f_PassoMulta` (que já está na lista `Apis` da trava do termo).
- A trava da multa aceita `cr40f_aceitedeclaradoem` vindo de `new_DeclararAceiteMulta` e `cr40f_ultimolembreteaceiteem` vindo de `new_LembrarAceiteMulta`; o resto continua só pelo `cr40f_PassoMulta`.
- `Enviar` também recusa quando faltam menos de 3 dias para o prazo de indicação: "Faltam menos de 3 dias para o prazo de indicação; avise pelo WhatsApp."
- O texto do termo ganha os marcadores `{datahora}`, `{local}`, `{auto}` e `{primeiromes}`; `{valor}` é o valor da guia.
- Push do aceite em indicação +2, +4 e +6 dias (no máximo 3), contados pela distância de `cr40f_ultimolembreteaceiteem` à indicação, sem coluna de contador.
- `new_MinhasMultas` mostra só multas da etapa 2 em diante (mais as contestadas na etapa 1) com `cr40f_motorista` = motorista do login e responsável diferente de Empresa; encerradas e canceladas dos últimos 12 meses.

## File Structure

**Schema e textos**
- Create `packages/deploy/migrations/20261119-0900-multas-fase3.ps1`: 3 colunas de data em `cr40f_multas`, `MaxValue` 12 em `new_termomulta.new_parcelas`.
- Create `docs/multas/termo-v1.md`, `docs/multas/aditivo-v1.md`: textos do Apêndice A.
- Create `packages/deploy/gravar-texto-termo.ps1`: grava/vigora os textos v1.

**Regras (`Cr40f.Frota.Plugin`)**
- Modify `MultaEtapas.cs`: estado, passos internos, regras novas.
- Modify `MultaRepository.cs`: colunas novas, termo vigente, gravação de `contestadaEm`.
- Modify `PassoMultaPlugin.cs`: carga do termo, passos internos, parcelas com `new_termo`, cancelamento do termo no `PrazoVencido`.
- Modify `MultaTravaPlugin.cs`: campos novos e as duas APIs do termo.
- Modify `MultasDoDia.cs`: seção "Contestadas pelo motorista" e aceite declarado no topo.
- Modify tests `Cr40f.Frota.Plugin.Tests/{Fixtures/multa-etapas.json, ParidadeMultaTests.cs, PassoMultaTests.cs, MultaTravaTests.cs, MultasDoDiaTests.cs}`.
- Modify `apps/shell/src/pages/frota/domain/multaEtapas.ts` (+ `multaEtapas.test.ts`): espelho.

**Termo (`Betinhos.DriverRecordSharing`)**
- Modify `TermoMultaCommandPlugin.cs`: `Enviar`, `Assinar`, `Contestar`, `Encerrar` (expiração), `Lembrar` (automático), APIs novas.
- Create `MinhasMultas.cs`: montador puro da lista do app.
- Create `AditivoPdf.cs`: geração determinística e conferência do arquivo assinado.
- Create `TermoPrazos.cs`: expiração, lembretes do termo e do aceite (puros).
- Tests `Betinhos.DriverRecordSharing.Tests/{TermoMultaCommandPluginTests.cs, MinhasMultasTests.cs, AditivoPdfTests.cs, TermoPrazosTests.cs}`.
- Create `packages/plugins/scripts/register-multas-fase3-customapis.ps1`.

**Flows (`packages/deploy`)**
- Modify `provision-flow-termo-multa.ps1`: expirar todos os pendentes, lembrete automático e do aceite, aviso ao gestor só Contestado.
- Create `flows/multa-aceite-push.json`; Modify `flows-dev.mjs` (+ teste).
- Modify `flows/multas-do-dia.json`: seção nova.

**Shell**
- Modify `pages/frota/domain/termoMulta.ts` (+ teste), `pages/frota/domain/multaEstado.ts`, `pages/frota/data/{types.ts, mappers.ts, dataverse.ts, mock.ts, source.ts}`.
- Modify `pages/frota/components/MultaPassoAPasso.tsx` (+ teste); Modify `TermoMultaPanel.tsx` (vira `AvisoPorTermo`, + teste).
- Modify `pages/funcionarios/components/AditivoAssinatura.tsx` (+ teste), `pages/funcionarios/data/{types.ts, dataverse.ts, mock.ts}`.

**App Motoristas**
- Create `apps/motoristas/src/features/termos/minhasMultas.ts` (+ `tests/minhasMultas.test.ts`), `MinhasMultasScreen.tsx`, `AceiteCnhCard.tsx`; Modify `rotas.tsx`, `useTermosMulta.ts`, `App.tsx` (badge), `app/tourChapters.ts`, `termos.css`.

**Skills**
- Modify `.claude/skills/verificar-multas/SKILL.md`, `verificar-termo-multa/SKILL.md`, `verificar-app-termo-multa/SKILL.md` (se existir; senão criar com `verificacao-criar`).

---

### Task 1: Migration e textos v1

**Files:**
- Create: `packages/deploy/migrations/20261119-0900-multas-fase3.ps1`
- Create: `docs/multas/termo-v1.md`, `docs/multas/aditivo-v1.md`
- Create: `packages/deploy/gravar-texto-termo.ps1`
- Test: `node packages/deploy/migrations-ci.mjs` (o CI das migrations) e dry-run no DEV

**Interfaces:**
- Produces: colunas `cr40f_contestadaem`, `cr40f_aceitedeclaradoem`, `cr40f_ultimolembreteaceiteem` (DateOnly, `DateTimeBehavior = DateOnly`) em `cr40f_multas`; `new_termomulta.new_parcelas` com `MaxValue = 12`; registros `new_textotermomulta` versão `v1` (Termo e Aditivo) vigentes.

- [ ] **Step 1: Escrever a migration** (BOM UTF-8; copiar o cabeçalho de `20261116-1400-prova-midia.ps1`)

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)
# Multas fase 3 (spec 2026-11-18-multas-fase3-app-design.md, secao 4). Tres datas em cr40f_multas e o limite de
# parcelas do termo de 3 para 12. Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function Dia([string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = (Label $Nome)
    Description = (Label $Desc); RequiredLevel = @{ Value = "None" }; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" } }
}
$multa = "cr40f_multas"
$colunas = @(
  (Dia "cr40f_ContestadaEm" "Contestada em" "Motorista respondeu N$([char]0xE3)o concordo no termo; limpa quando o respons$([char]0xE1)vel $([char]0xE9) decidido."),
  (Dia "cr40f_AceiteDeclaradoEm" "Aceite declarado em" "Motorista declarou no app que aceitou a indica$([char]0xE7)$([char]0xE3)o na CNH Digital."),
  (Dia "cr40f_UltimoLembreteAceiteEm" "$([char]0xDA)ltimo lembrete do aceite" "Dia do $([char]0xFA)ltimo push do aceite na CNH Digital (m$([char]0xE1)ximo 3).")
)
foreach ($c in $colunas) {
  $nome = $c.SchemaName.ToLowerInvariant()
  if (Get-Coluna $multa $nome) { Write-Step "ja existe $multa.$nome"; continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria $multa.$nome"; continue }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$multa')/Attributes" $c | Out-Null
  Write-Step "criada $multa.$nome"
}

$parcelas = Get-Coluna "new_termomulta" "new_parcelas"
if (-not $parcelas) { throw "new_termomulta.new_parcelas nao existe; rode a base do termo antes." }
if ($parcelas.MaxValue -ge 12) { Write-Step "new_termomulta.new_parcelas ja aceita 12" }
elseif (-not $Apply) { Write-Step "DRY RUN mudaria new_termomulta.new_parcelas MaxValue $($parcelas.MaxValue) -> 12" }
else {
  Invoke-Dv "PUT" "EntityDefinitions(LogicalName='new_termomulta')/Attributes(LogicalName='new_parcelas')/Microsoft.Dynamics.CRM.IntegerAttributeMetadata" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; MetadataId = $parcelas.MetadataId; SchemaName = $parcelas.SchemaName
    LogicalName = "new_parcelas"; AttributeType = "Integer"; Format = "None"; MinValue = 1; MaxValue = 12
    DisplayName = $parcelas.DisplayName; RequiredLevel = $parcelas.RequiredLevel
  } -Headers @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  Write-Step "new_termomulta.new_parcelas MaxValue = 12"
}
if ($Apply) { Add-ComponenteNaSolucao $multa; Publish-Tabela $multa; Publish-Tabela "new_termomulta" }
```

Antes de escrever, abrir `packages/deploy/migrations/_dv.ps1` e conferir a assinatura real de `Get-Coluna` (o que devolve: objeto com `MetadataId`/`MaxValue` ou só existência), de `Invoke-Dv` (se aceita `-Headers`) e de `Add-ComponenteNaSolucao`. Se `Get-Coluna` não devolver a metadata, ler com `Get-Rows "EntityDefinitions(LogicalName='new_termomulta')/Attributes(LogicalName='new_parcelas')/Microsoft.Dynamics.CRM.IntegerAttributeMetadata" "MetadataId,SchemaName,MaxValue,DisplayName,RequiredLevel"`. Adaptar a chamada ao helper real; não criar helper novo em `_dv.ps1`.

- [ ] **Step 2: Rodar o CI das migrations e o dry-run**

Run: `node packages/deploy/migrations-ci.mjs` → Expected: sem erro (migration nova, nome no padrão).
Run (só leitura, conta do Renan): `pwsh -File packages/deploy/migrations/20261119-0900-multas-fase3.ps1` → Expected: três "DRY RUN criaria" e um "DRY RUN mudaria ... 3 -> 12". Sem `-Apply`: quem aplica é o Deploy.

- [ ] **Step 3: Textos v1.** Criar `docs/multas/termo-v1.md` e `docs/multas/aditivo-v1.md` com o texto do Apêndice A da spec, sem o `>` de citação, um parágrafo por linha em branco, e na primeira linha `<!-- versao: v1 -->`. O corpo do termo usa os marcadores `{motorista} {cpf} {placa} {datahora} {local} {infracao} {auto} {valor} {parcelas} {primeiromes}`; o do aditivo, `{motorista} {cpf}`.

- [ ] **Step 4: Script `gravar-texto-termo.ps1`** (BOM UTF-8)

```powershell
param(
  [Parameter(Mandatory)] [string] $EnvironmentUrl,
  [Parameter(Mandatory)] [string] $Versao,
  [switch] $Apply
)
# Grava os textos do termo e do aditivo (docs/multas/termo-<versao>.md e aditivo-<versao>.md) em new_textotermomulta,
# marca os dois como vigentes e desmarca os outros do mesmo tipo. Idempotente: texto igual nao regrava.
# Os registros nao vao nas solucoes: no PROD roda a mao na virada. Sem -Apply so mostra o que faria.
. "$PSScriptRoot\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)
$raiz = Resolve-Path "$PSScriptRoot\..\..\docs\multas"
$tipos = @(@{ Arquivo = "termo"; Tipo = 100000000 }, @{ Arquivo = "aditivo"; Tipo = 100000001 })
foreach ($t in $tipos) {
  $caminho = Join-Path $raiz "$($t.Arquivo)-$Versao.md"
  if (-not (Test-Path $caminho)) { throw "Falta $caminho" }
  $texto = ([IO.File]::ReadAllText($caminho, [Text.Encoding]::UTF8) -replace '(?s)^<!--.*?-->\s*', '').Trim()
  $todos = @(Get-Rows "new_textotermomultas" "new_textotermomultaid,new_versao,new_texto,new_vigente" "new_tipo eq $($t.Tipo) and statecode eq 0")
  $atual = $todos | Where-Object { $_.new_versao -eq $Versao } | Select-Object -First 1
  if (-not $Apply) { Write-Step "DRY RUN $($t.Arquivo) $Versao: $(if ($atual) { 'atualizaria' } else { 'criaria' }); desmarcaria $(@($todos | Where-Object { $_.new_vigente -and $_.new_versao -ne $Versao }).Count) vigente(s)"; continue }
  if (-not $atual) {
    Invoke-Dv "POST" "new_textotermomultas" @{ new_name = "$($t.Arquivo) $Versao"; new_versao = $Versao; new_tipo = $t.Tipo; new_texto = $texto; new_vigente = $true } | Out-Null
    Write-Step "criado $($t.Arquivo) $Versao"
  } elseif ($atual.new_texto -ne $texto -or -not $atual.new_vigente) {
    Invoke-Dv "PATCH" "new_textotermomultas($($atual.new_textotermomultaid))" @{ new_texto = $texto; new_vigente = $true } | Out-Null
    Write-Step "atualizado $($t.Arquivo) $Versao"
  } else { Write-Step "$($t.Arquivo) $Versao ja igual e vigente" }
  foreach ($o in @($todos | Where-Object { $_.new_vigente -and $_.new_versao -ne $Versao })) {
    Invoke-Dv "PATCH" "new_textotermomultas($($o.new_textotermomultaid))" @{ new_vigente = $false } | Out-Null
    Write-Step "desmarcado $($t.Arquivo) $($o.new_versao)"
  }
}
```

Conferir em `provision-termo-multa.ps1:280-292` o entity set real (`new_textotermomultas`) e se `new_name` existe; ajustar se diferente.

- [ ] **Step 5: Mapear no Deploy do DEV.** O script não é migration nem flow. Acrescentar ao `deploy.yml`, no job que roda as migrations, logo depois delas, um passo condicional: roda `pwsh -File packages/deploy/gravar-texto-termo.ps1 -EnvironmentUrl $DEV -Versao v1 -Apply` quando `git diff --name-only <tag schema-dev-publicado>..HEAD` tocar `docs/multas/` ou o script. Ler o job atual antes (`grep -n "migrations-dev" .github/workflows/deploy.yml`) e copiar a forma de autenticação do passo das migrations.

- [ ] **Step 6: Commit**

```bash
git add packages/deploy/migrations/20261119-0900-multas-fase3.ps1 packages/deploy/gravar-texto-termo.ps1 docs/multas .github/workflows/deploy.yml
git commit -m "feat(multas): schema da fase 3 e textos v1 do termo e do aditivo"
```

---

### Task 2: Regras novas em `MultaEtapas` (C#), fixture e espelho TS

**Files:**
- Modify: `packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs`
- Modify: `packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json`
- Modify: `packages/plugins/Cr40f.Frota.Plugin.Tests/ParidadeMultaTests.cs` (só se `CasoAvaliacao` precisar de `aguardandoTermo`)
- Modify: `apps/shell/src/pages/frota/domain/multaEtapas.ts`, `multaEtapas.test.ts`

**Interfaces:**
- Produces (C# e TS com os mesmos nomes JSON):
  - `MultaEstado`: `contestadaEm?: string`, `aceiteDeclaradoEm?: string`, `termoPendente?: bool`, `termoParcelas?: int`, `termoPrimeiroMes?: string` (`yyyy-MM-01`), `termoValor?: decimal`.
  - `MultaSituacao.aguardandoTermo: bool` (`Order = 8`).
  - `Passos.TermoAssinado = "TermoAssinado"`, `Passos.TermoContestado = "TermoContestado"`, em `Passos.Todos` e em `PASSOS` (TS).
  - `MultaEtapas.MesDoTermo(MultaEstado m, string hoje): string?` / `mesDoTermo(m, hoje): string | null` — competência que o Acertar → folha usa quando há termo assinado (o do termo, ou o mês de hoje se saiu da janela).
  - Campo `contestadaEm` em `Mudancas`.

- [ ] **Step 1: Casos novos no fixture** (acrescentar nas listas existentes; `hoje` do fixture é `2026-11-17`)

Em `avaliacoes`:

```json
{ "nome": "termo pendente aguarda o motorista", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-30", "termoPendente": true }, "etapa": "indicar", "pendentes": ["AvisarMotorista", "RegistrarIndicacao"], "proximoPasso": "Aguardando o motorista assinar o termo", "proximoPrazo": "2026-11-30", "prazoVencido": false, "aguardandoPenalidade": false, "aguardandoTermo": true },
{ "nome": "contestada volta à etapa 1 com rótulo próprio", "multa": { "status": 202410000, "motoristaId": "f1", "responsavel": 100000000, "dataParaIndicar": "2026-11-30", "contestadaEm": "2026-11-16" }, "etapa": "identificar", "pendentes": ["DefinirResponsavel"], "proximoPasso": "Decidir a contestação do motorista", "proximoPrazo": "2026-11-30", "prazoVencido": false, "aguardandoPenalidade": false },
{ "nome": "aceite declarado muda o rótulo", "multa": { "status": 202410004, "dataAviso": "2026-11-10", "dataIndicacao": "2026-11-12", "canal": 100000000, "dataParaIndicar": "2026-11-25", "aceiteDeclaradoEm": "2026-11-14" }, "etapa": "indicar", "pendentes": ["RegistrarAceite"], "proximoPasso": "Conferir o aceite na CNH Digital (motorista declarou em 14/11)", "proximoPrazo": "2026-11-25", "prazoVencido": false, "aguardandoPenalidade": false },
{ "nome": "prazo vencido toma o termo pendente", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-16", "termoPendente": true }, "etapa": "indicar", "pendentes": ["PrazoVencido"], "proximoPasso": "Prazo vencido: responder", "proximoPrazo": "2026-11-16", "prazoVencido": true, "aguardandoPenalidade": false }
```

Em `validacoes`:

```json
{ "nome": "indicação com termo pendente", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-30", "termoPendente": true }, "passo": "RegistrarIndicacao", "dados": { "canal": "senatran", "data": "2026-11-15" }, "erro": "Aguarde a assinatura do termo ou cancele o termo." },
{ "nome": "avisei com termo pendente", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-30", "termoPendente": true }, "passo": "AvisarMotorista", "dados": {}, "erro": "Cancele o termo antes de avisar pelo WhatsApp." },
{ "nome": "termo assinado vale como aviso", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-30", "termoPendente": true }, "passo": "TermoAssinado", "dados": { "data": "2026-11-17" }, "erro": null },
{ "nome": "termo assinado sem data", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-30", "termoPendente": true }, "passo": "TermoAssinado", "dados": {}, "erro": "Informe a data da assinatura." },
{ "nome": "termo assinado depois do aviso", "multa": { "status": 202410004, "dataAviso": "2026-11-10", "dataParaIndicar": "2026-11-30" }, "passo": "TermoAssinado", "dados": { "data": "2026-11-17" }, "erro": "Este passo não vale para a etapa atual da multa. Recarregue a tela." },
{ "nome": "termo contestado na etapa 2", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-30", "termoPendente": true }, "passo": "TermoContestado", "dados": {}, "erro": null },
{ "nome": "termo contestado fora da etapa 2", "multa": { "status": 202410001, "vencimento": "2026-11-30" }, "passo": "TermoContestado", "dados": {}, "erro": "Este passo não vale para a etapa atual da multa. Recarregue a tela." },
{ "nome": "prazo vencido de contestada exige o motorista", "multa": { "status": 202410000, "motoristaId": "f1", "responsavel": 100000000, "dataParaIndicar": "2026-11-16", "contestadaEm": "2026-11-12" }, "passo": "PrazoVencido", "dados": { "indicou": true, "canal": "senatran", "data": "2026-11-15" }, "erro": "Escolha o motorista que foi indicado." },
{ "nome": "acerto com termo: parcelas travadas", "multa": { "status": 202410006, "motoristaId": "f1", "valorPago": 120, "termoParcelas": 3, "termoPrimeiroMes": "2026-12-01", "termoValor": 200 }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12-01", "parcelas": 2 }, "erro": "O motorista assinou 3 parcela(s); o número de parcelas não muda." },
{ "nome": "acerto com termo: mês travado", "multa": { "status": 202410006, "motoristaId": "f1", "valorPago": 120, "termoParcelas": 3, "termoPrimeiroMes": "2026-12-01", "termoValor": 200 }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2027-01-01", "parcelas": 3 }, "erro": "O primeiro mês segue o termo assinado (12/2026)." },
{ "nome": "acerto com termo: mês do termo fora da janela usa o mês atual", "multa": { "status": 202410006, "motoristaId": "f1", "valorPago": 120, "termoParcelas": 2, "termoPrimeiroMes": "2026-08-01", "termoValor": 200 }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-11-01", "parcelas": 2 }, "erro": null },
{ "nome": "acerto com termo: teto", "multa": { "status": 202410006, "motoristaId": "f1", "valorPago": 250, "termoParcelas": 1, "termoPrimeiroMes": "2026-12-01", "termoValor": 200 }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12-01", "parcelas": 1 }, "erro": "O valor pago passou do valor do termo; envie um termo novo ou registre como empresa assume." },
{ "nome": "acerto com termo: empresa assume continua livre", "multa": { "status": 202410006, "motoristaId": "f1", "valorPago": 250, "termoParcelas": 1, "termoPrimeiroMes": "2026-12-01", "termoValor": 200 }, "passo": "RegistrarAcerto", "dados": { "acerto": "empresa", "motivo": "culpa-empresa" }, "erro": null }
```

Em `aplicacoes`:

```json
{ "nome": "termo assinado grava o aviso", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-30", "termoPendente": true }, "passo": "TermoAssinado", "dados": { "data": "2026-11-16" }, "mudancas": ["dataAviso=2026-11-16"] },
{ "nome": "termo contestado volta à etapa 1", "multa": { "status": 202410004, "motoristaId": "f1", "responsavel": 100000000, "dataParaIndicar": "2026-11-30", "termoPendente": true }, "passo": "TermoContestado", "dados": {}, "mudancas": ["contestadaEm=2026-11-17", "status=202410000"] },
{ "nome": "definir responsável limpa a contestação", "multa": { "status": 202410000, "motoristaId": "f1", "responsavel": 100000000, "contestadaEm": "2026-11-16" }, "passo": "DefinirResponsavel", "dados": { "responsavel": "motorista", "motoristaId": "f2" }, "mudancas": ["contestadaEm=", "motoristaId=f2", "status=202410004"] },
{ "nome": "prazo vencido limpa a contestação", "multa": { "status": 202410000, "motoristaId": "f1", "responsavel": 100000000, "dataParaIndicar": "2026-11-16", "contestadaEm": "2026-11-12" }, "passo": "PrazoVencido", "dados": { "indicou": false }, "mudancas": ["contestadaEm=", "motivoEmpresa=100000000", "responsavel=100000001", "status=202410001"] }
```

Antes, abrir `ParidadeMultaTests.cs` e o `multaEtapas.test.ts` e conferir como `mudancas` são formatadas (ordem alfabética? `campo=valor` com `Formatar(null)` = vazio?). Ajustar a ordem/forma dos itens acima ao formato real; os valores não mudam.

- [ ] **Step 2: Rodar a paridade e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter ParidadeMultaTests` → Expected: FAIL (propriedades e passos desconhecidos).
Run: `pnpm --filter shell exec vitest run src/pages/frota/domain/multaEtapas.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar no C#** (`MultaEtapas.cs`)

Em `Passos`:

```csharp
    /// <summary>Internos: só a API do termo chama (cr40f_PassoMulta confere o ParentContext). A tela nunca oferece.</summary>
    public const string TermoAssinado = "TermoAssinado";
    public const string TermoContestado = "TermoContestado";
    public static readonly string[] Todos = { DefinirResponsavel, AvisarMotorista, RegistrarIndicacao, RegistrarAceite, RegistrarPagamento, RegistrarAcerto, PrazoVencido, Cancelar, Recorrer, ResultadoRecurso, ConcluirDesconto, ReabrirDesconto, TermoAssinado, TermoContestado };
```

Em `MultaEstado` (depois de `RecursoPendente`):

```csharp
    [DataMember(Name = "contestadaEm")] public string? ContestadaEm { get; set; }
    [DataMember(Name = "aceiteDeclaradoEm")] public string? AceiteDeclaradoEm { get; set; }
    // Termo vigente, carregado pelo passo (não são colunas da multa).
    [DataMember(Name = "termoPendente")] public bool? TermoPendente { get; set; }
    [DataMember(Name = "termoParcelas")] public int? TermoParcelas { get; set; }
    [DataMember(Name = "termoPrimeiroMes")] public string? TermoPrimeiroMes { get; set; }
    [DataMember(Name = "termoValor")] public decimal? TermoValor { get; set; }
```

Em `MultaSituacao`: `[DataMember(Name = "aguardandoTermo", Order = 8)] public bool AguardandoTermo { get; set; }`.

Em `RotuloPasso`: `[Passos.TermoAssinado] = "Termo assinado"`, `[Passos.TermoContestado] = "Termo contestado"`.

Em `Avaliar`, trocar o bloco `ProximoPasso` por:

```csharp
        s.AguardandoTermo = etapa == Indicar && !s.PrazoVencido && m.TermoPendente == true && m.DataAviso == null;
        s.ProximoPasso = s.AguardandoTermo ? "Aguardando o motorista assinar o termo"
            : s.Pendentes.Count > 0 ? RotuloPendente(m, s.Pendentes[0])
            : s.AguardandoPenalidade ? "Aguardando penalidade"
            : s.Descontando ? "Descontando em folha"
            : etapa == Cancelada ? "Cancelada" : etapa == Encerrada ? "Encerrada" : "";
        return s;
    }

    private static string RotuloPendente(MultaEstado m, string passo)
    {
        if (passo == Passos.DefinirResponsavel && m.ContestadaEm != null) return "Decidir a contestação do motorista";
        if (passo == Passos.RegistrarAceite && m.AceiteDeclaradoEm != null)
            return $"Conferir o aceite na CNH Digital (motorista declarou em {m.AceiteDeclaradoEm.Substring(8, 2)}/{m.AceiteDeclaradoEm.Substring(5, 2)})";
        return RotuloPasso[passo];
    }
```

Em `Validar`, no primeiro `switch` (antes do `if (s.Pendentes.Count == 0)`), acrescentar:

```csharp
            case Passos.TermoAssinado:
                if (s.Etapa != Indicar || m.DataAviso != null) return "Este passo não vale para a etapa atual da multa. Recarregue a tela.";
                return DataRuim(d.Data, hoje, "Informe a data da assinatura.");
            case Passos.TermoContestado:
                return s.Etapa == Indicar && m.DataAviso == null ? null : "Este passo não vale para a etapa atual da multa. Recarregue a tela.";
```

No `case Passos.PrazoVencido`, trocar a última linha por:

```csharp
                // Sem responsável efetivo, ou com a contestação do motorista pendente, a indicação precisa dizer quem foi indicado.
                return (ResponsavelEfetivo(m) == null || m.ContestadaEm != null) && string.IsNullOrWhiteSpace(d.MotoristaId) ? "Escolha o motorista que foi indicado." : null;
```

Logo depois de `if (!s.Pendentes.Contains(passo)) return ...;` e antes da checagem de ordem:

```csharp
        if (m.TermoPendente == true && passo == Passos.RegistrarIndicacao) return "Aguarde a assinatura do termo ou cancele o termo.";
        if (m.TermoPendente == true && passo == Passos.AvisarMotorista) return "Cancele o termo antes de avisar pelo WhatsApp.";
```

Em `ValidarFolha`, depois de `if (string.IsNullOrWhiteSpace(m.MotoristaId)) ...`:

```csharp
        if (m.TermoParcelas is int assinadas)
        {
            if (m.TermoValor is decimal teto && m.ValorPago > teto) return "O valor pago passou do valor do termo; envie um termo novo ou registre como empresa assume.";
            if ((d.Parcelas ?? 1) != assinadas) return $"O motorista assinou {assinadas} parcela(s); o número de parcelas não muda.";
            var mes = MesDoTermo(m, hoje)!;
            return MultaParcelas.Competencia(d.Competencia) == mes ? null : $"O primeiro mês segue o termo assinado ({MultaParcelas.MesBr(mes)}).";
        }
```

E o método público (perto de `Descontando`):

```csharp
    /// <summary>Primeiro mês do Acertar -> folha com termo assinado: o do termo, ou o mês de hoje se ele saiu da janela do RH.</summary>
    public static string? MesDoTermo(MultaEstado m, string hoje)
    {
        if (m.TermoParcelas == null || m.TermoPrimeiroMes == null) return null;
        var (de, ate) = MultaParcelas.Janela(hoje);
        var mes = MultaParcelas.Competencia(m.TermoPrimeiroMes);
        return string.CompareOrdinal(mes, de) < 0 || string.CompareOrdinal(mes, ate) > 0 ? hoje.Substring(0, 7) + "-01" : mes;
    }
```

Conferir em `MultaParcelas` que `Janela(hoje)` devolve `(de, ate)` em `yyyy-MM-01` e que `Competencia` aceita `yyyy-MM-01`. O caso "fora da janela" do fixture usa `2026-08-01` com hoje `2026-11-17`: a janela começa em `2026-10-01`, então o mês esperado é `2026-11-01`.

Em `Aplicar`:

```csharp
            case Passos.DefinirResponsavel:
                n.ContestadaEm = null;
                // (linhas existentes seguem)
            case Passos.TermoAssinado:
                n.DataAviso = d.Data;
                break;
            case Passos.TermoContestado:
                n.ContestadaEm = hoje; n.Status = MultaCodigos.Identificar;
                break;
```

e no `case Passos.PrazoVencido`, antes de `n.Status = MultaCodigos.Pagar;`: `n.ContestadaEm = null;`. (No `DefinirResponsavel`, a linha `n.ContestadaEm = null;` entra antes do `if` existente, sem `break` extra.)

Em `Campos`, acrescentar `("contestadaEm", m => m.ContestadaEm)` depois de `recursoPendente`.

- [ ] **Step 4: Espelhar no TS** (`multaEtapas.ts`), com os mesmos nomes e mensagens:
  - `PASSOS` ganha `'TermoAssinado', 'TermoContestado'`; `ROTULO_PASSO` ganha os dois rótulos.
  - `MultaEstado` ganha `contestadaEm?, aceiteDeclaradoEm?: string | null; termoPendente?: boolean | null; termoParcelas?: number | null; termoPrimeiroMes?: string | null; termoValor?: number | null`.
  - `Situacao` ganha `aguardandoTermo: boolean`.
  - `avaliar`, `validarPasso`, `aplicarPasso`, `mudancas` e `export function mesDoTermo(m: MultaEstado, hoje: string): string | null` com a mesma lógica do Step 3 (`janelaCompetencia(hoje)` e `competenciaDe` já existem; `mesBr` para a mensagem).
  - O teste de paridade lê `aguardandoTermo` com padrão `false` quando o caso não traz a chave (igual ao `descontando`). Se `CasoAvaliacao` no C# não tiver `AguardandoTermo`, acrescentar `[DataMember(Name = "aguardandoTermo")] public bool AguardandoTermo { get; set; }` e o `Assert.Equal`.

- [ ] **Step 5: Rodar os dois lados**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "ParidadeMultaTests|MultaParcelasTests"` → PASS.
Run: `pnpm --filter shell exec vitest run src/pages/frota/domain/multaEtapas.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs packages/plugins/Cr40f.Frota.Plugin.Tests apps/shell/src/pages/frota/domain/multaEtapas.ts apps/shell/src/pages/frota/domain/multaEtapas.test.ts
git commit -m "feat(multas): regras do termo no passo a passo (assinatura, contestação, acerto pelo termo)"
```

---

### Task 3: `cr40f_PassoMulta`, repositório e trava

**Files:**
- Modify: `packages/plugins/Cr40f.Frota.Plugin/MultaRepository.cs`, `PassoMultaPlugin.cs`, `MultaTravaPlugin.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/PassoMultaTests.cs`, `MultaTravaTests.cs` (usar `FakeMundo`/`Contexto` existentes)

**Interfaces:**
- Consumes: `MultaEstado` e `Passos` da Task 2.
- Produces:
  - `MultaMapper.Colunas` com `cr40f_contestadaem`, `cr40f_aceitedeclaradoem`, `new_termovigente`; `MultaMapper.Estado` lê `ContestadaEm`/`AceiteDeclaradoEm`; `Gravacao` grava `contestadaEm` como `DataGravada` (e `null` limpa).
  - `MultaMapper.CarregarTermo(IOrganizationService sistema, Entity linha, MultaEstado e): Guid?` — lê o termo vigente (`new_status, new_formapagamento, new_parcelas, new_primeiracompetencia, new_valortotal`), preenche `TermoPendente` e, se Assinado + Folha, `TermoParcelas/TermoPrimeiroMes/TermoValor`; devolve o id do termo vigente.
  - `PassoMultaPlugin.Executar(..., bool viaTermo = false)`; constantes `PassoMultaPlugin.ApisDoTermo = { "new_AssinarTermoMulta", "new_ContestarTermoMulta" }`.
  - `MultaTravaPlugin.CamposDasApisDoTermo`: `cr40f_aceitedeclaradoem → new_DeclararAceiteMulta`, `cr40f_ultimolembreteaceiteem → new_LembrarAceiteMulta`.

- [ ] **Step 1: Testes que falham** (em `PassoMultaTests.cs`, no estilo dos testes existentes; ler o arquivo antes para reaproveitar `FakeMundo`, a criação de multa e termo e o `hoje`)

```csharp
[Fact]
public void TermoAssinado_fora_da_api_do_termo_e_recusado()
{
    var mundo = new FakeMundo();
    var multa = mundo.Multa(status: MultaCodigos.Indicar, dataParaIndicar: "2026-11-30");
    var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
        PassoMultaPlugin.Executar(mundo.Service, multa, Passos.TermoAssinado, "{\"data\":\"2026-11-17\"}", "2026-11-17"));
    Assert.Equal("Este passo é registrado pelo termo do motorista.", erro.Message);
}

[Fact]
public void TermoAssinado_pela_api_grava_o_aviso()
{
    var mundo = new FakeMundo();
    var termo = mundo.Termo(status: 100000000, forma: 100000001, parcelas: 2, primeiroMes: "2026-12-01", valor: 200m);
    var multa = mundo.Multa(status: MultaCodigos.Indicar, dataParaIndicar: "2026-11-30", termoVigente: termo);
    PassoMultaPlugin.Executar(mundo.Service, multa, Passos.TermoAssinado, "{\"data\":\"2026-11-17\"}", "2026-11-17", viaTermo: true);
    Assert.Equal("2026-11-17", mundo.DataDe(multa, "cr40f_datadeavisoaocondutor"));
}

[Fact]
public void Indicacao_com_termo_pendente_e_recusada()
{
    var mundo = new FakeMundo();
    var termo = mundo.Termo(status: 100000000, forma: 100000001, parcelas: 1, primeiroMes: "2026-12-01", valor: 100m);
    var multa = mundo.Multa(status: MultaCodigos.Indicar, dataParaIndicar: "2026-11-30", termoVigente: termo);
    var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
        PassoMultaPlugin.Executar(mundo.Service, multa, Passos.RegistrarIndicacao, "{\"canal\":\"senatran\",\"data\":\"2026-11-15\"}", "2026-11-17"));
    Assert.Equal("Aguarde a assinatura do termo ou cancele o termo.", erro.Message);
}

[Fact]
public void PrazoVencido_cancela_o_termo_pendente()
{
    var mundo = new FakeMundo();
    var termo = mundo.Termo(status: 100000000, forma: 100000001, parcelas: 1, primeiroMes: "2026-12-01", valor: 100m);
    var multa = mundo.Multa(status: MultaCodigos.Indicar, dataParaIndicar: "2026-11-16", termoVigente: termo);
    PassoMultaPlugin.Executar(mundo.Service, multa, Passos.PrazoVencido, "{\"indicou\":false}", "2026-11-17");
    Assert.Equal(100000004, mundo.Opcao(termo, "new_status"));
    Assert.Null(mundo.Ref(multa, "new_termovigente"));
}

[Fact]
public void Acerto_folha_com_termo_cria_parcelas_com_o_termo()
{
    var mundo = new FakeMundo();
    var termo = mundo.Termo(status: 100000001, forma: 100000001, parcelas: 2, primeiroMes: "2026-12-01", valor: 200m);
    var multa = mundo.Multa(status: MultaCodigos.Acertar, motorista: mundo.Funcionario(), valorPago: 120m, pagaEm: "2026-11-10", termoVigente: termo);
    PassoMultaPlugin.Executar(mundo.Service, multa, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12-01\",\"parcelas\":2}", "2026-11-17");
    var parcelas = mundo.Linhas("new_parcelamultafolha");
    Assert.Equal(2, parcelas.Count);
    Assert.All(parcelas, p => Assert.Equal(termo, p.GetAttributeValue<EntityReference>("new_termo").Id));
}
```

Os helpers `mundo.Multa(...)`, `mundo.Termo(...)`, `mundo.DataDe`, `mundo.Opcao`, `mundo.Ref`, `mundo.Linhas`, `mundo.Funcionario` são ilustrativos: usar os que `FakeMundo` já tem e acrescentar só os que faltarem (`Termo` cria linha `new_termomulta` com as colunas do `CarregarTermo`; `termoVigente` grava `new_termovigente`).

Em `MultaTravaTests.cs`:

```csharp
[Theory]
[InlineData("cr40f_aceitedeclaradoem", "new_DeclararAceiteMulta", 0)]
[InlineData("cr40f_ultimolembreteaceiteem", "new_LembrarAceiteMulta", 0)]
[InlineData("cr40f_aceitedeclaradoem", "new_LembrarAceiteMulta", 1)]
[InlineData("cr40f_contestadaem", "new_DeclararAceiteMulta", 1)]
[InlineData("cr40f_contestadaem", null, 1)]
public void Campos_novos_so_pela_api_certa(string campo, string? pai, int recusas)
{
    var alvo = new Entity(MultaMapper.Tabela, Guid.NewGuid()) { [campo] = new DateTime(2026, 11, 17) };
    var contexto = Contexto.Update(alvo, pre: new Entity(MultaMapper.Tabela, alvo.Id), pai: pai);
    Assert.Equal(recusas, MultaTravaPlugin.Avaliar(contexto, alvo, new FakeService()).Count);
}

[Fact]
public void Assinatura_do_termo_passa_pela_trava_via_passo()
{
    var alvo = new Entity(MultaMapper.Tabela, Guid.NewGuid()) { ["cr40f_datadeavisoaocondutor"] = new DateTime(2026, 11, 17) };
    // new_AssinarTermoMulta > cr40f_PassoMulta > Update: a trava reconhece o passo no meio da cadeia.
    var contexto = Contexto.Update(alvo, pre: new Entity(MultaMapper.Tabela, alvo.Id), pai: "cr40f_PassoMulta", avo: "new_AssinarTermoMulta");
    Assert.Empty(MultaTravaPlugin.Avaliar(contexto, alvo, new FakeService()));
}
```

Ajustar `Contexto.Update` à assinatura real em `Contexto.cs` (acrescentar o parâmetro `avo` se não houver).

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "PassoMultaTests|MultaTravaTests"` → FAIL.

- [ ] **Step 3: Implementar**

`MultaRepository.cs`: acrescentar `"cr40f_contestadaem", "cr40f_aceitedeclaradoem", "new_termovigente"` em `Colunas`; em `Estado`, `ContestadaEm = Dia(e, "cr40f_contestadaem")`, `AceiteDeclaradoEm = Dia(e, "cr40f_aceitedeclaradoem")` (usar o helper de data que `Estado` já usa para `cr40f_aceiteem`); em `Gravacao`, `case "contestadaEm": e["cr40f_contestadaem"] = valor == null ? null : DataGravada((string)valor); break;` seguindo o switch existente. E:

```csharp
    public const string Termo = "new_termomulta";
    public const int TermoPendente = 100000000, TermoAssinado = 100000001, TermoCancelado = 100000004, FormaFolha = 100000001;

    /// <summary>Lê o termo vigente da multa para as regras do termo (Task 2). Devolve o id do termo vigente, ou null.</summary>
    public static Guid? CarregarTermo(IOrganizationService sistema, Entity linha, MultaEstado e)
    {
        var vigente = linha.GetAttributeValue<EntityReference>("new_termovigente");
        if (vigente == null) return null;
        var t = sistema.Retrieve(Termo, vigente.Id, new ColumnSet("new_status", "new_formapagamento", "new_parcelas", "new_primeiracompetencia", "new_valortotal"));
        var status = t.GetAttributeValue<OptionSetValue>("new_status")?.Value;
        e.TermoPendente = status == TermoPendente;
        if (status == TermoAssinado && t.GetAttributeValue<OptionSetValue>("new_formapagamento")?.Value == FormaFolha)
        {
            e.TermoParcelas = t.GetAttributeValue<int?>("new_parcelas");
            e.TermoPrimeiroMes = t.GetAttributeValue<DateTime?>("new_primeiracompetencia")?.ToString("yyyy-MM-01", CultureInfo.InvariantCulture);
            e.TermoValor = t.GetAttributeValue<Money>("new_valortotal")?.Value;
        }
        return vigente.Id;
    }
```

`PassoMultaPlugin.cs`:

```csharp
    public static readonly string[] ApisDoTermo = { "new_AssinarTermoMulta", "new_ContestarTermoMulta" };
```

Em `Execute`, calcular `var viaTermo = MultaTravaPlugin.TemPai(context, ApisDoTermo);` e passar para `Executar(..., viaTermo)`. Em `Executar` (novo parâmetro `bool viaTermo = false`), logo depois de ler `antes`:

```csharp
        if ((passo == Passos.TermoAssinado || passo == Passos.TermoContestado) && !viaTermo)
            throw new InvalidPluginExecutionException("Este passo é registrado pelo termo do motorista.");
        var termoVigente = MultaMapper.CarregarTermo(sistema, linha, antes);
```

Em `CriarParcelas`, receber `Guid? termoId` e, quando `antes.TermoParcelas != null && termoId != null`, gravar `e["new_termo"] = new EntityReference(MultaMapper.Termo, termoId.Value)`. Depois do `service.Update(...)`, cancelar o termo pendente quando o passo for `PrazoVencido`:

```csharp
        if (passo == Passos.PrazoVencido && antes.TermoPendente == true && termoVigente is Guid t)
        {
            sistema.Update(new Entity(MultaMapper.Termo, t) { ["new_status"] = new OptionSetValue(MultaMapper.TermoCancelado) });
            sistema.Update(new Entity(MultaMapper.Tabela, multaId) { ["new_termovigente"] = null });
        }
```

(A trava do termo aceita porque `cr40f_PassoMulta` está em `Apis`; o `new_termovigente` não é campo de passo.)

`MultaTravaPlugin.cs`: `CamposDePasso` ganha `"cr40f_contestadaem", "cr40f_aceitedeclaradoem", "cr40f_ultimolembreteaceiteem"`. Acrescentar:

```csharp
    public static readonly IReadOnlyDictionary<string, string> CamposDasApisDoTermo = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["cr40f_aceitedeclaradoem"] = "new_DeclararAceiteMulta",
        ["cr40f_ultimolembreteaceiteem"] = "new_LembrarAceiteMulta",
    };

    public static bool TemPai(IPluginExecutionContext context, params string[] mensagens)
    {
        for (var pai = context.ParentContext; pai != null; pai = pai.ParentContext)
            if (mensagens.Contains(pai.MessageName)) return true;
        return false;
    }
```

`VemDoPasso` passa a ser `TemPai(context, PassoMultaPlugin.Mensagem)`. No Update, filtrar `mudou` com `.Where(k => !(CamposDasApisDoTermo.TryGetValue(k, out var api) && TemPai(context, api)))` antes de montar a recusa.

- [ ] **Step 4: Rodar**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests` → PASS (todos do projeto: paridade, passo, trava, tarefa e e-mail).

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests
git commit -m "feat(multas): passo da multa lê o termo vigente, aceita a assinatura e a contestação do termo"
```

---

### Task 4: E-mail "Multas de hoje": contestadas e aceite declarado

**Files:**
- Modify: `packages/plugins/Cr40f.Frota.Plugin/MultasDoDia.cs`, `MultaRepository.cs` (`Abertas` traz o termo pendente)
- Modify: `packages/deploy/flows/multas-do-dia.json` (+ `flows/multas-do-dia.test.mjs`)
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/MultasDoDiaTests.cs`

**Interfaces:**
- Consumes: `MultaEstado.ContestadaEm`, `AceiteDeclaradoEm`, `TermoPendente`.
- Produces: `MultasDoDiaResultado.Contestadas` (`[DataMember(Name = "contestadas", Order = 9)]`, `List<LinhaMultaDia>`); `LinhaMultaDia.Declarado` (`[DataMember(Name = "declarado")]`, `bool`).

- [ ] **Step 1: Testes que falham** (em `MultasDoDiaTests.cs`, com o construtor de `MultaResumo` que o arquivo já usa)

```csharp
[Fact]
public void Contestada_vai_para_secao_propria()
{
    var r = MultasDoDia.Montar(new[] { Resumo("A1", new MultaEstado { Status = MultaCodigos.Identificar, MotoristaId = "f1", DataParaIndicar = "2026-11-30", ContestadaEm = "2026-11-16" }) }, "2026-11-17");
    Assert.Single(r.Contestadas);
    Assert.Empty(r.Indicar);
    Assert.Equal("Decidir a contestação do motorista", r.Contestadas[0].Passo);
    Assert.Equal(1, r.Total);
}

[Fact]
public void Contestada_com_prazo_vencido_fica_so_no_prazo_vencido()
{
    var r = MultasDoDia.Montar(new[] { Resumo("A1", new MultaEstado { Status = MultaCodigos.Identificar, MotoristaId = "f1", DataParaIndicar = "2026-11-10", ContestadaEm = "2026-11-08" }) }, "2026-11-17");
    Assert.Single(r.PrazoVencido);
    Assert.Empty(r.Contestadas);
}

[Fact]
public void Aceite_declarado_sobe_para_o_topo()
{
    var senatran = new MultaEstado { Status = MultaCodigos.Indicar, DataAviso = "2026-11-01", DataIndicacao = "2026-11-05", Canal = MultaCodigos.Senatran, DataParaIndicar = "2026-11-20" };
    var declarada = senatran.Copia(); declarada.AceiteDeclaradoEm = "2026-11-15"; declarada.DataParaIndicar = "2026-11-28";
    var r = MultasDoDia.Montar(new[] { Resumo("A1", senatran), Resumo("A2", declarada) }, "2026-11-17");
    Assert.Equal(new[] { "A2", "A1" }, r.Aceite.Select(l => l.Auto));
    Assert.True(r.Aceite[0].Declarado);
}
```

- [ ] **Step 2: Rodar e ver falhar** — `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter MultasDoDiaTests` → FAIL.

- [ ] **Step 3: Implementar.** Em `Montar`, logo depois do `if (s.PrazoVencido) ...`, inserir `else if (s.Etapa == MultaEtapas.Identificar && e.ContestadaEm != null) r.Contestadas.Add(Linha(m, s, prazoPassado));`. `Linha` preenche `Declarado = e.AceiteDeclaradoEm != null`. Ordenar `Contestadas` junto com as outras; e para `Aceite`, ordenar antes por `Declarado` (verdadeiro primeiro) e depois pela regra existente:

```csharp
        r.Aceite.Sort((a, b) => a.Declarado != b.Declarado ? (a.Declarado ? -1 : 1) : Ordem(a, b));
```

(extrair a lambda atual para `private static int Ordem(LinhaMultaDia a, LinhaMultaDia b)` e usá-la nas outras listas). `Total` soma `Contestadas.Count`. Em `MultaRepository.Abertas()`, acrescentar ao `QueryExpression` um `LinkEntity` de `new_termovigente` para `new_termomulta` (`JoinOperator.LeftOuter`, alias `tv`, coluna `new_status`) e, no `MultaResumo.De`, `Estado.TermoPendente = (linha.GetAttributeValue<AliasedValue>("tv.new_status")?.Value as OptionSetValue)?.Value == MultaMapper.TermoPendente`.

- [ ] **Step 4: Flow.** Em `flows/multas-do-dia.json`, abrir onde a seção `Linhas_aceite` é montada (`grep -n "Linhas_aceite\|aceite" packages/deploy/flows/multas-do-dia.json`) e duplicar o bloco para `contestadas` com o título "Contestadas pelo motorista", posicionado logo depois de "Prazo vencido" no corpo do e-mail. Na linha do aceite, acrescentar " · motorista declarou" quando `item()?['declarado']` for `true`. Atualizar `multas-do-dia.test.mjs` (o teste confere a ordem dos títulos) e rodar `node --test packages/deploy/flows/multas-do-dia.test.mjs` → PASS.

- [ ] **Step 5: Rodar** `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter MultasDoDiaTests` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests packages/deploy/flows/multas-do-dia.json packages/deploy/flows/multas-do-dia.test.mjs
git commit -m "feat(multas): e-mail diário com as contestadas e o aceite declarado no topo"
```

---

### Task 5: Prazos puros do termo e do aceite (`TermoPrazos`)

**Files:**
- Create: `packages/plugins/Betinhos.DriverRecordSharing/TermoPrazos.cs`
- Test: `packages/plugins/Betinhos.DriverRecordSharing.Tests/TermoPrazosTests.cs`

**Interfaces:**
- Produces (todos com datas em UTC na entrada e o dia de Brasília calculado dentro):
  - `TermoPrazos.ExpiraEm(DateTime enviadoEmUtc, DateTime? dataParaIndicar): DateTime` — instante UTC da expiração: o menor entre `enviadoEm + 7 dias` e `00:00 de Brasília de (dataParaIndicar - 3 dias)`.
  - `TermoPrazos.Expirou(DateTime enviadoEmUtc, DateTime? dataParaIndicar, DateTime agoraUtc): bool` — `agoraUtc >= ExpiraEm(...)`.
  - `TermoPrazos.PrazoCurtoParaEnviar(DateTime? dataParaIndicar, DateTime hoje): bool` — `dataParaIndicar - hoje < 3 dias` (dias de Brasília; `hoje` já é o dia de Brasília).
  - `TermoPrazos.LembrarTermo(DateTime enviadoEmUtc, DateTime? ultimoLembreteUtc, DateTime? dataParaIndicar, DateTime agoraUtc): bool` — automático: sem lembrete e `agora >= enviado + 2 dias`; ou na véspera da expiração (`agora >= ExpiraEm - 1 dia`) sem lembrete nas últimas 20 h.
  - `TermoPrazos.LembrarAceite(DateTime indicacao, DateTime? ultimoLembrete, DateTime hoje): bool` — `k = ultimoLembrete == null ? 0 : min(3, floor((ultimo - indicacao).Days / 2))`; lembra quando `k < 3` e `(hoje - indicacao).Days >= 2 * (k + 1)`.

- [ ] **Step 1: Testes que falham**

```csharp
using System;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class TermoPrazosTests
    {
        private static DateTime Utc(string s) => DateTime.SpecifyKind(DateTime.Parse(s, System.Globalization.CultureInfo.InvariantCulture), DateTimeKind.Utc);
        private static DateTime Dia(string s) => DateTime.Parse(s, System.Globalization.CultureInfo.InvariantCulture);

        [Fact]
        public void Expira_em_7_dias_quando_o_prazo_e_longe()
            => Assert.Equal(Utc("2026-11-17T12:00:00"), TermoPrazos.ExpiraEm(Utc("2026-11-10T12:00:00"), Dia("2026-12-30")));

        [Fact]
        public void Expira_3_dias_antes_do_prazo_de_indicacao()
            // 00:00 de Brasília de 22/11 = 03:00 UTC.
            => Assert.Equal(Utc("2026-11-22T03:00:00"), TermoPrazos.ExpiraEm(Utc("2026-11-18T12:00:00"), Dia("2026-11-25")));

        [Fact]
        public void Sem_prazo_de_indicacao_vale_os_7_dias()
            => Assert.Equal(Utc("2026-11-25T12:00:00"), TermoPrazos.ExpiraEm(Utc("2026-11-18T12:00:00"), null));

        [Theory]
        [InlineData("2026-11-20", true)]
        [InlineData("2026-11-21", false)]
        public void Prazo_curto_para_enviar(string prazo, bool curto)
            => Assert.Equal(curto, TermoPrazos.PrazoCurtoParaEnviar(Dia(prazo), Dia("2026-11-18")));

        [Theory]
        [InlineData("2026-11-12T11:00:00", null, false)]
        [InlineData("2026-11-12T12:00:00", null, true)]
        [InlineData("2026-11-12T12:00:00", "2026-11-12T12:00:00", false)]
        [InlineData("2026-11-16T12:00:00", "2026-11-12T12:00:00", true)]
        public void Lembrete_do_termo(string agora, string? ultimo, bool lembra)
            => Assert.Equal(lembra, TermoPrazos.LembrarTermo(Utc("2026-11-10T12:00:00"), ultimo == null ? (DateTime?)null : Utc(ultimo), Dia("2026-12-30"), Utc(agora)));

        [Theory]
        [InlineData("2026-11-11", null, false)]
        [InlineData("2026-11-12", null, true)]
        [InlineData("2026-11-13", "2026-11-12", false)]
        [InlineData("2026-11-14", "2026-11-12", true)]
        [InlineData("2026-11-16", "2026-11-14", true)]
        [InlineData("2026-11-20", "2026-11-16", false)]
        public void Lembrete_do_aceite_no_maximo_tres(string hoje, string? ultimo, bool lembra)
            => Assert.Equal(lembra, TermoPrazos.LembrarAceite(Dia("2026-11-10"), ultimo == null ? (DateTime?)null : Dia(ultimo), Dia(hoje)));
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --filter TermoPrazosTests` → FAIL (classe não existe).

- [ ] **Step 3: Implementar**

```csharp
using System;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>Prazos do termo de multa e do lembrete do aceite (spec fase 3, seções 5.2 e 5.4). Puro: sem serviço.</summary>
    public static class TermoPrazos
    {
        public const int DiasParaAssinar = 7, MargemAntesDoPrazo = 3, MaxLembretesAceite = 3;

        public static DateTime ExpiraEm(DateTime enviadoEmUtc, DateTime? dataParaIndicar)
        {
            var seteDias = enviadoEmUtc.AddDays(DiasParaAssinar);
            if (dataParaIndicar == null) return seteDias;
            var limiteLocal = DateTime.SpecifyKind(dataParaIndicar.Value.Date.AddDays(-MargemAntesDoPrazo), DateTimeKind.Unspecified);
            var limite = TimeZoneInfo.ConvertTimeToUtc(limiteLocal, TermoMultaCommandPlugin.SaoPaulo());
            return limite < seteDias ? limite : seteDias;
        }

        public static bool Expirou(DateTime enviadoEmUtc, DateTime? dataParaIndicar, DateTime agoraUtc) => agoraUtc >= ExpiraEm(enviadoEmUtc, dataParaIndicar);

        public static bool PrazoCurtoParaEnviar(DateTime? dataParaIndicar, DateTime hoje) =>
            dataParaIndicar != null && (dataParaIndicar.Value.Date - hoje.Date).TotalDays < MargemAntesDoPrazo;

        public static bool LembrarTermo(DateTime enviadoEmUtc, DateTime? ultimoLembreteUtc, DateTime? dataParaIndicar, DateTime agoraUtc)
        {
            if (ultimoLembreteUtc == null) return agoraUtc >= enviadoEmUtc.AddDays(2);
            var vespera = ExpiraEm(enviadoEmUtc, dataParaIndicar).AddDays(-1);
            return agoraUtc >= vespera && agoraUtc - ultimoLembreteUtc.Value >= TimeSpan.FromHours(20);
        }

        public static bool LembrarAceite(DateTime indicacao, DateTime? ultimoLembrete, DateTime hoje)
        {
            var k = ultimoLembrete == null ? 0 : Math.Min(MaxLembretesAceite, (int)Math.Floor((ultimoLembrete.Value.Date - indicacao.Date).TotalDays / 2));
            return k < MaxLembretesAceite && (hoje.Date - indicacao.Date).TotalDays >= 2 * (k + 1);
        }
    }
}
```

Conferir que `TermoMultaCommandPlugin.SaoPaulo()` existe e é acessível (`internal static` basta, o projeto de teste tem `InternalsVisibleTo`? conferir no `.csproj`; se for `private`, mudar para `internal static`). O caso `"2026-11-12T12:00:00"` com último `"2026-11-12T12:00:00"`: véspera de 17/11 12:00 é 16/11 12:00, então `false`; o caso `16/11 12:00` dá `true`.

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Betinhos.DriverRecordSharing/TermoPrazos.cs packages/plugins/Betinhos.DriverRecordSharing.Tests/TermoPrazosTests.cs
git commit -m "feat(termo-multa): prazos puros de expiração e lembretes do termo e do aceite"
```

---

### Task 6: Plugin do termo segue o passo a passo (`Enviar`, `Assinar`, `Contestar`, `Expirar`, `Lembrar`)

**Files:**
- Modify: `packages/plugins/Betinhos.DriverRecordSharing/TermoMultaCommandPlugin.cs`
- Test: `packages/plugins/Betinhos.DriverRecordSharing.Tests/TermoMultaCommandPluginTests.cs`

**Interfaces:**
- Consumes: `TermoPrazos` (Task 5); `cr40f_PassoMulta` com `MultaId`, `Passo`, `DadosJson` (Task 3, passos `TermoAssinado` e `TermoContestado`).
- Produces:
  - `new_EnviarTermoMulta`: só Folha, 1 a 12 parcelas, competência na janela, etapa 2 sem aviso, prazo de pelo menos 3 dias, texto vigente diferente de `v0-placeholder`; marcadores novos.
  - `new_AssinarTermoMulta`: PDF e termo Assinado como hoje; em vez de gravar status e parcelas, executa `cr40f_PassoMulta` `TermoAssinado` com `{"data":"<dia de Brasília>"}`.
  - `new_ContestarTermoMulta`: termo Contestado; executa `cr40f_PassoMulta` `TermoContestado`. Não grava mais Recurso nem `new_recursopendente`.
  - `new_ExpirarTermoMulta`: decide pelo `TermoPrazos.Expirou`; saída nova `new_Expirou` (bool); termo fora do prazo devolve `false` sem erro.
  - `new_LembrarTermoMulta`: entrada opcional nova `new_Automatico` (bool); com ela, decide pelo `TermoPrazos.LembrarTermo`; saída nova `new_Lembrou` (bool). Sem ela, segue a regra de 24 h e o erro atual.

- [ ] **Step 1: Ler o arquivo de testes** (`TermoMultaCommandPluginTests.cs`) para usar o mesmo `FakeService`/contexto dos testes atuais de `Assinar`, `Contestar` e `Encerrar`. Os testes que hoje conferem `cr40f_status = 202410001` e parcelas criadas no `Assinar`, e `Recurso` no `Contestar`, **mudam** para conferir a chamada a `cr40f_PassoMulta`. O fake precisa registrar `Execute(OrganizationRequest)`: se ainda não registra, acrescentar ao fake uma lista `Executados` (`List<OrganizationRequest>`) e uma função opcional `AoExecutar` que pode lançar erro.

- [ ] **Step 2: Testes novos e trocados**

```csharp
[Fact]
public void Assinar_registra_o_passo_TermoAssinado_e_nao_cria_parcelas()
{
    var cenario = CenarioTermoPendente(forma: FormaFolha, parcelas: 3);
    cenario.ExecutarAssinar(agoraUtc: new DateTime(2026, 11, 18, 15, 0, 0, DateTimeKind.Utc));
    var passo = Assert.Single(cenario.Service.Executados, r => r.RequestName == "cr40f_PassoMulta");
    Assert.Equal("TermoAssinado", passo["Passo"]);
    Assert.Equal("{\"data\":\"2026-11-18\"}", passo["DadosJson"]);
    Assert.Empty(cenario.Service.Criados("new_parcelamultafolha"));
    Assert.False(cenario.Service.Atualizou("cr40f_multas", "cr40f_status"));
}

[Fact]
public void Assinar_com_multa_em_outra_etapa_explica_ao_motorista()
{
    var cenario = CenarioTermoPendente(forma: FormaFolha, parcelas: 1);
    cenario.Service.AoExecutar = r => throw new InvalidPluginExecutionException("Este passo não vale para a etapa atual da multa. Recarregue a tela.");
    var erro = Assert.Throws<InvalidPluginExecutionException>(() => cenario.ExecutarAssinar(agoraUtc: new DateTime(2026, 11, 18, 15, 0, 0, DateTimeKind.Utc)));
    Assert.Equal("Esta multa mudou de etapa e o termo não pode mais ser assinado. Procure o escritório.", erro.Message);
}

[Fact]
public void Contestar_registra_o_passo_TermoContestado_sem_recurso()
{
    var cenario = CenarioTermoPendente(forma: FormaFolha, parcelas: 1);
    cenario.ExecutarContestar("Eu não estava com o carro nesse dia (fictício).");
    Assert.Equal("TermoContestado", Assert.Single(cenario.Service.Executados, r => r.RequestName == "cr40f_PassoMulta")["Passo"]);
    Assert.False(cenario.Service.Atualizou("cr40f_multas", "new_recursopendente"));
}

[Theory]
[InlineData(100000000, 1, "2026-12-01", "O termo agora é só para desconto em folha.")]
[InlineData(100000001, 13, "2026-12-01", "Escolha de 1 a 12 parcelas.")]
[InlineData(100000001, 2, "2026-08-01", "Escolha um mês entre 10/2026 e 11/2027.")]
public void Enviar_recusa_acordo_fora_da_regra(int forma, int parcelas, string competencia, string mensagem)
{
    var cenario = CenarioMultaEtapa2(hoje: "2026-11-18", dataParaIndicar: "2026-12-10");
    var erro = Assert.Throws<InvalidPluginExecutionException>(() => cenario.ExecutarEnviar(forma, parcelas, competencia));
    Assert.Equal(mensagem, erro.Message);
}

[Fact]
public void Enviar_recusa_depois_do_aviso()
{
    var cenario = CenarioMultaEtapa2(hoje: "2026-11-18", dataParaIndicar: "2026-12-10", dataAviso: "2026-11-15");
    Assert.Equal("O termo só é enviado na etapa 2, antes do aviso ao motorista.",
        Assert.Throws<InvalidPluginExecutionException>(() => cenario.ExecutarEnviar(100000001, 2, "2026-12-01")).Message);
}

[Fact]
public void Enviar_recusa_com_prazo_curto()
{
    var cenario = CenarioMultaEtapa2(hoje: "2026-11-18", dataParaIndicar: "2026-11-20");
    Assert.Equal("Faltam menos de 3 dias para o prazo de indicação; avise pelo WhatsApp.",
        Assert.Throws<InvalidPluginExecutionException>(() => cenario.ExecutarEnviar(100000001, 2, "2026-12-01")).Message);
}

[Fact]
public void Enviar_recusa_texto_provisorio()
{
    var cenario = CenarioMultaEtapa2(hoje: "2026-11-18", dataParaIndicar: "2026-12-10", versaoTexto: "v0-placeholder");
    Assert.Equal("O texto do termo ainda é provisório.",
        Assert.Throws<InvalidPluginExecutionException>(() => cenario.ExecutarEnviar(100000001, 2, "2026-12-01")).Message);
}

[Fact]
public void Enviar_troca_os_marcadores_novos()
{
    var cenario = CenarioMultaEtapa2(hoje: "2026-11-18", dataParaIndicar: "2026-12-10",
        texto: "{motorista}|{placa}|{datahora}|{local}|{auto}|{valor}|{parcelas}|{primeiromes}");
    cenario.ExecutarEnviar(100000001, 3, "2026-12-01");
    Assert.Equal("Motorista Teste (fictício)|TST1A23|05/11/2026 14:30|Av. Exemplo, 100 (fictício)|A000000001|R$ 195,23|3|12/2026",
        cenario.Service.Criado("new_termomulta").GetAttributeValue<string>("new_textocongelado"));
}

[Theory]
[InlineData("2026-11-16T12:00:00", false)]
[InlineData("2026-11-17T12:00:00", true)]
public void Expirar_devolve_se_expirou_sem_erro(string agora, bool expirou)
{
    var cenario = CenarioTermoPendente(forma: FormaFolha, parcelas: 1, enviadoEmUtc: new DateTime(2026, 11, 10, 12, 0, 0, DateTimeKind.Utc), dataParaIndicar: "2026-12-30");
    var saida = cenario.ExecutarExpirar(DateTime.SpecifyKind(DateTime.Parse(agora, CultureInfo.InvariantCulture), DateTimeKind.Utc));
    Assert.Equal(expirou, saida["new_Expirou"]);
}

[Fact]
public void Lembrete_automatico_nao_lanca_erro_fora_da_hora()
{
    var cenario = CenarioTermoPendente(forma: FormaFolha, parcelas: 1, enviadoEmUtc: new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc));
    var saida = cenario.ExecutarLembrar(automatico: true, agoraUtc: new DateTime(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc));
    Assert.False((bool)saida["new_Lembrou"]);
}
```

`CenarioTermoPendente`, `CenarioMultaEtapa2` e os `Executar*` são helpers do arquivo de teste: criar a partir dos testes atuais (multa fictícia: auto `A000000001`, placa `TST1A23`, local `Av. Exemplo, 100 (fictício)`, infração 05/11/2026 14:30 de Brasília, guia R$ 195,23; motorista "Motorista Teste (fictício)" com aditivo). O nome da coluna do texto congelado do termo (`new_textocongelado` acima) deve ser conferido no `Enviar` atual (`rg -n "new_texto" TermoMultaCommandPlugin.cs`) e usado como está.

- [ ] **Step 3: Rodar e ver falhar** — `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --filter TermoMultaCommandPluginTests` → FAIL.

- [ ] **Step 4: Implementar no `TermoMultaCommandPlugin.cs`**

1. Constantes no topo da classe:

```csharp
        private const string PassoMulta = "cr40f_PassoMulta";
        private const int MaxParcelas = 12;
        private const string VersaoProvisoria = "v0-placeholder";
        private const string MultaMudouDeEtapa = "Esta multa mudou de etapa e o termo não pode mais ser assinado. Procure o escritório.";
        private const int StatusIndicar = 202410004;
```

2. `SaoPaulo()` passa a `internal static` (a Task 5 usa).

3. `ValidarAcordo` (linhas ~298–308) vira:

```csharp
        internal static void ValidarAcordo(int forma, int parcelas, DateTime? primeira, decimal valor, DateTime hoje)
        {
            if (forma != FormaFolha) throw new InvalidPluginExecutionException("O termo agora é só para desconto em folha.");
            if (parcelas < 1 || parcelas > MaxParcelas) throw new InvalidPluginExecutionException("Escolha de 1 a 12 parcelas.");
            if (valor <= 0) throw new InvalidPluginExecutionException("A multa não tem valor da guia.");
            var de = new DateTime(hoje.Year, hoje.Month, 1).AddMonths(-1);
            var ate = new DateTime(hoje.Year, hoje.Month, 1).AddMonths(12);
            if (primeira == null || primeira.Value < de || primeira.Value > ate)
                throw new InvalidPluginExecutionException($"Escolha um mês entre {de:MM/yyyy} e {ate:MM/yyyy}.");
        }
```

Manter a mensagem de valor que o método já usa hoje (conferir o texto atual e não trocar). A regra do recurso sai daqui: com o passo a passo, recurso pendente já impede a etapa 2.

4. Em `Enviar`, depois de ler a multa (acrescentar ao `ColumnSet`: `cr40f_status`, `cr40f_datadeavisoaocondutor`, `cr40f_dataparaindicar`, `cr40f_novacoluna` já existe), antes do `ValidarAcordo`:

```csharp
            var hoje = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, SaoPaulo()).Date;
            var prazo = multa.GetAttributeValue<DateTime?>("cr40f_dataparaindicar");
            var etapa2 = multa.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value == StatusIndicar
                && multa.GetAttributeValue<DateTime?>("cr40f_datadeavisoaocondutor") == null
                && (prazo == null || prazo.Value.Date >= hoje);
            if (!etapa2) throw new InvalidPluginExecutionException("O termo só é enviado na etapa 2, antes do aviso ao motorista.");
            if (TermoPrazos.PrazoCurtoParaEnviar(prazo, hoje)) throw new InvalidPluginExecutionException("Faltam menos de 3 dias para o prazo de indicação; avise pelo WhatsApp.");
```

Depois de obter o texto vigente: `if (texto.GetAttributeValue<string>("new_versao") == VersaoProvisoria) throw new InvalidPluginExecutionException("O texto do termo ainda é provisório.");`. Nos replaces, acrescentar:

```csharp
                .Replace("{datahora}", DataHoraBr(multa.GetAttributeValue<DateTime?>("cr40f_dataehorario")))
                .Replace("{local}", multa.GetAttributeValue<string>("cr40f_localdainfracao") ?? "")
                .Replace("{auto}", multa.GetAttributeValue<string>("cr40f_novacoluna") ?? "")
                .Replace("{primeiromes}", primeira.Value.ToString("MM/yyyy", PtBr))
```

com `private static string DataHoraBr(DateTime? utc) => utc == null ? "" : TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc.Value, DateTimeKind.Utc), SaoPaulo()).ToString("dd/MM/yyyy HH:mm", PtBr);`. `{valor}` continua o valor da guia (`new_valorguia`), que é o valor total do termo. Conferir que `cr40f_novacoluna` é o número do auto no `Enviar` atual.

5. Em `Assinar` (linhas ~372–457): apagar o bloco que grava `cr40f_status = 202410001` e o laço que cria `new_parcelamultafolha`. No lugar, depois de marcar o termo como Assinado:

```csharp
            var dia = TimeZoneInfo.ConvertTimeFromUtc(agoraUtc, SaoPaulo()).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            RegistrarPasso(system, multaId, "TermoAssinado", "{\"data\":\"" + dia + "\"}", MultaMudouDeEtapa);
```

e o helper:

```csharp
        private static void RegistrarPasso(IOrganizationService system, Guid multaId, string passo, string dadosJson, string mensagemSeRecusar)
        {
            try
            {
                system.Execute(new OrganizationRequest(PassoMulta) { ["MultaId"] = multaId, ["Passo"] = passo, ["DadosJson"] = dadosJson });
            }
            catch (InvalidPluginExecutionException) { throw new InvalidPluginExecutionException(mensagemSeRecusar); }
        }
```

A chamada fica **antes** do upload do PDF e do Update do termo? Não: a ordem é Update do termo (Assinado) → `RegistrarPasso`. Como tudo roda na mesma transação do plugin síncrono, a exceção do passo desfaz o termo Assinado. Conferir no registro que o step do `new_AssinarTermoMulta` é síncrono (Custom API sempre é) e que o upload em blocos (`InitializeFileBlocksUpload`) não fica fora da transação; se ficar, mover o `RegistrarPasso` para **antes** do upload e do Update, o que também evita PDF órfão.

O nome dos parâmetros de `cr40f_PassoMulta` (`MultaId`, `Passo`, `DadosJson`) deve ser conferido em `PassoMultaPlugin.Execute`.

6. Em `Contestar`: apagar o Update da multa para Recurso e `new_recursopendente`. Depois do Update do termo (Contestado + motivo): `RegistrarPasso(system, multaId, "TermoContestado", "{}", MultaMudouDeEtapa);`.

7. `Encerrar` com `agoraParaPrazo` (expirar): trocar `enviadoEm + 7 <= agora` por:

```csharp
            var prazo = system.Retrieve("cr40f_multas", multaId, new ColumnSet("cr40f_dataparaindicar")).GetAttributeValue<DateTime?>("cr40f_dataparaindicar");
            if (!TermoPrazos.Expirou(enviadoEm, prazo, agora)) { context.OutputParameters["new_Expirou"] = false; return; }
            // (segue o Encerrar atual: status Expirado, limpa new_termovigente)
            context.OutputParameters["new_Expirou"] = true;
```

O termo que não é mais Pendente também devolve `new_Expirou = false` sem erro (o flow lista todos os pendentes, mas pode haver corrida com a assinatura).

8. `Lembrar`: ler `context.InputParameters.Contains("new_Automatico") && (bool)context.InputParameters["new_Automatico"]`. Automático: `if (!TermoPrazos.LembrarTermo(enviadoEm, ultimo, prazo, agora)) { context.OutputParameters["new_Lembrou"] = false; return; }`. Manual: regra atual de 24 h (com erro). Os dois gravam `new_ultimolembreteem` e devolvem `new_Lembrou = true`; quem manda o push é o flow.

- [ ] **Step 5: Rodar** — `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --filter "TermoMultaCommandPluginTests|TermoPrazosTests"` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Betinhos.DriverRecordSharing packages/plugins/Betinhos.DriverRecordSharing.Tests
git commit -m "feat(termo-multa): termo só em folha na etapa 2, assinatura e contestação pelo passo a passo"
```

---

### Task 7: APIs do app: `new_MinhasMultas`, `new_DeclararAceiteMulta`, `new_LembrarAceiteMulta`

**Files:**
- Create: `packages/plugins/Betinhos.DriverRecordSharing/MinhasMultas.cs`
- Modify: `packages/plugins/Betinhos.DriverRecordSharing/TermoMultaCommandPlugin.cs` (switch das mensagens)
- Test: `packages/plugins/Betinhos.DriverRecordSharing.Tests/MinhasMultasTests.cs`, `TermoMultaCommandPluginTests.cs`

**Interfaces:**
- Produces:
  - `MinhaMulta` (DataContract, nomes camelCase): `id`, `auto`, `placa`, `dataHora` (ISO), `local`, `infracao`, `grupo` (`"precisa" | "andamento" | "encerrada"`), `situacao` (texto da spec), `acao` (`"assinar" | "aceite" | null`), `termoId`, `termoStatus` (`"pendente"|"assinado"|"contestado"|"expirado"|"cancelado"|null`), `prazoAceite` (yyyy-MM-dd ou null), `aceiteDeclaradoEm`, `parcelas: List<MinhaParcela {numero, competencia, valor, status}>`. **Sem valor da guia** (o valor aparece só no termo e nas parcelas).
  - `MinhasMultas.Montar(IEnumerable<LinhaMinhaMulta> linhas, DateTime hoje): List<MinhaMulta>` (puro; `LinhaMinhaMulta` = estado mínimo lido do Dataverse: status, responsável, contestadaEm, canal, dataIndicacao, aceiteEm, aceiteDeclaradoEm, dataParaIndicar, encerradaEm, canceladaEm, recursoPendente, termo vigente e o último termo, parcelas).
  - `new_MinhasMultas`: sem entrada; saída `new_MultasJson` (string). Roda como sistema e filtra por `cr40f_motorista` = `DriverResolver.ResolveFromUser(...)`.
  - `new_DeclararAceiteMulta`: entrada `new_MultaId`; grava `cr40f_aceitedeclaradoem` = hoje de Brasília; idempotente.
  - `new_LembrarAceiteMulta`: entrada `new_MultaId`; saída `new_Lembrou`; usa `TermoPrazos.LembrarAceite`; grava `cr40f_ultimolembreteaceiteem`.

Regras do `Montar` (spec, seção 6.1):
- Fica de fora: responsável Empresa (`100000001`) **exceto** encerrada/cancelada nos últimos 12 meses ("Empresa assumiu" aparece no histórico só se a multa chegou à etapa 2 com o motorista, ou seja, `DataAviso != null` ou havia termo); etapa 1 sem `contestadaEm`; encerrada/cancelada há mais de 12 meses.
- `grupo = "precisa"` quando: termo vigente Pendente (`acao = "assinar"`), ou aceite pendente (status Indicar, canal Senatran, indicação preenchida, `aceiteEm` nulo e `aceiteDeclaradoEm` nulo; `acao = "aceite"`, `prazoAceite = dataParaIndicar`).
- `grupo = "encerrada"` para Encerrada/Cancelada; resto `"andamento"`.
- `situacao`: termo pendente "Assine o termo da multa"; aceite pendente "Aceite a indicação na CNH Digital"; etapa 1 contestada "Contestação em análise"; Indicar sem indicação "Aguardando a indicação no órgão"; Indicar com aceite declarado "Aceite em conferência"; Pagar "Aguardando o pagamento"; Recurso ou `recursoPendente` "Em recurso"; Acertar "Aguardando o lançamento na folha"; Encerrada com parcelas previstas "Descontando {d} de {N}"; Encerrada sem previstas "Encerrada"; Cancelada "Cancelada"; responsável Empresa "Empresa assumiu".
- Ordenação: `precisa` (prazo mais próximo primeiro), `andamento` (data da infração mais recente primeiro), `encerrada` (encerramento mais recente primeiro).

- [ ] **Step 1: Testes puros que falham** (`MinhasMultasTests.cs`)

```csharp
using System;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class MinhasMultasTests
    {
        private static readonly DateTime Hoje = new DateTime(2026, 11, 18);
        private static LinhaMinhaMulta Linha(int status, Action<LinhaMinhaMulta>? ajuste = null)
        {
            var l = new LinhaMinhaMulta { Id = Guid.NewGuid(), Auto = "A000000001", Placa = "TST1A23", Status = status, Responsavel = 100000000, DataHora = new DateTime(2026, 11, 5, 17, 30, 0, DateTimeKind.Utc) };
            ajuste?.Invoke(l);
            return l;
        }

        [Fact]
        public void Etapa1_sem_contestacao_nao_aparece()
            => Assert.Empty(MinhasMultas.Montar(new[] { Linha(202410000) }, Hoje));

        [Fact]
        public void Termo_pendente_precisa_de_voce()
        {
            var m = Assert.Single(MinhasMultas.Montar(new[] { Linha(202410004, l => { l.TermoVigenteId = Guid.NewGuid(); l.TermoVigenteStatus = 100000000; }) }, Hoje));
            Assert.Equal(("precisa", "assinar", "Assine o termo da multa"), (m.Grupo, m.Acao, m.Situacao));
        }

        [Fact]
        public void Aceite_pendente_precisa_de_voce_com_prazo()
        {
            var m = Assert.Single(MinhasMultas.Montar(new[] { Linha(202410004, l => { l.Canal = 100000000; l.DataIndicacao = new DateTime(2026, 11, 12); l.DataParaIndicar = new DateTime(2026, 11, 28); }) }, Hoje));
            Assert.Equal(("precisa", "aceite", "2026-11-28"), (m.Grupo, m.Acao, m.PrazoAceite));
        }

        [Fact]
        public void Aceite_declarado_vai_para_andamento()
        {
            var m = Assert.Single(MinhasMultas.Montar(new[] { Linha(202410004, l => { l.Canal = 100000000; l.DataIndicacao = new DateTime(2026, 11, 12); l.AceiteDeclaradoEm = new DateTime(2026, 11, 14); }) }, Hoje));
            Assert.Equal(("andamento", "Aceite em conferência"), (m.Grupo, m.Situacao));
        }

        [Fact]
        public void Contestada_aparece_em_analise()
            => Assert.Equal("Contestação em análise", Assert.Single(MinhasMultas.Montar(new[] { Linha(202410000, l => l.ContestadaEm = new DateTime(2026, 11, 16)) }, Hoje)).Situacao);

        [Fact]
        public void Descontando_conta_as_parcelas()
        {
            var m = Assert.Single(MinhasMultas.Montar(new[] { Linha(202410005, l => { l.EncerradaEm = new DateTime(2026, 11, 10); l.Parcelas.Add(new MinhaParcela { Numero = 1, Competencia = "2026-11-01", Valor = 65.08m, Status = "descontada" }); l.Parcelas.Add(new MinhaParcela { Numero = 2, Competencia = "2026-12-01", Valor = 65.08m, Status = "prevista" }); }) }, Hoje));
            Assert.Equal(("andamento", "Descontando 1 de 2"), (m.Grupo, m.Situacao));
        }

        [Fact]
        public void Encerrada_ha_mais_de_12_meses_some()
            => Assert.Empty(MinhasMultas.Montar(new[] { Linha(202410005, l => l.EncerradaEm = new DateTime(2025, 11, 17)) }, Hoje));

        [Fact]
        public void Empresa_assumiu_so_no_historico()
        {
            var r = MinhasMultas.Montar(new[] {
                Linha(202410001, l => l.Responsavel = 100000001),
                Linha(202410005, l => { l.Responsavel = 100000001; l.DataAviso = new DateTime(2026, 11, 1); l.EncerradaEm = new DateTime(2026, 11, 15); }) }, Hoje);
            var m = Assert.Single(r);
            Assert.Equal(("encerrada", "Empresa assumiu"), (m.Grupo, m.Situacao));
        }

        [Fact]
        public void Ordem_dos_grupos()
        {
            var r = MinhasMultas.Montar(new[] {
                Linha(202410005, l => l.EncerradaEm = new DateTime(2026, 11, 1)),
                Linha(202410001),
                Linha(202410004, l => { l.TermoVigenteId = Guid.NewGuid(); l.TermoVigenteStatus = 100000000; }) }, Hoje);
            Assert.Equal(new[] { "precisa", "andamento", "encerrada" }, r.Select(m => m.Grupo));
        }
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --filter MinhasMultasTests` → FAIL.

- [ ] **Step 3: Implementar `MinhasMultas.cs`** com `LinhaMinhaMulta` (POCO com as propriedades usadas nos testes: `Id, Auto, Placa, DataHora, Local, Infracao, Status, Responsavel, ContestadaEm, Canal, DataIndicacao, AceiteEm, AceiteDeclaradoEm, DataParaIndicar, DataAviso, EncerradaEm, CanceladaEm, RecursoPendente, TermoVigenteId, TermoVigenteStatus, UltimoTermoId, UltimoTermoStatus, Parcelas = new List<MinhaParcela>()`), `MinhaParcela` e `MinhaMulta` (`[DataContract]`, `[DataMember(Name = "...")]` camelCase) e o `Montar` com as regras acima, nesta ordem de decisão:

```csharp
        public static List<MinhaMulta> Montar(IEnumerable<LinhaMinhaMulta> linhas, DateTime hoje)
        {
            var corte = hoje.Date.AddMonths(-12);
            var saida = new List<MinhaMulta>();
            foreach (var l in linhas)
            {
                var fechada = l.Status == Encerrada || l.Status == Cancelada;
                var fimEm = l.EncerradaEm ?? l.CanceladaEm;
                if (fechada && (fimEm == null || fimEm.Value.Date <= corte)) continue;
                if (l.Responsavel == Empresa && !(fechada && (l.DataAviso != null || l.UltimoTermoId != null))) continue;
                if (l.Status == Identificar && l.ContestadaEm == null) continue;
                saida.Add(Converter(l));
            }
            return saida
                .OrderBy(m => Ordem(m.Grupo))
                .ThenBy(m => m.Grupo == "precisa" ? (m.PrazoAceite ?? "9999") : "")
                .ThenByDescending(m => m.Grupo == "encerrada" ? m.FimEm : m.DataHora)
                .ToList();
        }
```

`Converter` aplica o grupo, a ação e a situação na ordem da lista de regras; `Descontando` só quando há parcela `prevista`. `termoId` = vigente, senão o último termo (para o PDF). Status do termo em texto: `100000000 pendente`, `…01 assinado`, `…02 contestado`, `…03 expirado`, `…04 cancelado`.

- [ ] **Step 4: Ligar as mensagens no plugin.** No `switch` de `Execute`:

```csharp
                case "new_MinhasMultas": MinhasMultasDoMotorista(context, system, service); break;
                case "new_DeclararAceiteMulta": DeclararAceite(context, system, service); break;
                case "new_LembrarAceiteMulta": LembrarAceite(context, system); break;
```

- `MinhasMultasDoMotorista`: `var driver = DriverResolver.ResolveFromUser(system, context.InitiatingUserId)`; sem motorista → `new_MultasJson = "[]"`. Query em `cr40f_multas` com `cr40f_motorista eq driver.EmployeeReference.Id` e colunas da `LinhaMinhaMulta`; segunda query em `new_termomulta` (`new_multa in (...)`, mais recente por multa) e terceira em `new_parcelamultafolha` (`new_multa in (...)`, `new_status ne Cancelada`). Montar e serializar com `DataContractJsonSerializer` (o projeto já tem helper de JSON? conferir com `rg -n "DataContractJsonSerializer" packages/plugins/Betinhos.DriverRecordSharing | head -3`).
- `DeclararAceite`: carregar a multa (`cr40f_motorista, cr40f_status, cr40f_canalindicacao, cr40f_datadeindicacao, cr40f_aceiteem, cr40f_aceitedeclaradoem`); motorista diferente do login → "Esta multa não é sua."; aceite não pendente → "Esta multa não espera o aceite na CNH Digital."; já declarado → retorna sem gravar; senão `system.Update(cr40f_aceitedeclaradoem = hoje)`. O `system` grava dentro da mensagem `new_DeclararAceiteMulta`, e a trava aceita pelo `CamposDasApisDoTermo` (Task 3).
- `LembrarAceite` (só o flow chama; exigir `TemPrivilegio(system, context.InitiatingUserId, PrivilegioGestor)` ou conta de serviço, como o `Lembrar` atual): aceite pendente e não declarado e `TermoPrazos.LembrarAceite(indicacao, ultimo, hoje)` → grava `cr40f_ultimolembreteaceiteem = hoje` e `new_Lembrou = true`; senão `false`.

Testes em `TermoMultaCommandPluginTests.cs`: "declarar aceite de outro motorista → Esta multa não é sua."; "declarar duas vezes não regrava"; "lembrar aceite no dia 2 grava e devolve true"; "lembrar aceite já declarado devolve false".

- [ ] **Step 5: Rodar** — `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Betinhos.DriverRecordSharing packages/plugins/Betinhos.DriverRecordSharing.Tests
git commit -m "feat(termo-multa): APIs do app para listar multas, declarar e lembrar o aceite"
```

---

### Task 8: Aditivo pelo gov.br (`new_GerarAditivoMotorista`, `new_RegistrarAditivoMotorista`) e script de registro

**Files:**
- Create: `packages/plugins/Betinhos.DriverRecordSharing/AditivoPdf.cs`
- Modify: `packages/plugins/Betinhos.DriverRecordSharing/TermoMultaCommandPlugin.cs` (`UploadPdf` com coluna, duas mensagens)
- Test: `packages/plugins/Betinhos.DriverRecordSharing.Tests/AditivoPdfTests.cs`
- Create: `packages/plugins/scripts/register-multas-fase3-customapis.ps1`

**Interfaces:**
- Produces:
  - `AditivoPdf.Gerar(string texto, string versao, Guid funcionarioId): byte[]` — determinístico (mesma entrada, mesmos bytes).
  - `AditivoPdf.Conferir(byte[] assinado, byte[] gerado): string?` — `null` se ok; senão a mensagem.
  - `AditivoPdf.ExigirIntegridade` (`public const bool = true`), `AditivoPdf.MaxBytes = 5 * 1024 * 1024`.
  - `new_GerarAditivoMotorista`: entrada `new_FuncionarioId`; saídas `new_PdfBase64`, `new_NomeArquivo` (`aditivo-<nome sem acento>-<versao>.pdf`).
  - `new_RegistrarAditivoMotorista`: entradas `new_FuncionarioId`, `new_PdfBase64`, `new_AssinadoEm` (DateTime, não futura); grava `new_aditivoassinatura` (arquivo) e `new_aditivoassinaturaem`.
  - `UploadPdf(system, target, fileName, pdf, coluna = "new_pdf")`.

- [ ] **Step 1: Testes que falham**

```csharp
using System;
using System.Text;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class AditivoPdfTests
    {
        private static readonly Guid Id = new Guid("00000000-0000-0000-0000-000000000001");
        private const string Texto = "Eu, Motorista Teste (fictício), CPF 000.000.000-00, concordo com o aditivo (texto fictício).";
        private static byte[] Gerado() => AditivoPdf.Gerar(Texto, "v1", Id);
        private static byte[] Assinado(byte[] baseBytes, string sufixo = "\n% assinatura\n<< /Type /Sig /ByteRange [0 10 20 30] >>\n%%EOF\n")
        {
            var extra = Encoding.ASCII.GetBytes(sufixo);
            var r = new byte[baseBytes.Length + extra.Length];
            Buffer.BlockCopy(baseBytes, 0, r, 0, baseBytes.Length);
            Buffer.BlockCopy(extra, 0, r, baseBytes.Length, extra.Length);
            return r;
        }

        [Fact] public void Gerar_e_deterministico() => Assert.Equal(Gerado(), Gerado());
        [Fact] public void Gerar_comeca_com_pdf() => Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(Gerado(), 0, 5));
        [Fact] public void Assinado_incremental_passa() => Assert.Null(AditivoPdf.Conferir(Assinado(Gerado()), Gerado()));

        [Fact]
        public void Sem_assinatura_recusa()
            => Assert.Equal("Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu.",
                AditivoPdf.Conferir(Assinado(Gerado(), "\n%%EOF\n"), Gerado()));

        [Fact]
        public void Outro_pdf_recusa()
        {
            var outro = AditivoPdf.Gerar(Texto + " Outro.", "v1", Id);
            Assert.Equal("Este PDF não é o aditivo gerado para este funcionário com o texto vigente. Gere o aditivo de novo e peça a assinatura.",
                AditivoPdf.Conferir(Assinado(outro), Gerado()));
        }

        [Fact] public void Nao_pdf_recusa() => Assert.Equal("Envie o PDF assinado.", AditivoPdf.Conferir(Encoding.ASCII.GetBytes("oi"), Gerado()));
        [Fact] public void Grande_demais_recusa() => Assert.Equal("O PDF passa de 5 MB.", AditivoPdf.Conferir(new byte[AditivoPdf.MaxBytes + 1], Gerado()));
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --filter AditivoPdfTests` → FAIL.

- [ ] **Step 3: Implementar `AditivoPdf.cs`**

```csharp
using System;
using System.Text;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Aditivo do contrato para assinatura no gov.br (spec fase 3, seção 5.5). O PDF não leva data nem ID aleatório,
    /// então regenerar com o mesmo texto e funcionário dá os mesmos bytes; o assinador do ITI faz atualização
    /// incremental, então o arquivo assinado começa com esses bytes.
    /// </summary>
    public static class AditivoPdf
    {
        /// <summary>false = confere só o dicionário de assinatura (recuo se o gov.br reescrever o arquivo).</summary>
        public const bool ExigirIntegridade = true;
        public const int MaxBytes = 5 * 1024 * 1024;

        public static byte[] Gerar(string texto, string versao, Guid funcionarioId)
        {
            var pdf = new MiniPdf();
            pdf.Heading("Aditivo ao contrato de trabalho");
            pdf.Paragraph(texto ?? "");
            pdf.Heading("Identificação");
            pdf.KeyValue("Versão do texto", versao ?? "");
            pdf.KeyValue("Funcionário (ID)", funcionarioId.ToString("D"));
            pdf.Paragraph("Assine este arquivo no gov.br (assinador.iti.br) sem alterar o conteúdo.", 8);
            return pdf.ToBytes();
        }

        public static string? Conferir(byte[] assinado, byte[] gerado)
        {
            if (assinado.Length > MaxBytes) return "O PDF passa de 5 MB.";
            if (assinado.Length < 5 || Encoding.ASCII.GetString(assinado, 0, 5) != "%PDF-") return "Envie o PDF assinado.";
            var texto = Encoding.ASCII.GetString(assinado);
            var temSig = texto.Contains("/ByteRange") && (texto.Contains("/Type /Sig") || texto.Contains("/Type/Sig"));
            if (!temSig) return "Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu.";
            if (ExigirIntegridade && !ComecaCom(assinado, gerado))
                return "Este PDF não é o aditivo gerado para este funcionário com o texto vigente. Gere o aditivo de novo e peça a assinatura.";
            return null;
        }

        private static bool ComecaCom(byte[] a, byte[] prefixo)
        {
            if (a.Length < prefixo.Length) return false;
            for (var i = 0; i < prefixo.Length; i++) if (a[i] != prefixo[i]) return false;
            return true;
        }
    }
}
```

Conferir que `MiniPdf.ToBytes()` não escreve `/CreationDate` nem `/ID` (ler `MiniPdf.cs:133-200`); se escrever, o teste `Gerar_e_deterministico` falha e a correção é não escrever esses campos quando não forem passados (sem mexer no termo, que já embute data no corpo).

- [ ] **Step 4: Mensagens no plugin**

```csharp
                case "new_GerarAditivoMotorista": GerarAditivo(context, system); break;
                case "new_RegistrarAditivoMotorista": RegistrarAditivo(context, system); break;
```

- Ambas exigem `TemPrivilegio(system, context.InitiatingUserId, PrivilegioGestor)` ("Só a gestão gera e anexa o aditivo.").
- `GerarAditivo`: texto vigente do tipo Aditivo (`TextoVigente(system, TextoTipoAditivo)`, com a mesma regra de exatamente 1 vigente) com `{motorista}` = `new_name` do funcionário e `{cpf}` = CPF do funcionário (coluna conferida no `Enviar`, que já troca `{cpf}`); recusa `v0-placeholder`. Saídas `new_PdfBase64` e `new_NomeArquivo`.
- `RegistrarAditivo`: decodifica; `new_AssinadoEm` no futuro (dia de Brasília maior que hoje) → "A data da assinatura não pode ser no futuro."; regenera com o texto vigente e chama `AditivoPdf.Conferir`; erro → `InvalidPluginExecutionException(erro)`. Ok → `UploadPdf(system, new EntityReference(Funcionario, id), nomeArquivo, bytes, "new_aditivoassinatura")` e `system.Update(new_aditivoassinaturaem = assinadoEm)`.
- `UploadPdf` ganha o parâmetro `string coluna = "new_pdf"` e usa `coluna` no `FileAttributeName`.
- Se o texto vigente mudar depois que o gestor gerou o PDF, o prefixo falha. A mensagem já manda gerar de novo.

Testes em `TermoMultaCommandPluginTests.cs`: "registrar com PDF certo grava a data e o arquivo" (conferir `InitializeFileBlocksUploadRequest.FileAttributeName == "new_aditivoassinatura"`), "registrar com data futura recusa", "gerar sem privilégio recusa".

- [ ] **Step 5: Script de registro** `packages/plugins/scripts/register-multas-fase3-customapis.ps1` (BOM UTF-8). Copiar a estrutura do `register-*-customapi.ps1` mais recente do DriverRecordSharing (`ls -t packages/plugins/scripts/register-*-customapi.ps1 | head -1`) e declarar, com o plugin type `Betinhos.DriverRecordSharing.TermoMultaCommandPlugin`:

| API | Função | Entradas | Saídas |
|---|---|---|---|
| `new_MinhasMultas` | Function (GET) | — | `new_MultasJson` String |
| `new_DeclararAceiteMulta` | Action | `new_MultaId` Guid | — |
| `new_LembrarAceiteMulta` | Action | `new_MultaId` Guid | `new_Lembrou` Boolean |
| `new_GerarAditivoMotorista` | Action | `new_FuncionarioId` Guid | `new_PdfBase64` String, `new_NomeArquivo` String |
| `new_RegistrarAditivoMotorista` | Action | `new_FuncionarioId` Guid, `new_PdfBase64` String, `new_AssinadoEm` DateTime | — |
| `new_ExpirarTermoMulta` (existente) | — | — | + `new_Expirou` Boolean |
| `new_LembrarTermoMulta` (existente) | — | + `new_Automatico` Boolean (opcional) | + `new_Lembrou` Boolean |

Idempotente (só cria o que falta), dry-run sem `-Apply`, e `-SolutionUniqueName AppBetinhos`. **A sessão de implementação não roda este script**: ele roda à mão no DEV depois do Deploy publicar a DLL (Task 16).

- [ ] **Step 6: Incluir as APIs que gravam em `Apis` da trava do termo** (`MultaTravaPlugin` do termo, linha ~70 do arquivo que tem `IsServerWrite`): `new_DeclararAceiteMulta`, `new_LembrarAceiteMulta`, `new_RegistrarAditivoMotorista`. Teste: a gravação vinda de cada uma passa.

- [ ] **Step 7: Rodar** — `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/plugins/Betinhos.DriverRecordSharing packages/plugins/Betinhos.DriverRecordSharing.Tests packages/plugins/scripts/register-multas-fase3-customapis.ps1
git commit -m "feat(termo-multa): aditivo gerado e conferido para assinatura no gov.br"
```

---

### Task 9: Flows do termo e do aceite

**Files:**
- Modify: `packages/deploy/provision-flow-termo-multa.ps1`
- Create: `packages/deploy/flows/multa-aceite-push.json`, `packages/deploy/provision-flow-multa-aceite-push.ps1`
- Modify: `packages/deploy/flows-dev.mjs` (+ `flows-dev.test.mjs`)

**Interfaces:**
- Consumes: saídas `new_Expirou`, `new_Lembrou`, entrada `new_Automatico` (Task 6); `new_LembrarAceiteMulta` (Task 7).

- [ ] **Step 1: Ler** `provision-flow-termo-multa.ps1` inteiro (`wc -l` antes; ler por partes) e localizar os flows "Expirar pendentes", "Lembrete diário" e "Aviso ao gestor".

- [ ] **Step 2: Expirar pendentes.** Filtro do List rows: `new_status eq 100000000` (todos os pendentes, sem o `enviadoem le addDays(-7)`). Para cada um, chamar `new_ExpirarTermoMulta` e só seguir para o push de "termo expirado" quando `outputs(...)?['body/new_Expirou']` for `true`. Manter o flow ligado.

- [ ] **Step 3: Aviso ao gestor só Contestado** (pular este passo se o Renan decidir manter os dois no card do resumo). Trocar a condição do gatilho (`new_status` mudou para Assinado ou Contestado) por só `100000002`. Texto do e-mail: "O motorista contestou a multa {auto}. Abra a multa e decida o responsável."

- [ ] **Step 4: Lembrete diário.** Chamar `new_LembrarTermoMulta` com `new_Automatico = true` para cada pendente e mandar o push "Você tem uma multa para resolver no app" só quando `new_Lembrou` for `true`. Nada de valor nem infração no push.

- [ ] **Step 5: Flow novo "Multa | Push do aceite"** (`flows/multa-aceite-push.json` + `provision-flow-multa-aceite-push.ps1`, no padrão dos `provision-flow-*.ps1` que leem um JSON de `flows/`): Recurrence diária 09:00 America/Sao_Paulo; List rows em `cr40f_multas` com `cr40f_status eq 202410004 and cr40f_canalindicacao eq 100000000 and cr40f_datadeindicacao ne null and cr40f_aceiteem eq null and cr40f_aceitedeclaradoem eq null`; para cada, `new_LembrarAceiteMulta` e, com `new_Lembrou`, o mesmo push do lembrete do termo (copiar a ação de push do `termo-multa-push.json`). Connection reference do Dataverse igual à dos flows do termo.

- [ ] **Step 6: Mapear em `flows-dev.mjs`**: no item `termo-multa` (linha ~120) nada muda além de já cobrir o script; acrescentar:

```js
  {
    nome: 'multa-aceite-push',
    flow: 'Multa | Push do aceite',
    script: script('multa-aceite-push'),
    arquivos: [script('multa-aceite-push'), flowsDir('multa-aceite-push\\.json')],
    args: { Remetente: 'FLOW_FROTA_REMETENTE' },
  },
```

(copiar a forma exata de um item vizinho; se `args` não se aplicar, omitir). Teste em `flows-dev.test.mjs`: mudar `flows/multa-aceite-push.json` deixa `multa-aceite-push` pendente. Run: `node --test packages/deploy/flows-dev.test.mjs` → PASS. O flow novo nasce à mão uma vez (Task 16); depois o Deploy atualiza.

- [ ] **Step 7: Validar os JSONs** — `node -e "for (const f of ['multa-aceite-push','termo-multa-push','multas-do-dia']) JSON.parse(require('fs').readFileSync('packages/deploy/flows/'+f+'.json','utf8'))"` → sem erro. `pwsh -NoProfile -Command "[ScriptBlock]::Create((Get-Content -Raw packages/deploy/provision-flow-termo-multa.ps1)) | Out-Null"` (o mesmo para o script novo) → sem erro de sintaxe.

- [ ] **Step 8: Commit**

```bash
git add packages/deploy
git commit -m "feat(multas): flows do termo seguem o prazo novo e push diário do aceite"
```

---

### Task 10: Shell: termo dentro do passo a passo (drawer da multa)

**Files:**
- Modify: `apps/shell/src/pages/frota/data/types.ts`, `mappers.ts`, `dataverse.ts`, `source.ts`
- Modify: `apps/shell/src/pages/frota/domain/multaEstado.ts`, `termoMulta.ts` (+ `termoMulta.test.ts`)
- Modify: `apps/shell/src/pages/frota/components/MultaPassoAPasso.tsx` (+ teste), `TermoMultaPanel.tsx` (+ teste)

**Interfaces:**
- Consumes: `mesDoTermo`, `aguardandoTermo`, campos novos do `MultaEstado` (Task 2).
- Produces:
  - `Multa.contestadaEm?: string | null`, `Multa.aceiteDeclaradoEm?: string | null` (mapper: `cr40f_contestadaem`, `cr40f_aceitedeclaradoem` no select da linha 14–15).
  - `estadoDaMulta(m: Multa, termo?: TermoMulta | null): MultaEstado` — `termoPendente = m.termo?.status === 'pendente' && !!m.termoVigente`; com `termo` Assinado e forma `folha`: `termoParcelas`, `termoPrimeiroMes`, `termoValor`.
  - `validarAcordo(acordo, contexto: ContextoAcordo & { hoje: string; dataParaIndicar: string | null; avisado: boolean })` com as mensagens novas da Task 6, iguais letra a letra.
  - `AvisoPorTermo` (export novo de `TermoMultaPanel.tsx`): conteúdo do passo `AvisarMotorista` quando o motorista tem aditivo.

- [ ] **Step 1: Testes que falham** (`termoMulta.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { validarAcordo } from './termoMulta';

const base = { temAditivo: true, recursoPendente: false, temMotorista: true, termoPendente: false, hoje: '2026-11-18', dataParaIndicar: '2026-12-10', avisado: false };

describe('validarAcordo (fase 3)', () => {
  it('só folha', () => expect(validarAcordo({ forma: 'guia', parcelas: 1, primeiraCompetencia: '2026-12-01', valor: 100 }, base)).toBe('O termo agora é só para desconto em folha.'));
  it('até 12 parcelas', () => expect(validarAcordo({ forma: 'folha', parcelas: 13, primeiraCompetencia: '2026-12-01', valor: 100 }, base)).toBe('Escolha de 1 a 12 parcelas.'));
  it('mês na janela', () => expect(validarAcordo({ forma: 'folha', parcelas: 2, primeiraCompetencia: '2026-08-01', valor: 100 }, base)).toBe('Escolha um mês entre 10/2026 e 11/2027.'));
  it('depois do aviso', () => expect(validarAcordo({ forma: 'folha', parcelas: 2, primeiraCompetencia: '2026-12-01', valor: 100 }, { ...base, avisado: true })).toBe('O termo só é enviado na etapa 2, antes do aviso ao motorista.'));
  it('prazo curto', () => expect(validarAcordo({ forma: 'folha', parcelas: 2, primeiraCompetencia: '2026-12-01', valor: 100 }, { ...base, dataParaIndicar: '2026-11-20' })).toBe('Faltam menos de 3 dias para o prazo de indicação; avise pelo WhatsApp.'));
  it('ok', () => expect(validarAcordo({ forma: 'folha', parcelas: 12, primeiraCompetencia: '2027-11-01', valor: 100 }, base)).toBeNull());
});
```

Antes, ler a assinatura atual de `validarAcordo` e o tipo do acordo em `termoMulta.ts`; manter os nomes de campo reais (ex.: `primeiraCompetencia` vs `competencia`). A mensagem de valor ausente e a de recurso continuam como estão; a de "1 a 3" sai.

Teste de componente (`MultaPassoAPasso.test.tsx`, no estilo do arquivo atual com o mock):
- multa da etapa 2 com motorista com aditivo e sem termo: o passo "Avisar o motorista" mostra "Enviar termo pelo app" e "Avisar pelo WhatsApp";
- com termo pendente: mostra "Aguardando o motorista assinar o termo", os botões "Lembrar", "Cancelar termo" e "Avisar pelo WhatsApp"; "Registrar indicação" fica desabilitado com o texto "Aguarde a assinatura do termo ou cancele o termo.";
- com o último termo Contestado e a multa na etapa 1: o bloco do responsável mostra "Contestação do motorista" e o motivo;
- etapa Acertar com termo assinado em folha de 3 parcelas: o número de parcelas aparece fixo ("3 parcelas, como assinado") e o mês vem preenchido;
- termo assinado com primeiro mês fora da janela: aviso "O primeiro mês do termo (08/2026) já passou; as parcelas começam em 11/2026.".

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter shell exec vitest run src/pages/frota/domain/termoMulta.test.ts` e depois `src/pages/frota/components/MultaPassoAPasso.test.tsx` → FAIL.

- [ ] **Step 3: Implementar**
  - `validarAcordo`: mesmas regras e ordem da Task 6 (folha → parcelas → valor → janela → etapa 2 → prazo curto), usando `janelaCompetencia(hoje)` e `mesBr` de `multaEtapas.ts`; prazo curto por `diasEntre(hoje, dataParaIndicar) < 3`.
  - `TermoMultaPanel.tsx`: o seletor de forma some (só folha); parcelas de 1 a 12 com `previaParcelas` (já existe) mostrando os valores por mês; o mês padrão é o próximo mês; recebe `hoje`, `dataParaIndicar` e `avisado` para o `validarAcordo`. Exportar `AvisoPorTermo` que decide entre: sem termo → formulário de envio + botão "Avisar pelo WhatsApp" (o passo atual); termo pendente → status, prazo (`ExpiraEm` em TS: `expiraEm(enviadoEm, dataParaIndicar)` em `termoMulta.ts`, mesma regra da Task 5), "Lembrar" (`new_LembrarTermoMulta` manual), "Cancelar termo" (`new_CancelarTermoMulta`, com confirmação "Cancelar o termo? O motorista deixa de ver o pedido de assinatura.") e "Avisar pelo WhatsApp" (cancela o termo e abre o fluxo de WhatsApp atual, com a mesma confirmação).
  - `MultaPassoAPasso.tsx`: em `campos()`, `case 'AvisarMotorista'` (linha ~222) usa `AvisoPorTermo` quando `motorista.temAditivo` e o último termo não é Contestado; senão o conteúdo atual. `case 'RegistrarAcerto'` (linha ~248): com `estado.termoParcelas`, parcelas e mês fixos (`mesDoTermo`), aviso do mês passado quando `mesDoTermo !== estado.termoPrimeiroMes`. Botão de passo desabilitado com a mensagem do `validarPasso` (o componente já mostra o erro do validador; conferir).
  - Etapa 1 com `contestadaEm`: bloco "Contestação do motorista" com `termo.motivoContestacao` e a data.
  - `estadoDaMulta(m, termo)`: as chamadas passam o termo carregado pelo drawer (`source.termosDaMulta` já existe? conferir em `source.ts`; senão usar o que o `TermoMultaPanel` usa hoje).

- [ ] **Step 4: Rodar** os dois arquivos de teste e `pnpm --filter shell exec vitest run src/pages/frota` → PASS; `pnpm --filter shell typecheck` → sem erro.

- [ ] **Step 5: Print.** `pnpm dev` (porta 36472, modo mock), abrir `#/frota?aba=multas`, abrir a multa fictícia da etapa 2 com termo pendente e a da etapa Acertar com termo; print de cada estado (Playwright headless, skill `print-ui` se faltar `node_modules`), copiar para `~/.t3/userdata/attachments/multas-fase3-drawer-<estado>.png`.

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/frota
git commit -m "feat(multas): termo dentro do passo Avisar o motorista e acerto preso ao termo"
```

---

### Task 11: Shell: aditivo na ficha do funcionário

**Files:**
- Modify: `apps/shell/src/pages/funcionarios/components/AditivoAssinatura.tsx` (+ teste)
- Modify: `apps/shell/src/pages/funcionarios/data/types.ts`, `dataverse.ts`, `mock.ts`

**Interfaces:**
- Consumes: `new_GerarAditivoMotorista`, `new_RegistrarAditivoMotorista` (Task 8).
- Produces: `FuncionariosSource.gerarAditivo(id): Promise<{ pdfBase64: string; nomeArquivo: string }>`, `registrarAditivo(id, pdfBase64, assinadoEm: string): Promise<void>`.

- [ ] **Step 1: Teste que falha** (`AditivoAssinatura.test.tsx`, estilo do arquivo atual): sem aditivo, mostra "Gerar aditivo" e "Anexar assinado"; "Anexar assinado" pede arquivo PDF e data, e a data padrão é hoje; o erro do servidor aparece abaixo do campo; com aditivo, mostra "Assinado em dd/mm/aaaa", "Baixar" e o link "Conferir no validar.iti.gov.br" (`https://validar.iti.gov.br`, abre em nova aba); data futura bloqueia o botão com "A data da assinatura não pode ser no futuro.".

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter shell exec vitest run src/pages/funcionarios/components/AditivoAssinatura.test.tsx` → FAIL.

- [ ] **Step 3: Implementar.** Ler o componente atual (o PATCH direto em `new_aditivoassinatura` sai). `gerarAditivo` baixa o PDF (`Blob` + `URL.createObjectURL`, nome do servidor). `registrarAditivo` lê o arquivo com `FileReader` em base64 (sem o prefixo `data:`), limita 5 MB no cliente ("O PDF passa de 5 MB.") e chama a API. Mock: guarda em memória e simula a recusa quando o nome do arquivo contém `sem-assinatura` (para o teste e o print).

- [ ] **Step 4: Rodar** o teste e `pnpm --filter shell typecheck` → PASS.

- [ ] **Step 5: Print** da ficha fictícia nos estados "sem aditivo", "anexando" e "assinado" em `~/.t3/userdata/attachments/multas-fase3-aditivo-<estado>.png`.

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/funcionarios
git commit -m "feat(funcionarios): aditivo gerado e anexado com a assinatura do gov.br"
```

---

### Task 12: Mock do shell com os casos da fase 3

**Files:**
- Modify: `apps/shell/src/pages/frota/data/mock.ts` (termos na linha ~148)

- [ ] **Step 1:** Acrescentar multas e termos fictícios (motorista "Motorista Teste (fictício)", placas `TST1A23`/`ABC1D23`, autos `A000000101` a `A000000106`): (a) etapa 2 com aditivo e sem termo; (b) etapa 2 com termo pendente enviado ontem; (c) etapa 1 contestada com motivo "Eu não estava com o carro nesse dia (fictício)."; (d) etapa 2 Senatran com aceite declarado; (e) Acertar com termo assinado de 3 parcelas a partir do próximo mês; (f) Acertar com termo assinado cujo primeiro mês saiu da janela. Datas relativas a `todaySP()` (como o mock já faz), nunca fixas.

- [ ] **Step 2:** `pnpm --filter shell exec vitest run src/pages/frota` → PASS (os testes que contam multas do mock podem precisar do número novo; atualizar o número, não a regra).

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/frota/data/mock.ts apps/shell/src/pages/frota
git commit -m "test(multas): mock do shell com termo pendente, contestação, aceite declarado e acerto pelo termo"
```

---

### Task 13: App Motoristas: tela Multas com os três grupos, offline e aceite

**Files:**
- Create: `apps/motoristas/src/features/termos/minhasMultas.ts`, `minhasMultasOffline.ts`, `MinhasMultasScreen.tsx`, `AceiteCnhCard.tsx`
- Create: `apps/motoristas/src/features/termos/tests/minhasMultas.test.ts` (ou a pasta de testes que o app usa: `rg -l "termosMulta" apps/motoristas/src --glob "*.test.*"`)
- Modify: `apps/motoristas/src/features/termos/rotas.tsx`, `useTermosMulta.ts`, `termos.css`

**Interfaces:**
- Consumes: `new_MinhasMultas` (`new_MultasJson`), `new_DeclararAceiteMulta` (Task 7); PDF do termo pela API atual (`new_BaixarPdfTermoMulta`, já usada no detalhe).
- Produces:
  - `type MinhaMulta` (mesmos nomes JSON da Task 7) e `listarMinhasMultas(): Promise<MinhaMulta[]>`, `declararAceite(multaId: string): Promise<void>`.
  - `agruparMinhasMultas(itens): { precisa: MinhaMulta[]; andamento: MinhaMulta[]; encerrada: MinhaMulta[] }`.
  - `MINHAS_MULTAS_OFFLINE_KEY = "app-motoristas-minhas-multas-v1"`, `salvarMinhasMultas(usuario, itens, armazem?)`, `lerMinhasMultas(usuario, armazem?): { salvoEm: string; itens: MinhaMulta[] } | null` — no molde de `features/servicos/agendaOffline.ts` (dono do cache pelo `getCurrentUserId`, try/catch em tudo).
  - `useTermosMulta` passa a devolver também `minhasMultas`, `minhasMultasOfflineEm` e `precisaDeVoce: number` (tamanho do grupo `precisa`).

- [ ] **Step 1: Testes que falham** (`minhasMultas.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { agruparMinhasMultas, lerMinhasMultas, salvarMinhasMultas, type MinhaMulta } from '../minhasMultas';

const multa = (p: Partial<MinhaMulta>): MinhaMulta => ({ id: 'm1', auto: 'A000000001', placa: 'TST1A23', dataHora: '2026-11-05T17:30:00Z', local: 'Av. Exemplo, 100 (fictício)', infracao: 'Infração fictícia', grupo: 'andamento', situacao: 'Aguardando o pagamento', acao: null, termoId: null, termoStatus: null, prazoAceite: null, aceiteDeclaradoEm: null, parcelas: [], ...p });

function memoria() {
  const dados = new Map<string, string>();
  return { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => void dados.set(k, v), removeItem: (k: string) => void dados.delete(k) };
}

describe('minhas multas', () => {
  it('agrupa na ordem do servidor', () => {
    const g = agruparMinhasMultas([multa({ id: 'a', grupo: 'precisa', acao: 'assinar' }), multa({ id: 'b' }), multa({ id: 'c', grupo: 'encerrada' })]);
    expect([g.precisa.length, g.andamento.length, g.encerrada.length]).toEqual([1, 1, 1]);
  });
  it('cache é do usuário que salvou', () => {
    const armazem = memoria();
    salvarMinhasMultas('u1', [multa({})], armazem);
    expect(lerMinhasMultas('u1', armazem)?.itens).toHaveLength(1);
    expect(lerMinhasMultas('u2', armazem)).toBeNull();
  });
  it('cache quebrado não derruba', () => {
    const armazem = memoria();
    armazem.setItem('app-motoristas-minhas-multas-v1', '{quebrado');
    expect(lerMinhasMultas('u1', armazem)).toBeNull();
  });
});
```

Teste de tela (RTL, no estilo de `TermosMultaScreen` se houver teste; senão só os puros acima e o print):
- grupo "Precisa de você" com cartão de termo pendente ("Assine o termo da multa", botão "Abrir termo" que leva ao `TermoMultaDetalheScreen` atual) e cartão do aceite;
- `AceiteCnhCard`: texto "Abra a CNH Digital, vá em Infrações e aceite a indicação da multa {auto} até {dd/mm}." e botão "Já aceitei"; sem conexão (`navigator.onLine === false`) o botão mostra "Sem conexão, tente de novo" e não chama a API; depois de declarar, o cartão vai para "Em andamento" com "Aceite em conferência";
- offline com cache: faixa "Sem conexão. Mostrando as multas de {hh:mm}." e nenhum botão de ação ativo;
- "Encerradas" fica recolhido por padrão.

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter motoristas exec vitest run src/features/termos` → FAIL.

- [ ] **Step 3: Implementar**
  - `minhasMultas.ts`: chamada à Function `new_MinhasMultas` com o mesmo cliente que `termosMulta.ts` usa (`fetch` do cliente Dataverse do app; conferir como `listarTermosMotorista` chama), `JSON.parse(new_MultasJson)`; no mock (`isMockTermos()`), lista fictícia com um item de cada grupo.
  - `MinhasMultasScreen.tsx`: três seções ("Precisa de você", "Em andamento", "Encerradas"), cartão com placa, data/hora, local, situação e, quando houver, as parcelas ("Parcela 2 de 3 · R$ 65,08 · folha de 12/2026 · prevista"). Termo assinado: link "Ver termo assinado (PDF)". Sem valor da guia.
  - `rotas.tsx`: `screen === "multas"` passa a abrir `MinhasMultasScreen` (o detalhe do termo continua na mesma rota de hoje). A lista antiga de termos (`TermosMultaScreen`) deixa de ser a tela principal; manter o arquivo só se outra tela usar (`rg -n "TermosMultaScreen" apps/motoristas/src`); senão remover junto com os testes dela.
  - `useTermosMulta.ts`: carrega `listarMinhasMultas`, salva o cache no sucesso e, no erro de rede, lê o cache (`minhasMultasOfflineEm` = `salvoEm`). Recarrega depois de assinar, contestar e declarar.
  - `termos.css`: estilos dos grupos e do cartão com os tokens do app (sem borda lateral colorida; destaque do grupo "Precisa de você" pelo título e pelo fundo do cartão).

- [ ] **Step 4: Rodar** — `pnpm --filter motoristas exec vitest run src/features/termos` → PASS; `pnpm --filter motoristas typecheck` → sem erro.

- [ ] **Step 5: Prints** no modo mock (`pnpm --filter motoristas dev`, largura 390 px): grupos com dados, aceite antes/depois de "Já aceitei", offline com cache. Copiar para `~/.t3/userdata/attachments/multas-fase3-app-<estado>.png`.

- [ ] **Step 6: Commit**

```bash
git add apps/motoristas/src/features/termos
git commit -m "feat(app-motoristas): tela Multas com o que precisa do motorista, andamento, aceite e modo offline"
```

---

### Task 14: App Motoristas: badge da Home e capítulo do tour

**Files:**
- Modify: `apps/motoristas/src/App.tsx` (contador da Home), `apps/motoristas/src/app/tourChapters.ts`

**Interfaces:**
- Consumes: `precisaDeVoce` (Task 13).

- [ ] **Step 1: Teste que falha.** No teste do tour (`rg -l "tourChapters" apps/motoristas/src --glob "*.test.*"`), esperar um capítulo `multas` com os passos: "Multas que precisam de você aparecem aqui", "Assine o termo ou conteste pelo app", "Quando a empresa indicar você no órgão, aceite na CNH Digital e toque em Já aceitei", "Acompanhe o desconto de cada parcela". Se não houver teste do tour, testar só o contador: `precisaDeVoce` 2 → atalho Multas da Home com badge "2"; 0 → sem badge.

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter motoristas exec vitest run <arquivo>` → FAIL.

- [ ] **Step 3: Implementar.** Em `App.tsx`, trocar o contador atual (`resumoPendentes(termosMulta)`) por `precisaDeVoce`. Em `tourChapters.ts`, capítulo `multas` no formato dos vizinhos, com âncoras nos `data-tour` do `MinhasMultasScreen` (acrescentar `data-tour="multas-precisa"`, `"multas-aceite"`, `"multas-parcelas"` na Task 13 se faltar).

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/motoristas/src/App.tsx apps/motoristas/src/app/tourChapters.ts apps/motoristas/src/features/termos
git commit -m "feat(app-motoristas): badge Precisa de você e tour das multas"
```

---

### Task 15: Skills de verificação, prints e ux-audit

**Files:**
- Modify: `.claude/skills/verificar-multas/SKILL.md`, `.claude/skills/verificar-termo-multa/SKILL.md`

- [ ] **Step 1:** `verificar-multas`: casos novos (contestada no e-mail diário, termo pendente bloqueia a indicação, acerto preso ao termo, `PrazoVencido` cancela o termo) com a consulta de leitura no DEV (`cr40f_multas` com `cr40f_contestadaem`, `new_termovigente`) e o comando dos testes (`dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`).
- [ ] **Step 2:** `verificar-termo-multa`: envio só em folha e na etapa 2, assinatura que vira aviso, contestação que volta à etapa 1, expiração em D-3, lembretes automáticos, aceite declarado e push do aceite, aditivo do gov.br (gerar, anexar, conferir em validar.iti.gov.br) e a tela Multas do app (mock e DEV). Incluir a **prova manual do gov.br**: no DEV, funcionário fictício "Motorista Teste (fictício)", gerar o aditivo, assinar no gov.br com a conta do Renan, anexar; esperado: aceito. Se recusar pelo prefixo, registrar e trocar `AditivoPdf.ExigirIntegridade` para `false` num PR próprio. O PDF assinado **nunca** vai para o repositório nem para o chat.
- [ ] **Step 3: ux-audit modo Fluxo** no shell (mock): enviar termo → assinar no app (mock) → drawer mostra aviso registrado → indicar → aceite declarado → pagar → acertar. E no app (mock): abrir Multas → assinar → "Já aceitei" → offline. Veredito e até 5 achados no chat; relatório em `docs/evidencias/multas-fase3-ux-audit.md`.
- [ ] **Step 4:** skills `qualidade-antes-do-pr` e `verificacao-manter`.
- [ ] **Step 5: Commit**

```bash
git add .claude/skills docs/evidencias/multas-fase3-ux-audit.md
git commit -m "docs(multas): verificação da fase 3 e relatório do ux-audit"
```

---

### Task 16: PR, DEV e virada no PROD

- [ ] **Step 1: PR** da branch de implementação (worktree nova a partir de `origin/develop`, não esta branch de spec) para a `develop`, com o resumo por área, os prints e "Não verificado: comportamento com o Dataverse DEV (após o Deploy)". Linkar o PR.
- [ ] **Step 2: Depois do merge**, o Deploy do DEV aplica a migration, grava os textos v1, publica as DLLs do Frota e do DriverRecordSharing e atualiza o `termo-multa` e o `multas-do-dia`. Conferir no resumo do Deploy.
- [ ] **Step 3: À mão no DEV** (checkout principal na `develop` atualizada, nunca em paralelo com o Deploy): `register-multas-fase3-customapis.ps1` (dry-run, depois `-Apply`); `provision-flow-multa-aceite-push.ps1` uma vez (nasce com dono na conta do Renan e ligado).
- [ ] **Step 4: Prova no DEV** com dados fictícios: as skills `verificar-multas` e `verificar-termo-multa` inteiras, mais a prova do gov.br (Task 15, Step 2).
- [ ] **Step 5: PROD** pelo `develop → main` (merge do Renan): migration e APIs vão pelas soluções ("Publicar soluções"); depois, à mão no PROD, `gravar-texto-termo.ps1 -Versao v1 -Apply` (registros não viajam nas soluções) e o flow do push do aceite. Só com pedido explícito do Renan.

---

## Autorrevisão

**Cobertura da spec:**
- Seção 3 (termo como aviso da etapa 2) → Tasks 2, 3, 6, 10.
- Seção 4 (schema) → Task 1.
- Seção 5.1 envio só folha/12/janela/etapa 2 → Tasks 6, 10. 5.2 expiração D-3 e lembretes → Tasks 5, 6, 9. 5.3 contestação → Tasks 2, 3, 4, 6, 10. 5.4 aceite na CNH Digital → Tasks 4, 5, 7, 9, 13. 5.5 aditivo gov.br → Tasks 8, 11. 5.6 acerto preso ao termo → Tasks 2, 3, 10.
- Seção 6 (app) → Tasks 7, 13, 14. Seção 7 (e-mail diário) → Task 4. Seção 8 (textos v1) → Task 1. Seção 9 (verificação) → Task 15. Seção 10 → resolvida acima.

**Consistência de nomes:** `TermoAssinado`/`TermoContestado` (Tasks 2, 3, 6); `termoPendente`/`termoParcelas`/`termoPrimeiroMes`/`termoValor`/`contestadaEm`/`aceiteDeclaradoEm` (2, 3, 4, 10); `MesDoTermo`/`mesDoTermo` (2, 10); `new_Expirou`, `new_Lembrou`, `new_Automatico` (6, 8, 9); `new_MultasJson` (7, 8, 13); `CamposDasApisDoTermo` (3, 7).

**Riscos que o implementador precisa conferir no código (e não assumir):** assinatura de `Get-Coluna`/`Invoke-Dv` em `_dv.ps1` (Task 1); nome da coluna do texto congelado do termo e dos parâmetros de `cr40f_PassoMulta` (Task 6); se o upload em blocos do PDF fica dentro da transação (Task 6, Step 4.5); se `MiniPdf` escreve data ou ID (Task 8); formato de `mudancas` no fixture (Task 2).
