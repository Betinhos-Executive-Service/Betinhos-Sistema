param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [switch] $Aplicar,
  # Avanca mesmo sem Custom API mais nova que o carimbo (remedio a mao).
  [switch] $Forcar
)

# Faz o conector Dataverse do Power Automate enxergar Custom API nova (ou parametro novo de Custom API existente).
# Causa (provada no DEV em 18/11/2026): registrar Custom API grava so linhas de dados (customapi, sdkmessage) e NAO avanca o
# carimbo de metadata do ambiente (RetrieveTimestamp, que e o ETag do $metadata). O conteudo do $metadata muda, o ETag nao; o
# conector revalida pelo ETag, recebe 304 e fica com a lista antiga para sempre. Gravar flow que usa a API falha com
# InvalidOpenApiFlow/XrmApiRequestFailed (acao nova) ou WorkflowOperationParametersExtraParameter (parametro novo).
# PublishXml/PublishAllXml nao avancam o carimbo quando nao ha mudanca pendente.
# O que faz: compara o maior versionnumber de customapi, customapirequestparameter e customapiresponseproperty com o carimbo.
# Se algum for maior (ou com -Forcar), cria e apaga um choice global temporario (mudanca real de metadata, fora de solucao) e
# confere que o carimbo passou. Sem -Aplicar so informa. Sem Custom API nova nao muda nada.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")

$NomeTemporario = "new_tmpcarimbometadata"

if ([Environment]::GetEnvironmentVariable("DV_CLIENT_SECRET")) { $dv = Connect-Dataverse $EnvironmentUrl }
else {
  # Local: az login ja feito (mesma conta dos provision-flow-*.ps1).
  $base = $EnvironmentUrl.TrimEnd("/")
  $token = & az account get-access-token --resource "$base/" --query accessToken -o tsv
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token do Dataverse indisponivel (az login)." }
  $dv = @{ Api = "$base/api/data/v9.2"; Headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0" } }
}

function Get-Carimbo { [long] (Invoke-RestMethod -Method Get -Uri "$($dv.Api)/RetrieveTimestamp" -Headers $dv.Headers).Timestamp }

function Get-MaiorVersao {
  $maior = [long] 0
  foreach ($tabela in "customapis", "customapirequestparameters", "customapiresponseproperties") {
    $linha = @((Invoke-RestMethod -Method Get -Uri "$($dv.Api)/${tabela}?`$select=versionnumber&`$orderby=versionnumber desc&`$top=1" -Headers $dv.Headers).value)
    if ($linha.Count -and [long] $linha[0].versionnumber -gt $maior) { $maior = [long] $linha[0].versionnumber }
  }
  $maior
}

function Remove-Temporario {
  try { Invoke-RestMethod -Method Delete -Uri "$($dv.Api)/GlobalOptionSetDefinitions(Name='$NomeTemporario')" -Headers $dv.Headers | Out-Null; return $true }
  catch { return $false }
}

$carimbo = Get-Carimbo
$versao = Get-MaiorVersao
Write-Step "carimbo de metadata $carimbo; Custom API mais recente $versao"
if ($versao -le $carimbo -and -not $Forcar) { Write-Step "conector em dia: nada a fazer"; exit 0 }
if (-not $Aplicar) { Write-Step "o carimbo precisa avancar para o conector do Power Automate enxergar as Custom APIs. Rode com -Aplicar."; exit 0 }

Remove-Temporario | Out-Null   # sobra de execucao interrompida
$rotulo = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = "temporario (carimbo de metadata)"; LanguageCode = 1046 }) }
$corpo = @{
  "@odata.type" = "#Microsoft.Dynamics.CRM.OptionSetMetadata"; Name = $NomeTemporario; DisplayName = $rotulo; IsGlobal = $true; OptionSetType = "Picklist"
  Options = @(@{ Value = 100000000; Label = $rotulo })
}
try {
  Invoke-RestMethod -Method Post -Uri "$($dv.Api)/GlobalOptionSetDefinitions" -Headers $dv.Headers -Body (ConvertTo-Json -InputObject $corpo -Depth 8) -ContentType "application/json; charset=utf-8" | Out-Null
}
catch { throw "Nao criou o choice temporario: $(Get-ErroDv $_)" }
if (-not (Remove-Temporario)) { throw "Choice temporario $NomeTemporario ficou no ambiente: apague a mao." }

$novo = Get-Carimbo
if ($novo -le $versao) { throw "Carimbo de metadata continua em $novo (Custom API em $versao): o conector segue sem enxergar a API nova." }
Write-Step "carimbo de metadata avancou de $carimbo para $novo"
