param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [string] $Tabelas,
  [Parameter(Mandatory = $true)] [string] $Pasta
)

# Somente leitura, em qualquer ambiente: grava em JSON todos os registros das tabelas (nomes logicos separados por virgula)
# que a retirada da AppBetinhos vai apagar junto com a tabela. Um arquivo por tabela; tabela ausente e avisada, nao falha.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")

if (-not [IO.Path]::IsPathRooted($Pasta)) { $Pasta = Join-Path $PWD $Pasta }
$Pasta = (New-Item -ItemType Directory -Force -Path $Pasta).FullName
$dv = Connect-Dataverse $EnvironmentUrl $null
foreach ($t in @($Tabelas -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
  # Nome logico entra num $filter OData sem escape: so letras, digitos e sublinhado.
  if ($t -notmatch '^[a-z0-9_]+$') { throw "'$t' nao e nome logico de tabela." }
  $def = @(Read-DvAll $dv "EntityDefinitions?`$select=LogicalName,EntitySetName&`$filter=LogicalName eq '$t'")
  if ($def.Count -ne 1) { Write-Step "$t nao existe em $($dv.Host); nada a exportar"; continue }
  $linhas = @(Read-DvAll $dv ([string] $def[0].EntitySetName))
  Write-JsonFile (Join-Path $Pasta "$t.json") @($linhas)
  Write-Step "${t}: $($linhas.Count) registro(s) gravado(s) em $Pasta"
}
