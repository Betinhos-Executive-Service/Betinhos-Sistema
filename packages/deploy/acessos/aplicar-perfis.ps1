# Motor dos perfis de acesso: aplica packages/deploy/acessos/perfis.gerado.json no ambiente.
# Dot-source DEPOIS de _dv.ps1 e de Connect-Dv. Sem -Apply (dry-run) so le e lista o que faria. Idempotente.
# Quem decide o conteudo dos perfis sao os mapas em apps/shell/src/nav (acessosMapa.json e acessosColunas.json).

$script:AcessosDir = $PSScriptRoot
$script:Ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }
$script:NomeDaOrdem = @{ 1 = "Basic"; 2 = "Local"; 4 = "Deep"; 8 = "Global" }
$script:Pendencias = 0
$script:PrivilegiosPorTabela = @{}
$script:ColunasSeguras = @{}

function Add-Pendencia([string] $Mensagem) {
  if ($script:Apply) { throw $Mensagem }
  $script:Pendencias++
  Write-Step "PENDENCIA: $Mensagem"
}

function Get-HashPerfis([string] $Caminho) {
  $texto = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Caminho).Path, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return (($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($texto)) | ForEach-Object { $_.ToString("x2") }) -join "") }
  finally { $sha.Dispose() }
}

function Get-Todos([string] $Path) {
  $linhas = @()
  $proximo = $Path
  while ($proximo) {
    $resp = Invoke-Dv "GET" $proximo
    $linhas += @($resp.value)
    $link = $resp.PSObject.Properties["@odata.nextLink"]
    $proximo = if ($link -and $link.Value) { ([string] $link.Value).Substring($script:DvApi.Length + 1) } else { $null }
  }
  return $linhas
}

function Get-PrivilegiosDaTabela([string] $Tabela) {
  if (-not $script:PrivilegiosPorTabela.ContainsKey($Tabela)) {
    $mapa = @{}
    $linhas = @(Get-Rows "EntityDefinitions" "LogicalName,Privileges" "LogicalName eq '$Tabela'")
    if ($linhas.Count -eq 1) { foreach ($p in @($linhas[0].Privileges)) { $mapa[[string] $p.PrivilegeType] = $p } }
    $script:PrivilegiosPorTabela[$Tabela] = $mapa
  }
  return $script:PrivilegiosPorTabela[$Tabela]
}

function Set-Maior([hashtable] $Alvo, [string] $Nome, [string] $Prof) {
  if (-not $Alvo.ContainsKey($Nome) -or $script:Ordem[$Alvo[$Nome]] -lt $script:Ordem[$Prof]) { $Alvo[$Nome] = $Prof }
}

function Get-PrivilegiosDoPapel([string] $RoleId, [hashtable] $NomePorId) {
  $mapa = @{}
  $filtro = [uri]::EscapeDataString("roleid eq $RoleId")
  foreach ($rp in @(Get-Todos "roleprivilegescollection?`$select=privilegeid,privilegedepthmask&`$filter=$filtro")) {
    $id = [string] $rp.privilegeid
    if ($NomePorId.ContainsKey($id)) { $mapa[$NomePorId[$id]] = $script:NomeDaOrdem[[int] $rp.privilegedepthmask] }
  }
  return $mapa
}

function Get-ColunasSeguras([string] $Tabela) {
  if (-not $script:ColunasSeguras.ContainsKey($Tabela)) {
    $mapa = @{}
    $existe = @(Get-Rows "EntityDefinitions" "LogicalName" "LogicalName eq '$Tabela'")
    if ($existe.Count -eq 1) {
      foreach ($a in @(Get-Todos "EntityDefinitions(LogicalName='$Tabela')/Attributes?`$select=LogicalName,IsSecured,CanBeSecuredForCreate,CanBeSecuredForUpdate")) {
        if ($a.IsSecured) { $mapa[[string] $a.LogicalName] = @{ criar = [bool] $a.CanBeSecuredForCreate; atualizar = [bool] $a.CanBeSecuredForUpdate } }
      }
    }
    $script:ColunasSeguras[$Tabela] = $mapa
  }
  return $script:ColunasSeguras[$Tabela]
}

