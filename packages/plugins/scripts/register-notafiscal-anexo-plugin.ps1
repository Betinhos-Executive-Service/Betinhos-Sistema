param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Registra no DEV o plugin type Betinhos.DriverRecordSharing.NotaFiscalAnexoPlugin e os dois steps sincronos de
# pre-operacao (stage 20) em cr40f_anexodespesaoperacional: Create e Update (filtro cr40f_chaveacesso, cr40f_situacaonota).
# Coloca os steps na AppBetinhos; a distribuicao do proximo Deploy leva para a BetinhosAutomacao (regras.json, tipo 92).
# O Deploy so troca o conteudo do assembly (push-driverrecordsharing-plugin.ps1); plugin type e step novos continuam a mao.
# Rode do checkout principal na develop atualizada, DEPOIS que o Deploy aplicar a migration 20261116-2100-chave-nota-fiscal.ps1
# e publicar o assembly com a classe nova. O PROD recebe pelas solucoes.
# Idempotente: confere o que existe antes de criar; nunca exclui. Sem -Apply so mostra o plano. Somente DEV.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/register-notafiscal-anexo-plugin.ps1 [-Apply]

. "$PSScriptRoot\..\..\deploy\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$Assembly = "Betinhos.DriverRecordSharing"
$TypeName = "Betinhos.DriverRecordSharing.NotaFiscalAnexoPlugin"
$Tabela = "cr40f_anexodespesaoperacional"
$Passos = @(
  [pscustomobject]@{ Mensagem = "Create"; Nome = "NotaFiscalAnexoPlugin: Create of cr40f_anexodespesaoperacional (pre)"; Filtro = $null },
  [pscustomobject]@{ Mensagem = "Update"; Nome = "NotaFiscalAnexoPlugin: Update of cr40f_anexodespesaoperacional (pre)"; Filtro = "cr40f_chaveacesso,cr40f_situacaonota" }
)

$assemblyAtual = @(Get-Rows "pluginassemblies" "pluginassemblyid" "name eq '$Assembly'")
if ($assemblyAtual.Count -ne 1) { throw "Assembly $Assembly nao encontrado no DEV." }
foreach ($coluna in "cr40f_chaveacesso", "cr40f_situacaonota") {
  if (-not (Get-Coluna $Tabela $coluna)) { Write-Step "AVISO: $Tabela.$coluna ainda nao existe (a migration 20261116-2100 nao rodou); com -Apply o script para." ; if ($Apply) { throw "Coluna $coluna ausente." } }
}

# 1. Tipo de plugin
$type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
if ($type.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria o plugin type $TypeName (exige o assembly publicado com a classe)." }
  else {
    Invoke-Dv "POST" "plugintypes" @{ typename = $TypeName; name = $TypeName; friendlyname = "NotaFiscalAnexoPlugin"; "pluginassemblyid@odata.bind" = "/pluginassemblies($($assemblyAtual[0].pluginassemblyid))" } | Out-Null
    $type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
    if ($type.Count -ne 1) { throw "Plugin type $TypeName nao apareceu depois do POST." }
    Write-Step "criado o plugin type $TypeName"
  }
} else { Write-Step "plugin type $TypeName ja existe" }
$typeId = if ($type.Count -eq 1) { [string]$type[0].plugintypeid } else { $null }

# 2. Steps
foreach ($p in $Passos) {
  $msg = @(Get-Rows "sdkmessages" "sdkmessageid" "name eq '$($p.Mensagem)'")
  if ($msg.Count -ne 1) { throw "Mensagem $($p.Mensagem) nao encontrada." }
  $filtro = @(Get-Rows "sdkmessagefilters" "sdkmessagefilterid" "_sdkmessageid_value eq $($msg[0].sdkmessageid) and primaryobjecttypecode eq '$Tabela'")
  if ($filtro.Count -ne 1) { throw "Filtro de $($p.Mensagem) para $Tabela nao encontrado." }
  $atual = @(if ($typeId) { Get-Rows "sdkmessageprocessingsteps" "sdkmessageprocessingstepid,stage,mode,filteringattributes" "_eventhandler_value eq $typeId and _sdkmessageid_value eq $($msg[0].sdkmessageid) and _sdkmessagefilterid_value eq $($filtro[0].sdkmessagefilterid)" })
  if ($atual.Count -gt 1) { throw "Mais de um step $($p.Mensagem) para $TypeName; confira antes de seguir." }
  if ($atual.Count -eq 1) {
    $s = $atual[0]
    if ([int]$s.stage -ne 20 -or [int]$s.mode -ne 0 -or [string]$s.filteringattributes -ne [string]$p.Filtro) { throw "Step $($p.Mensagem) existe fora do desenho (stage $($s.stage), mode $($s.mode), filtro '$($s.filteringattributes)')." }
    Write-Step "step $($p.Mensagem) ja existe"
    Add-ComponenteNaSolucao $s.sdkmessageprocessingstepid 92
    continue
  }
  if (-not $Apply) { Write-Step "DRY RUN criaria o step $($p.Nome) (stage 20, sincrono$(if ($p.Filtro) { ", filtro $($p.Filtro)" }))."; continue }
  $corpo = @{
    name = $p.Nome; description = "Confere a chave da nota fiscal do comprovante da despesa (DV, mes, uso unico)."
    stage = 20; mode = 0; rank = 1; supporteddeployment = 0; asyncautodelete = $false
    "sdkmessageid@odata.bind" = "/sdkmessages($($msg[0].sdkmessageid))"
    "sdkmessagefilterid@odata.bind" = "/sdkmessagefilters($($filtro[0].sdkmessagefilterid))"
    "eventhandler_plugintype@odata.bind" = "/plugintypes($typeId)"
  }
  if ($p.Filtro) { $corpo.filteringattributes = $p.Filtro }
  Invoke-Dv "POST" "sdkmessageprocessingsteps" $corpo | Out-Null
  $criado = @(Get-Rows "sdkmessageprocessingsteps" "sdkmessageprocessingstepid" "_eventhandler_value eq $typeId and _sdkmessageid_value eq $($msg[0].sdkmessageid) and _sdkmessagefilterid_value eq $($filtro[0].sdkmessagefilterid)")
  if ($criado.Count -ne 1) { throw "Step $($p.Mensagem) nao apareceu depois do POST." }
  Add-ComponenteNaSolucao $criado[0].sdkmessageprocessingstepid 92
  Write-Step "criado o step $($p.Nome)"
}
if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
Write-Step "OK: $TypeName com os steps Create e Update em $Tabela."
