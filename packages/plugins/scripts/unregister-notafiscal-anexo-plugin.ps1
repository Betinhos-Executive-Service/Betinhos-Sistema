param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# ORDEM OBRIGATORIA NO DEV: rode este script com -Apply ANTES do merge do PR que remove a fase 3 do anexo seguro.
# O Deploy nao consegue atualizar o assembly Betinhos.DriverRecordSharing sem a classe NotaFiscalAnexoPlugin enquanto o
# plugin type dela estiver registrado. Ordem: 1) este script com -Apply; 2) merge; 3) Deploy (roda a migration destrutiva
# 20261116-2200-remover-chave-nota-fiscal.ps1 e publica o assembly sem a classe).
#
# Desfaz o register-notafiscal-anexo-plugin.ps1 (fase 3 cancelada em 16/11/2026, decisao do Renan): apaga os 2 steps
# (Create e Update de cr40f_anexodespesaoperacional) e o plugin type Betinhos.DriverRecordSharing.NotaFiscalAnexoPlugin.
# Apagar o componente tira ele de todas as solucoes (AppBetinhos e BetinhosAutomacao); o script confere no fim.
# Idempotente: o que ja nao existe e pulado. Sem -Apply so mostra o plano. Somente DEV (Connect-Dv recusa outro host).
# Rode do checkout principal. O PROD nunca recebeu a fase 3.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/unregister-notafiscal-anexo-plugin.ps1 [-Apply]

. "$PSScriptRoot\..\..\deploy\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$TypeName = "Betinhos.DriverRecordSharing.NotaFiscalAnexoPlugin"

function Get-SolucoesDoComponente([string] $ObjectId) {
  $linhas = @(Get-Rows "solutioncomponents" "_solutionid_value" "objectid eq $ObjectId")
  return @(foreach ($l in $linhas) { (Invoke-Dv "GET" "solutions($($l._solutionid_value))?`$select=uniquename").uniquename })
}

$type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
if ($type.Count -eq 0) { Write-Step "plugin type $TypeName ja nao existe; nada a remover."; if (-not $Apply) { Write-Step "dry-run: nada gravado." }; return }
$typeId = [string]$type[0].plugintypeid

# 1. Steps (antes do plugin type: o Dataverse recusa apagar o type com step)
$steps = @(Get-Rows "sdkmessageprocessingsteps" "sdkmessageprocessingstepid,name" "_eventhandler_value eq $typeId")
$removidos = @()
foreach ($s in $steps) {
  $stepId = [string]$s.sdkmessageprocessingstepid
  $solucoes = (Get-SolucoesDoComponente $stepId) -join ", "
  if (-not $Apply) { Write-Step "DRY RUN apagaria o step '$($s.name)' ($stepId; solucoes: $(if ($solucoes) { $solucoes } else { 'nenhuma' }))."; continue }
  Invoke-Dv "DELETE" "sdkmessageprocessingsteps($stepId)" | Out-Null
  $removidos += $stepId
  Write-Step "OK: step '$($s.name)' apagado."
}

# 2. Plugin type
$solucoesType = (Get-SolucoesDoComponente $typeId) -join ", "
if (-not $Apply) {
  Write-Step "DRY RUN apagaria o plugin type $TypeName ($typeId; solucoes: $(if ($solucoesType) { $solucoesType } else { 'nenhuma' }))."
  Write-Step "dry-run: nada gravado."
  return
}
Invoke-Dv "DELETE" "plugintypes($typeId)" | Out-Null
Write-Step "OK: plugin type $TypeName apagado."

# 3. Conferencia: nada sobra nas solucoes
foreach ($id in @($removidos + $typeId)) {
  $resto = @(Get-Rows "solutioncomponents" "solutioncomponentid" "objectid eq $id")
  if ($resto.Count -gt 0) { throw "Componente $id ainda aparece em $($resto.Count) solucao(oes)." }
}
if (@(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'").Count -ne 0) { throw "Plugin type $TypeName continua no DEV." }
Write-Step "OK: $TypeName e os steps fora do DEV e das solucoes."