function Find-PapelRaiz([string] $Nome) {
  return @(Get-Rows "roles" "roleid,name" "name eq '$($Nome.Replace("'", "''"))' and _parentroleid_value eq null")
}

function Set-PapelDoPerfil([string] $Nome, $Def, [string] $BuId, [hashtable] $IdPorNome, [hashtable] $NomePorId, [string] $Proibido, [string] $CopiarSem) {
  # 1. O que o papel deve ter: copia dos papeis de origem (sem o proibido e sem tabela customizada) + tabelas + privilegios soltos.
  $alvo = @{}
  foreach ($origem in @($Def.copiarDe)) {
    $achados = @(Find-PapelRaiz ([string] $origem))
    if ($achados.Count -ne 1) { Add-Pendencia "papel de origem '$origem' nao encontrado (ou ambiguo) para '$Nome'"; continue }
    $copiados = Get-PrivilegiosDoPapel ([string] $achados[0].roleid) $NomePorId
    foreach ($priv in @($copiados.Keys)) {
      if ($priv -cmatch $Proibido -or $priv -cmatch $CopiarSem -or -not $copiados[$priv]) { continue }
      Set-Maior $alvo $priv $copiados[$priv]
    }
  }
  foreach ($t in @($Def.tabelas.PSObject.Properties)) {
    $tabela = [string] $t.Name
    $privs = Get-PrivilegiosDaTabela $tabela
    if ($privs.Count -eq 0) { Add-Pendencia "tabela $tabela nao existe no ambiente (perfil '$Nome')"; continue }
    foreach ($acao in @($t.Value.PSObject.Properties)) {
      if (-not $privs.ContainsKey([string] $acao.Name)) { Add-Pendencia "$tabela nao tem o privilegio $($acao.Name) (perfil '$Nome')"; continue }
      $p = $privs[[string] $acao.Name]
      if ([string] $acao.Value -eq "Basic" -and -not $p.CanBeBasic) { Add-Pendencia "$tabela.$($acao.Name) nao aceita profundidade Basic (perfil '$Nome')"; continue }
      Set-Maior $alvo ([string] $p.Name) ([string] $acao.Value)
    }
  }
  foreach ($x in @($Def.privilegios.PSObject.Properties)) { Set-Maior $alvo ([string] $x.Name) ([string] $x.Value) }
  foreach ($priv in @($alvo.Keys)) {
    if ($priv -cmatch $Proibido) { throw "Perfil '$Nome' pediria o privilegio proibido $priv." }
    if (-not $IdPorNome.ContainsKey($priv)) { Add-Pendencia "privilegio $priv nao existe no ambiente (perfil '$Nome')"; $alvo.Remove($priv) }
  }

  # 2. Comparar com o que o papel tem hoje e regravar se for diferente.
  $achados = @(Find-PapelRaiz $Nome)
  if ($achados.Count -gt 1) { throw "Ha mais de um papel raiz chamado '$Nome'." }
  $roleId = if ($achados.Count -eq 1) { [string] $achados[0].roleid } else { $null }
  $atual = if ($roleId) { Get-PrivilegiosDoPapel $roleId $NomePorId } else { @{} }
  $faltam = @($alvo.Keys | Where-Object { -not $atual.ContainsKey($_) -or $atual[$_] -ne $alvo[$_] })
  $sobram = @($atual.Keys | Where-Object { -not $alvo.ContainsKey($_) })

  if ($roleId -and $faltam.Count -eq 0 -and $sobram.Count -eq 0) {
    Write-Step "'$Nome' ja esta igual ($($alvo.Count) privilegios)."
  } elseif (-not $script:Apply) {
    if ($roleId) { Write-Step "DRY RUN regravaria '${Nome}': $($faltam.Count) a conceder ou ajustar, $($sobram.Count) a retirar." }
    else { Write-Step "DRY RUN criaria o papel '$Nome' com $($alvo.Count) privilegios." }
  } else {
    if (-not $roleId) {
      $novo = Invoke-Dv "POST" "roles" @{ name = $Nome; "businessunitid@odata.bind" = "/businessunits($BuId)" } @{ Prefer = "return=representation" }
      $roleId = [string] $novo.roleid
      Write-Step "criado o papel '$Nome'"
    }
    $lista = @($alvo.Keys | Sort-Object | ForEach-Object {
      [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $IdPorNome[$_]; Depth = $alvo[$_]; BusinessUnitId = $BuId; PrivilegeName = $_ }
    })
    Invoke-Dv "POST" "roles($roleId)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole" @{ Privileges = $lista } | Out-Null
    $depois = Get-PrivilegiosDoPapel $roleId $NomePorId
    $naoEntrou = @($alvo.Keys | Where-Object { -not $depois.ContainsKey($_) -or $depois[$_] -ne $alvo[$_] })
    if ($naoEntrou.Count -gt 0) { throw "Papel '${Nome}': $($naoEntrou.Count) privilegio(s) nao ficaram como pedido (ex.: $($naoEntrou[0]))." }
    foreach ($extra in @($depois.Keys | Where-Object { -not $alvo.ContainsKey($_) })) {
      if ($extra -cmatch $Proibido) { throw "Papel '$Nome' ficou com o privilegio proibido $extra." }
      Write-Step "AVISO: '$Nome' ficou com $extra, que o gerado nao pede."
    }
    Write-Step "gravado '$Nome' ($($alvo.Count) privilegios)"
  }

  # 3. Papel que abre o app model-driven (so o Base).
  if (-not $Def.app) { return }
  $apps = @(Get-Rows "appmodules" "appmoduleid" "uniquename eq '$($Def.app)'")
  if ($apps.Count -ne 1) { Add-Pendencia "app '$($Def.app)' nao encontrado (perfil '$Nome')"; return }
  $appId = [string] $apps[0].appmoduleid
  if (-not $roleId) { Write-Step "DRY RUN ligaria '$Nome' ao app $($Def.app)."; return }
  $ligados = @(Get-Todos "appmodules($appId)/appmoduleroles_association?`$select=roleid")
  if (@($ligados | Where-Object { [string] $_.roleid -eq $roleId }).Count -gt 0) { Write-Step "'$Nome' ja abre o app $($Def.app)."; return }
  if (-not $script:Apply) { Write-Step "DRY RUN ligaria '$Nome' ao app $($Def.app)."; return }
  Invoke-Dv "POST" "appmodules($appId)/appmoduleroles_association/`$ref" @{ "@odata.id" = "$script:DvApi/roles($roleId)" } | Out-Null
  Write-Step "'$Nome' ligado ao app $($Def.app)"
}

function Get-PermissoesDoPerfil([string] $PerfilId) {
  $porChave = @{}
  $filtro = [uri]::EscapeDataString("_fieldsecurityprofileid_value eq $PerfilId")
  foreach ($a in @(Get-Todos "fieldpermissions?`$select=fieldpermissionid,entityname,attributelogicalname,canread,cancreate,canupdate&`$filter=$filtro")) {
    $porChave["$($a.entityname)|$($a.attributelogicalname)"] = $a
  }
  return $porChave
}

function Set-PerfilDeColuna([string] $Nome, $Permissoes) {
  # 4 = permitido, 0 = nao. So entra coluna que ja tem seguranca de coluna (IsSecured).
  $alvo = @{}
  foreach ($p in @($Permissoes)) {
    $tabela = [string] $p.tabela
    $coluna = [string] $p.coluna
    $seguras = Get-ColunasSeguras $tabela
    if (-not $seguras.ContainsKey($coluna)) { Add-Pendencia "$tabela.$coluna nao tem seguranca de coluna (perfil '$Nome')"; continue }
    $cap = $seguras[$coluna]
    $alvo["$tabela|$coluna"] = @{
      tabela = $tabela; coluna = $coluna; ler = 4
      criar = $(if ($p.editar -and $cap["criar"]) { 4 } else { 0 })
      atualizar = $(if ($p.editar -and $cap["atualizar"]) { 4 } else { 0 })
    }
  }

  $perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid,name" "name eq '$($Nome.Replace("'", "''"))'")
  if ($perfis.Count -gt 1) { throw "Ha mais de um perfil de coluna chamado '$Nome'." }
  $perfilId = if ($perfis.Count -eq 1) { [string] $perfis[0].fieldsecurityprofileid } else { $null }
  if (-not $perfilId) {
    if (-not $script:Apply) { Write-Step "DRY RUN criaria o perfil de coluna '$Nome' com $($alvo.Count) colunas."; return }
    $novo = Invoke-Dv "POST" "fieldsecurityprofiles" @{ name = $Nome; description = "Gerado por packages/deploy/acessos (nao editar a mao)." } @{ Prefer = "return=representation" }
    $perfilId = [string] $novo.fieldsecurityprofileid
    Write-Step "criado o perfil de coluna '$Nome'"
  }

  $porChave = Get-PermissoesDoPerfil $perfilId
  $criar = @($alvo.Keys | Where-Object { -not $porChave.ContainsKey($_) })
  $mudar = @($alvo.Keys | Where-Object {
    $porChave.ContainsKey($_) -and ([int] $porChave[$_].canread -ne 4 -or [int] $porChave[$_].cancreate -ne $alvo[$_]["criar"] -or [int] $porChave[$_].canupdate -ne $alvo[$_]["atualizar"])
  })
  # Linha zerada que o gerado nao pede nao da acesso a nada: fica como esta.
  $tirar = @($porChave.Keys | Where-Object {
    -not $alvo.ContainsKey($_) -and (([int] $porChave[$_].canread + [int] $porChave[$_].cancreate + [int] $porChave[$_].canupdate) -ne 0)
  })
  if (($criar.Count + $mudar.Count + $tirar.Count) -eq 0) { Write-Step "perfil de coluna '$Nome' ja esta igual ($($alvo.Count) colunas)."; return }
  if (-not $script:Apply) { Write-Step "DRY RUN perfil de coluna '${Nome}': $($criar.Count) a criar, $($mudar.Count) a ajustar, $($tirar.Count) a retirar."; return }

  foreach ($k in $criar) {
    $x = $alvo[$k]
    Invoke-Dv "POST" "fieldpermissions" @{
      "fieldsecurityprofileid@odata.bind" = "/fieldsecurityprofiles($perfilId)"
      entityname = $x["tabela"]; attributelogicalname = $x["coluna"]; canread = $x["ler"]; cancreate = $x["criar"]; canupdate = $x["atualizar"]
    } | Out-Null
  }
  foreach ($k in $mudar) {
    $x = $alvo[$k]
    Invoke-Dv "PATCH" "fieldpermissions($($porChave[$k].fieldpermissionid))" @{ canread = $x["ler"]; cancreate = $x["criar"]; canupdate = $x["atualizar"] } | Out-Null
  }
  foreach ($k in $tirar) { Invoke-Dv "DELETE" "fieldpermissions($($porChave[$k].fieldpermissionid))" | Out-Null }

  $depois = Get-PermissoesDoPerfil $perfilId
  foreach ($k in @($alvo.Keys)) {
    if (-not $depois.ContainsKey($k) -or [int] $depois[$k].canread -ne 4 -or [int] $depois[$k].cancreate -ne $alvo[$k]["criar"] -or [int] $depois[$k].canupdate -ne $alvo[$k]["atualizar"]) {
      throw "Perfil de coluna '${Nome}': a permissao de $k nao ficou como pedido."
    }
  }
  Write-Step "gravado o perfil de coluna '$Nome' ($($alvo.Count) colunas)"
}

