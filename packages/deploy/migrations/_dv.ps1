# Helper das migrations de schema (packages/deploy/migrations/AAAAMMDD-HHMM-*.ps1). Dot-source: . "$PSScriptRoot\_dv.ps1".
# Roda no Windows PowerShell 5.1 do Deploy e no pwsh. Somente DEV; o PROD recebe o schema pelas solucoes.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$script:HostDev = "org23b93544.crm2.dynamics.com"
$script:SolucaoDev = "AppBetinhos"

function Label([string] $Text) { return @{ LocalizedLabels = @(@{ Label = $Text; LanguageCode = 1046 }) } }
function Write-Step([string] $Message) { Write-Host "[migration] $Message" }

# Recusa host diferente do DEV, pega o token (az login ja feito: conta de servico no Deploy, usuario no local) e guarda o estado.
# $Arquivo = $PSCommandPath da migration (usado para conferir o cabecalho "# destrutiva:").
function Connect-Dv([string] $EnvironmentUrl, [string] $Arquivo, [bool] $Apply) {
  if (([Uri]$EnvironmentUrl).Host -ne $script:HostDev) { throw "Somente DEV ($script:HostDev)." }
  $base = $EnvironmentUrl.TrimEnd("/")
  $token = & az account get-access-token --resource "$base/" --query accessToken -o tsv
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token do Dataverse DEV indisponivel (rode az login)." }
  $script:DvToken = $token
  $script:DvApi = "$base/api/data/v9.2"
  $script:Arquivo = $Arquivo
  $script:Apply = $Apply
}

# Repete em 429 e 5xx (espera 2, 4, 8, 16 s); outros erros falham na hora com o corpo da resposta.
function Invoke-Dv([string] $Method, [string] $Path, $Body = $null) {
  $headers = @{ Authorization = "Bearer $script:DvToken"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $script:SolucaoDev }
  $params = @{ Method = $Method; Uri = "$script:DvApi/$Path"; Headers = $headers }
  if ($null -ne $Body) {
    $params.ContentType = "application/json; charset=utf-8"
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 50 -Compress))
  }
  for ($tentativa = 1; ; $tentativa++) {
    try { return Invoke-RestMethod @params }
    catch {
      $status = 0
      if ($_.Exception.Response) { $status = [int] $_.Exception.Response.StatusCode }
      if (($status -eq 429 -or $status -ge 500) -and $tentativa -lt 5) { Start-Sleep -Seconds ([math]::Pow(2, $tentativa)); continue }
      $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
      throw "Dataverse $Method $Path falhou: $detail"
    }
  }
}

function Get-Rows([string] $Set, [string] $Select, [string] $Filter) {
  return @((Invoke-Dv "GET" "${Set}?`$select=$Select&`$filter=$([uri]::EscapeDataString($Filter))").value)
}

# Metadata da coluna ($null se nao existe).
function Get-Coluna([string] $Tabela, [string] $Coluna) {
  $achadas = @(Get-Rows "EntityDefinitions(LogicalName='$Tabela')/Attributes" "MetadataId,LogicalName" "LogicalName eq '$Coluna'")
  if ($achadas.Count -gt 1) { throw "Coluna $Tabela.$Coluna nao ficou unica." }
  if ($achadas.Count -eq 0) { return $null }
  return $achadas[0]
}

# Coloca o componente na solucao (idempotente). Tipos: 1 tabela (EntityDefinition MetadataId), 2 coluna.
function Add-ComponenteNaSolucao([string] $MetadataId, [int] $Tipo) {
  $solucaoId = (Get-Rows "solutions" "solutionid" "uniquename eq '$script:SolucaoDev'")[0].solutionid
  $ja = @(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solucaoId and objectid eq $MetadataId and componenttype eq $Tipo")
  if ($ja.Count -eq 0) {
    Invoke-Dv "POST" "AddSolutionComponent" @{ ComponentId = $MetadataId; ComponentType = $Tipo; SolutionUniqueName = $script:SolucaoDev; AddRequiredComponents = $false; DoNotIncludeSubcomponents = $false } | Out-Null
  }
}

function Publish-Tabela([string] $Tabela) {
  Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$Tabela</entity></entities></importexportxml>" } | Out-Null
}

# Remocao: so com o cabecalho "# destrutiva: <tabela>[.<coluna>] - <motivo>" na migration (e a entrada em remocoes.json, conferida no CI).
function Assert-Destrutiva([string] $Alvo) {
  $cabecalho = @(Get-Content -LiteralPath $script:Arquivo | Where-Object { $_ -match "^# destrutiva: $([regex]::Escape($Alvo)) - \S" })
  if ($cabecalho.Count -eq 0) { throw "Remocao de $Alvo sem o cabecalho '# destrutiva: $Alvo - <motivo>' na migration." }
}

# Remove a coluna do DEV (sai da AppBetinhos junto). No PROD o upgrade das solucoes apaga o que saiu.
function Remove-Coluna([string] $Tabela, [string] $Coluna) {
  Assert-Destrutiva "$Tabela.$Coluna"
  $c = Get-Coluna $Tabela $Coluna
  if (-not $c) { Write-Step "coluna $Tabela.$Coluna ja nao existe."; return }
  if (-not $script:Apply) { Write-Step "DRY RUN removeria $Tabela.$Coluna. Use -Apply para aplicar."; return }
  Invoke-Dv "DELETE" "EntityDefinitions(LogicalName='$Tabela')/Attributes($($c.MetadataId))" | Out-Null
  Publish-Tabela $Tabela
  Write-Step "OK: $Tabela.$Coluna removida."
}

# Apaga a tabela do DEV, com os registros dela.
function Remove-Tabela([string] $Tabela) {
  Assert-Destrutiva $Tabela
  $t = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$Tabela'")
  if ($t.Count -eq 0) { Write-Step "tabela $Tabela ja nao existe."; return }
  if (-not $script:Apply) { Write-Step "DRY RUN apagaria a tabela $Tabela. Use -Apply para aplicar."; return }
  Invoke-Dv "DELETE" "EntityDefinitions($($t[0].MetadataId))" | Out-Null
  Write-Step "OK: tabela $Tabela apagada."
}
