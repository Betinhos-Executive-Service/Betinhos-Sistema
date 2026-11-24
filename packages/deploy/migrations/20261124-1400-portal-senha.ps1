param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Login do portal por e-mail + senha (24/11/2026, decisao do Renan): sai o autenticador (TOTP) e o dispositivo confiavel.
# O usuario cria a propria senha no 1o acesso e no "Esqueci a senha" (codigo por e-mail); a Betinhos so libera o e-mail.
# Cria no validador o hash da senha (PBKDF2-SHA256, formato pbkdf2$iteracoes$sal$hash, gerado pelo Worker
# apps/portal-cliente/worker/cripto.ts) e a data em que foi definida. As colunas do TOTP ficam (sem uso) ate uma migration
# destrutiva propria. Idempotente. Somente DEV; o PROD recebe pelas solucoes.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$validador = "cr40f_validadorcliente"

function Add-Coluna([string] $Logical, [hashtable] $Payload) {
  if (Get-Coluna $validador $Logical) { return }
  if (-not $Apply) { Write-Step "DRY RUN criaria $validador.$Logical."; return }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$validador')/Attributes" $Payload | Out-Null
  Write-Step "criada $validador.$Logical"
}

Add-Coluna "cr40f_senhahash" @{
  "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_SenhaHash"
  DisplayName = (Label "Senha (hash)"); Description = (Label (U "Hash PBKDF2 da senha do portal, gravado pelo Worker; vazio = precisa criar a senha pelo código do e-mail. Não editar"))
  RequiredLevel = @{ Value = "None" }; MaxLength = 200; FormatName = @{ Value = "Text" }
}
Add-Coluna "cr40f_senhadefinidaem" @{
  "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = "cr40f_SenhaDefinidaEm"
  DisplayName = (Label "Senha definida em"); Description = (Label (U "Quando o usuário criou ou trocou a senha do portal"))
  RequiredLevel = @{ Value = "None" }; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" }
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

Publish-Tabela $validador
foreach ($c in @("cr40f_senhahash", "cr40f_senhadefinidaem")) {
  $col = Get-Coluna $validador $c
  if (-not $col) { throw "Coluna $validador.$c nao encontrada depois de criar." }
  Add-ComponenteNaSolucao $col.MetadataId 2
}
Write-Step "OK: senha do portal (cr40f_senhahash, cr40f_senhadefinidaem)."