function Invoke-PerfisDeAcesso([string] $HashEsperado) {
  $arquivo = Join-Path $script:AcessosDir "perfis.gerado.json"
  $hash = Get-HashPerfis $arquivo
  if ($hash -ne $HashEsperado) {
    Write-Step "perfis.gerado.json mudou depois desta migration (hash $($hash.Substring(0, 12))); uma migration mais nova aplica. Nada a fazer."
    return
  }
  $def = Get-Content -LiteralPath $arquivo -Raw -Encoding UTF8 | ConvertFrom-Json
  $script:Pendencias = 0

  $bus = @(Get-Rows "businessunits" "businessunitid" "_parentbusinessunitid_value eq null")
  if ($bus.Count -ne 1) { throw "Esperava 1 unidade de negocio raiz, achei $($bus.Count)." }
  $buId = [string] $bus[0].businessunitid

  $idPorNome = @{}
  $nomePorId = @{}
  foreach ($p in @(Get-Todos "privileges?`$select=privilegeid,name")) {
    $idPorNome[[string] $p.name] = [string] $p.privilegeid
    $nomePorId[[string] $p.privilegeid] = [string] $p.name
  }

  foreach ($papel in @($def.papeis.PSObject.Properties)) {
    Set-PapelDoPerfil ([string] $papel.Name) $papel.Value $buId $idPorNome $nomePorId ([string] $def.proibido) ([string] $def.copiarSem)
  }
  foreach ($perfil in @($def.colunas.PSObject.Properties)) { Set-PerfilDeColuna ([string] $perfil.Name) $perfil.Value }

  if (-not $script:Apply) { Write-Step "dry-run: nada gravado ($script:Pendencias pendencia(s) que travariam o -Apply)."; return }
  Write-Step "OK: perfis de acesso aplicados."
}
