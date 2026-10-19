param(
  [switch] $Apply,
  # Validade do segredo. Curta de propósito: renove com -SoRenovarSegredo antes de vencer.
  [int] $DiasSegredo = 90,
  [switch] $SoRenovarSegredo
)
# Conta de serviço do plantão de erros na nuvem (episódio 4). Rode você mesmo, com az login de administrador.
# - Cria (idempotente) o app registration "Plantao Claude - Leitura" e a entidade de serviço.
# - PROD: papel "Plantão - Leitura" só com Read (Organização) em flowrun, workflow e cr40f_errodosistema (quando existir).
# - DEV: o mesmo papel, mais Write em cr40f_errodosistema (para marcar "Em correção").
# - Cria o usuário de aplicação em cada ambiente e associa o papel.
# - Gera um segredo novo e o coloca na área de transferência (nunca é impresso). Cole em claude.ai/code →
#   ambiente "Plantão" → variáveis PLANTAO_TENANT_ID, PLANTAO_CLIENT_ID e PLANTAO_CLIENT_SECRET.
# Sem -Apply roda em DRY RUN (só mostra o que faria). Arquivo com BOM (Windows PowerShell 5.1).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$nomeApp = 'Plantao Claude - Leitura'
$nomePapel = 'Plantão - Leitura'
$ambientes = @(
  @{ Nome = 'PROD'; Url = 'https://orgf261ae8e.crm2.dynamics.com'; Ler = @('prvReadflowrun', 'prvReadWorkflow', 'prvReadcr40f_errodosistema'); Escrever = @() },
  @{ Nome = 'DEV'; Url = 'https://org23b93544.crm2.dynamics.com'; Ler = @('prvReadflowrun', 'prvReadWorkflow', 'prvReadcr40f_errodosistema'); Escrever = @('prvWritecr40f_errodosistema') }
)
function Passo([string] $m) { Write-Host "[plantao-identidade] $m" }
function Invoke-Az([string[]] $a) { $r = & az.cmd @a; if ($LASTEXITCODE -ne 0) { throw "az $($a[0..2] -join ' ') falhou" }; $r }

# 1. App registration e entidade de serviço
$tenant = (Invoke-Az @('account', 'show', '--query', 'tenantId', '-o', 'tsv')).Trim()
$appId = (Invoke-Az @('ad', 'app', 'list', '--display-name', $nomeApp, '--query', '[0].appId', '-o', 'tsv'))
if ($appId) { $appId = $appId.Trim() }
if (-not $appId) {
  if (-not $Apply) { Passo "DRY RUN criaria o app registration '$nomeApp'"; $appId = '<novo>' }
  else { $appId = (Invoke-Az @('ad', 'app', 'create', '--display-name', $nomeApp, '--sign-in-audience', 'AzureADMyOrg', '--query', 'appId', '-o', 'tsv')).Trim(); Passo "app registration criado: $appId" }
} else { Passo "app registration já existe: $appId" }
if ($Apply) {
  $sp = Invoke-Az @('ad', 'sp', 'list', '--filter', "appId eq '$appId'", '--query', '[0].id', '-o', 'tsv')
  if (-not $sp) { Invoke-Az @('ad', 'sp', 'create', '--id', $appId) | Out-Null; Passo 'entidade de serviço criada' }
}

function Segredo {
  if (-not $Apply) { Passo "DRY RUN geraria um segredo de $DiasSegredo dias e copiaria para a área de transferência"; return }
  $fim = (Get-Date).ToUniversalTime().AddDays($DiasSegredo).ToString('yyyy-MM-ddTHH:mm:ssZ')
  $s = Invoke-Az @('ad', 'app', 'credential', 'reset', '--id', $appId, '--append', '--display-name', "plantao-$(Get-Date -Format yyyyMMdd)", '--end-date', $fim, '--query', 'password', '-o', 'tsv')
  Set-Clipboard -Value ($s.Trim())
  Passo "segredo novo copiado para a área de transferência (vence em $fim). Cole em PLANTAO_CLIENT_SECRET e limpe a área de transferência."
}
if ($SoRenovarSegredo) { Segredo; return }

