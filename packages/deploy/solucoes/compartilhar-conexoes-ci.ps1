param(
  [ValidateSet("test", "prod")] [string[]] $Ambientes = @("test", "prod"),
  # Variavel do environment do GitHub com o id da conexao (o mesmo que o import usa no --settings-file).
  [string] $Variavel = "CONEXAO_WEBPUSH",
  # Trecho do nome do conector; o sufixo muda por ambiente.
  [string] $Conector = "new-5fapp-20motoristas-20web-20push",
  # Sem -Aplicar so lista o que faria.
  [switch] $Aplicar
)

# Por que existe: o import com --settings-file vincula a connection reference a uma conexao, e o Power Platform
# exige que quem importa (a conta do CI, "Betinhos CI GitHub") possa usar a conexao; senao o import falha com
# ConnectionAuthorizationFailed. A API de conexoes nao aceita compartilhar direto com service principal
# (400 InvalidPrincipalInModifyPermissions), entao o compartilhamento vai para um grupo de seguranca que
# contem o service principal do CI. Rode como dono da conexao, com o Azure CLI logado no tenant e o cache
# do MSAL.PS ja autenticado (o token do Power Platform e silencioso; nao ha segredo no repositorio).
# Idempotente: so cria o que falta e nunca remove nem altera outras permissoes.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")

$tenant = "bed8b3ad-d487-4193-a748-09e16f0e0327"
$spCi = "59970890-857b-4d33-b172-4e7ddcd353dc"
$apelido = "powerplatform-conexoes-ci"
# Travessao e acentos montados por codigo pelo mesmo motivo das mensagens sem acento.
$nomeGrupo = "Power Platform " + [char]0x2013 + " conex" + [char]0x00F5 + "es do CI"
$descricao = "Conta de servi" + [char]0x00E7 + "o do CI (Betinhos CI GitHub) com acesso de uso a conex" + [char]0x00F5 + "es do Power Platform. Gerido por packages/deploy/solucoes/compartilhar-conexoes-ci.ps1."
$envIds = @{ test = "aefb8532-5148-e293-9e29-1bf0b3a89be3"; prod = "6847878f-5a6f-e08b-aed6-d7119975e3e1" }
$modo = if ($Aplicar) { "aplicar" } else { "so listar" }
$pendencias = 0

function Invoke-Az([string[]] $Argumentos) {
  $saida = & az @Argumentos
  if ($LASTEXITCODE -ne 0) { throw "az $($Argumentos[0..2] -join ' ') falhou (exit $LASTEXITCODE)." }
  return $saida
}

$conta = Invoke-Az @("account", "show", "--query", "tenantId", "-o", "tsv")
if ($conta -ne $tenant) { throw "Azure CLI fora do tenant $tenant. Rode az login no tenant certo." }
Write-Step "modo: $modo"

# 1. Grupo e membro, pelo Graph via Azure CLI.
$grupos = @(Invoke-Az @("ad", "group", "list", "--filter", "mailNickname eq '$apelido'", "--query", "[].id", "-o", "tsv") | Where-Object { $_ })
if ($grupos.Count -gt 1) { throw "Mais de um grupo com mailNickname $apelido; resolva a duplicata antes." }
$grupo = if ($grupos.Count -eq 1) { $grupos[0] } else { $null }
if ($grupo) { Write-Step "grupo $grupo ja existe" }
else {
  $pendencias++
  if (-not $Aplicar) { Write-Step "criaria o grupo $apelido e poria o CI como membro" }
  else {
    $corpo = Join-Path ([IO.Path]::GetTempPath()) "grupo-conexoes-ci.json"
    $json = @{ displayName = $nomeGrupo; mailNickname = $apelido; mailEnabled = $false; securityEnabled = $true; description = $descricao } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($corpo, $json, (New-Object Text.UTF8Encoding $false))
    try { $grupo = Invoke-Az @("rest", "--method", "POST", "--url", "https://graph.microsoft.com/v1.0/groups", "--headers", "Content-Type=application/json", "--body", "@$corpo", "--query", "id", "-o", "tsv") }
    finally { Remove-Item $corpo -ErrorAction SilentlyContinue }
    Write-Step "grupo $grupo criado"
  }
}
if ($grupo) {
  $membro = Invoke-Az @("ad", "group", "member", "check", "--group", $grupo, "--member-id", $spCi, "--query", "value", "-o", "tsv")
  if ($membro -eq "true") { Write-Step "CI ja e membro do grupo" }
  else {
    $pendencias++
    if ($Aplicar) { Invoke-Az @("ad", "group", "member", "add", "--group", $grupo, "--member-id", $spCi) | Out-Null; Write-Step "CI adicionado ao grupo" }
    else { Write-Step "adicionaria o CI ao grupo" }
  }
}

