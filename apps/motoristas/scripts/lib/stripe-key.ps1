# Leitura da chave do Stripe para a configuracao segura do step da cobranca por QR. ASCII, sem acentos.
# O arquivo fica fora do repositorio: %USERPROFILE%\.betinhos\stripe-dev.env com a linha STRIPE_SECRET_KEY=sk_test_... (ou rk_test_...).
# O valor nunca e exibido.

function Get-StripeKeyFile([string] $File) {
  if ($File) { return $File }
  return (Join-Path $env:USERPROFILE ".betinhos\stripe-dev.env")
}

# Devolve "" quando o arquivo nao existe (o provisionador avisa e segue); erro se existir e estiver invalido.
function Read-StripeKey([string] $File) {
  $File = Get-StripeKeyFile $File
  if (-not (Test-Path -LiteralPath $File)) { return "" }
  $line = @(Get-Content -LiteralPath $File | Where-Object { $_ -match '^\s*STRIPE_SECRET_KEY\s*=' }) | Select-Object -First 1
  if (-not $line) { throw "STRIPE_SECRET_KEY ausente em $File." }
  $value = ($line -replace '^\s*STRIPE_SECRET_KEY\s*=\s*', '').Trim().Trim('"')
  if ($value -notmatch '^(sk|rk)_(test|live)_[A-Za-z0-9]+$') { throw "STRIPE_SECRET_KEY em $File nao parece uma chave do Stripe (sk_/rk_)." }
  # DEV so usa chave de teste: chave live aqui cobraria cartao de verdade.
  if ($value -match '^(sk|rk)_live_') { throw "Chave live em $File. No DEV use a chave de teste (sk_test_/rk_test_)." }
  return $value
}
