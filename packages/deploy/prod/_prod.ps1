# Funções comuns aos scripts de PROD (App Betinhos Produção, orgf261ae8e). Carregue com: . "$PSScriptRoot/_prod.ps1"
# Os scripts de DEV (packages/deploy/*.ps1) continuam travados no DEV; estes só falam com o PROD e conferem a organização
# antes de qualquer gravação. Nunca leem nem imprimem valores de segredo nem URLs assinadas (sig=).
# Requer `az login` com acesso ao PROD.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:ProdUrl = 'https://orgf261ae8e.crm2.dynamics.com'
$script:ProdOrgId = '9e4ef53e-8bfc-f011-89f6-6045bd3ad1ec'
$script:ProdEnvironmentId = '6847878f-5a6f-e08b-aed6-d7119975e3e1'
$script:BackupDir = Join-Path $PSScriptRoot '../flows/backup'

$dvToken = & az account get-access-token --resource "$script:ProdUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse PROD indisponível (rode az login).' }
$script:ProdHeaders = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[prod] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$script:ProdUrl/api/data/v9.2/$Path"; Headers = $script:ProdHeaders; TimeoutSec = 90 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # O Dataverse responde sem charset; o PowerShell 5.1 leria como Latin-1 e corromperia os acentos. Decodifica UTF-8.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}

function AssertProd() {
  if (([Uri]$script:ProdUrl).Host -ne 'orgf261ae8e.crm2.dynamics.com') { throw 'Somente PROD.' }
  $who = Dv GET WhoAmI
  if ($who.OrganizationId -ne $script:ProdOrgId) { throw 'A API não respondeu pela organização PROD.' }
}

function AssertSemMojibake([string] $s, [string] $origem) {
  if ($s -cmatch 'Ã|Â|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}

function GetFlow([string] $name) {
  $rows = @((Dv GET "workflows?`$select=workflowid,statecode,statuscode,clientdata,resourceid&`$filter=name eq '$($name.Replace("'", "''"))' and category eq 5").value)
  if ($rows.Count -ne 1) { throw "Flow '$name' ausente ou duplicado no PROD." }
  return $rows[0]
}

function BackupFlow($row, [string] $prefixo) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $script:BackupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $script:BackupDir ("PROD-$prefixo-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[prod] backup: $file"
  return $file
}

# Grava o clientdata. Se o flow estava ativo, desativa, grava e reativa (mesmo se a gravação falhar).
function ApplyFlow($row, [string] $clientData) {
  AssertSemMojibake $clientData 'clientdata a gravar'
  $id = $row.workflowid
  if ($row.statecode -ne 1) { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null; return }
  Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null }
  finally {
    Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
    $after = Dv GET "workflows($id)?`$select=statecode"
    if ($after.statecode -ne 1) { throw "Flow não reativou (statecode $($after.statecode)). Restaure pelo backup." }
  }
}

function ReadBackup([string] $path) {
  return [IO.File]::ReadAllText((Resolve-Path $path), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
}

# Quantidade de valores atuais de uma variável de ambiente (nunca lê o valor).
function EnvVarValueCount([string] $schemaName) {
  $d = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$schemaName'").value)
  if ($d.Count -ne 1) { throw "Variável $schemaName ausente no PROD." }
  $v = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $($d[0].environmentvariabledefinitionid)").value)
  return [pscustomobject]@{ DefinitionId = $d[0].environmentvariabledefinitionid; Count = $v.Count; ValueIds = @($v | ForEach-Object { $_.environmentvariablevalueid }) }
}