# 2. Conexoes: grupo com CanView (ou papel maior que ja exista).
Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId $script:ClientIdPadrao -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$token = try { (Get-MsalToken -PublicClientApplication $client -Scopes "https://service.powerapps.com/.default" -Silent).AccessToken } catch { $null }
if (-not $token) { throw "Token silencioso do Power Platform indisponivel. Autentique o MSAL.PS (por exemplo um pnpm push local) como dono da conexao e rode de novo." }
$ph = @{ Authorization = "Bearer $token"; Accept = "application/json" }
$api = "https://api.powerapps.com/providers/Microsoft.PowerApps/scopes/admin/environments"

foreach ($amb in $Ambientes) {
  $envId = $envIds[$amb]
  $vars = (gh variable list --env $amb --json name,value) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw "gh variable list --env $amb falhou." }
  # Atribuir antes de filtrar: no PowerShell 5.1 o ConvertFrom-Json entrega o array inteiro como um item so.
  $lista = $vars | ConvertFrom-Json
  $conexao = @($lista | Where-Object { $_.name -eq $Variavel } | ForEach-Object { $_.value }) | Select-Object -First 1
  if (-not $conexao) { throw "$amb`: variavel $Variavel vazia no environment do GitHub." }
  $conectores = @((Invoke-RestMethod -Uri "$api/$envId/apis?api-version=2016-11-01" -Headers $ph).value | Where-Object { $_.name -match $Conector })
  $achados = @(foreach ($c in $conectores) {
      $cs = @((Invoke-RestMethod -Uri "$api/$envId/apis/$($c.name)/connections?api-version=2016-11-01" -Headers $ph).value)
      if (@($cs | Where-Object { $_.name -eq $conexao }).Count -eq 1) { $c.name }
    })
  if ($achados.Count -ne 1) { throw "$amb`: conexao de $Variavel nao encontrada (ou repetida) nos conectores $Conector ($($achados.Count))." }
  $base = "$api/$envId/apis/$($achados[0])/connections/$conexao"
  $rotulo = "$amb conexao $($conexao.Substring(0, 6))...$($conexao.Substring($conexao.Length - 4))"
  if (-not $grupo) { $pendencias++; Write-Step "$rotulo`: concederia CanView ao grupo"; continue }
  $perms = @((Invoke-RestMethod -Uri "$base/permissions?api-version=2016-11-01" -Headers $ph).value)
  $doGrupo = @($perms | Where-Object { $_.properties.principal.id -eq $grupo })
  if ($doGrupo.Count -gt 0) { Write-Step "$rotulo`: grupo ja tem $($doGrupo[0].properties.roleName)"; continue }
  $pendencias++
  if (-not $Aplicar) { Write-Step "$rotulo`: concederia CanView ao grupo"; continue }
  $body = @{ put = @(@{ properties = @{ roleName = "CanView"; principal = @{ id = $grupo; type = "Group"; tenantId = $tenant } } }); delete = @() } | ConvertTo-Json -Depth 6 -Compress
  Invoke-RestMethod -Method Post -Uri "$base/modifyPermissions?api-version=2016-11-01" -Headers ($ph + @{ "Content-Type" = "application/json" }) -Body $body | Out-Null
  $confere = @((Invoke-RestMethod -Uri "$base/permissions?api-version=2016-11-01" -Headers $ph).value | Where-Object { $_.properties.principal.id -eq $grupo })
  if ($confere.Count -eq 0) { throw "$rotulo`: CanView gravado mas nao aparece na releitura." }
  Write-Step "$rotulo`: CanView concedido ao grupo"
}

if ($pendencias -eq 0) { Write-Step "nada a fazer" }
elseif (-not $Aplicar) { Write-Step "$pendencias pendencia(s); rode com -Aplicar para gravar" }
else { Write-Step "$pendencias pendencia(s) aplicada(s)" }