# 2. Papel e usuário de aplicação em cada ambiente
foreach ($amb in $ambientes) {
  $url = $amb.Url
  $token = (Invoke-Az @('account', 'get-access-token', '--resource', "$url/", '--query', 'accessToken', '-o', 'tsv')).Trim()
  $h = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }
  function Dv([string] $Method, [string] $Path, $Body = $null) {
    $p = @{ Method = $Method; Uri = "$url/api/data/v9.2/$Path"; Headers = $h; TimeoutSec = 120 }
    if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
    $bytes = (Invoke-WebRequest @p -UseBasicParsing).RawContentStream.ToArray()
    if (-not $bytes.Length) { return $null }
    [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
  }
  $bu = @((Dv GET 'businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null').value)[0].businessunitid
  $papel = @((Dv GET "roles?`$select=roleid&`$filter=name eq '$nomePapel' and _businessunitid_value eq $bu").value)
  if ($papel.Count -eq 0) {
    if (-not $Apply) { Passo "$($amb.Nome): DRY RUN criaria o papel '$nomePapel'"; $roleId = $null }
    else { Dv POST roles @{ name = $nomePapel; 'businessunitid@odata.bind' = "/businessunits($bu)" } | Out-Null; $roleId = @((Dv GET "roles?`$select=roleid&`$filter=name eq '$nomePapel' and _businessunitid_value eq $bu").value)[0].roleid; Passo "$($amb.Nome): papel criado" }
  } else { $roleId = $papel[0].roleid; Passo "$($amb.Nome): papel já existe" }

  $concessoes = @()
  foreach ($nome in @($amb.Ler + $amb.Escrever)) {
    $p = @((Dv GET "privileges?`$select=privilegeid&`$filter=name eq '$nome'").value)
    if ($p.Count -eq 0) { Passo "$($amb.Nome): $nome ainda não existe (tabela não promovida?); rode de novo depois"; continue }
    $concessoes += @{ '@odata.type' = 'Microsoft.Dynamics.CRM.RolePrivilege'; PrivilegeId = $p[0].privilegeid; Depth = 'Global'; BusinessUnitId = $bu; PrivilegeName = $nome }
  }
  $lista = ($concessoes | ForEach-Object { $_.PrivilegeName }) -join ', '
  if (-not $Apply -or -not $roleId) { Passo "$($amb.Nome): DRY RUN concederia (Organização): $lista"; continue }
  # ReplacePrivilegesRole garante que o papel tenha SÓ estes privilégios (nada além de leitura no PROD).
  Dv POST "roles($roleId)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  Passo "$($amb.Nome): papel com exatamente: $lista"

  $usuario = @((Dv GET "systemusers?`$select=systemuserid&`$filter=applicationid eq $appId").value)
  if ($usuario.Count -eq 0) {
    Dv POST systemusers @{ applicationid = $appId; firstname = 'Plantao'; lastname = 'Claude'; 'businessunitid@odata.bind' = "/businessunits($bu)" } | Out-Null
    $usuario = @((Dv GET "systemusers?`$select=systemuserid&`$filter=applicationid eq $appId").value)
    Passo "$($amb.Nome): usuário de aplicação criado"
  }
  $uid = $usuario[0].systemuserid
  $tem = @((Dv GET "systemusers($uid)/systemuserroles_association?`$select=roleid&`$filter=roleid eq $roleId").value)
  if ($tem.Count -eq 0) { Dv POST "systemusers($uid)/systemuserroles_association/`$ref" @{ '@odata.id' = "$url/api/data/v9.2/roles($roleId)" } | Out-Null }
  $outros = @((Dv GET "systemusers($uid)/systemuserroles_association?`$select=name").value | Where-Object { $_.name -ne $nomePapel })
  if ($outros.Count -gt 0) { throw "$($amb.Nome): o usuário do plantão tem outros papéis ($($outros.name -join ', ')). Remova-os: ele deve ter só '$nomePapel'." }
  Passo "$($amb.Nome): usuário de aplicação só com '$nomePapel'"
}

# 3. Segredo
Segredo
Passo "PLANTAO_TENANT_ID=$tenant"
Passo "PLANTAO_CLIENT_ID=$appId"
Passo 'PLANTAO_CLIENT_SECRET=(na área de transferência)'
