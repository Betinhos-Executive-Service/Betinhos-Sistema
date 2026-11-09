param(
  [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SafeValue {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Script,
    [string]$Fallback = "<unavailable>"
  )

  try {
    & $Script
  } catch {
    $Fallback
  }
}

function Get-RegistryProperties {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  try {
    $item = Get-ItemProperty -Path $Path -ErrorAction Stop
    $result = [ordered]@{}
    foreach ($property in $item.PSObject.Properties) {
      if ($property.Name -like "PS*") { continue }
      $result[$property.Name] = $property.Value
    }
    [pscustomobject]$result
  } catch {
    [pscustomobject]@{
      path = $Path
      error = $_.Exception.Message
    }
  }
}

function Read-BrowserPreferenceFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  if (-not (Test-Path -LiteralPath $FilePath)) {
    return [pscustomobject]@{
      path = $FilePath
      exists = $false
    }
  }

  try {
    $raw = Get-Content -LiteralPath $FilePath -Raw -ErrorAction Stop
    $json = $raw | ConvertFrom-Json -ErrorAction Stop
    $intlProperty = $json.PSObject.Properties["intl"]
    $translateProperty = $json.PSObject.Properties["translate_site_blacklist"]
    $intl = if ($intlProperty) { $intlProperty.Value } else { $null }
    $translate = if ($translateProperty) { $translateProperty.Value } else { $null }
    $acceptLanguages = $null
    $selectedLanguages = $null
    $appLocale = $null
    if ($intl) {
      $acceptProperty = $intl.PSObject.Properties["accept_languages"]
      $selectedProperty = $intl.PSObject.Properties["selected_languages"]
      $appLocaleProperty = $intl.PSObject.Properties["app_locale"]
      if ($acceptProperty) { $acceptLanguages = $acceptProperty.Value }
      if ($selectedProperty) { $selectedLanguages = $selectedProperty.Value }
      if ($appLocaleProperty) { $appLocale = $appLocaleProperty.Value }
    }
    [pscustomobject]@{
      path = $FilePath
      exists = $true
      intl_accept_languages = $acceptLanguages
      intl_selected_languages = $selectedLanguages
      intl_app_locale = $appLocale
      translate_site_blacklist = if ($translate) { @($translate) } else { @() }
    }
  } catch {
    [pscustomobject]@{
      path = $FilePath
      exists = $true
      error = $_.Exception.Message
    }
  }
}

function Get-BrowserPreferenceSummary {
  $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
  $appData = [Environment]::GetFolderPath("ApplicationData")

  [pscustomobject]@{
    edge = Read-BrowserPreferenceFile -FilePath (Join-Path $localAppData "Microsoft\Edge\User Data\Default\Preferences")
    chrome = Read-BrowserPreferenceFile -FilePath (Join-Path $localAppData "Google\Chrome\User Data\Default\Preferences")
    firefox = Read-BrowserPreferenceFile -FilePath (Join-Path $appData "Mozilla\Firefox\Profiles")
  }
}

function Get-FirefoxPreferenceSummary {
  $profilesRoot = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "Mozilla\Firefox\Profiles"
  if (-not (Test-Path -LiteralPath $profilesRoot)) {
    return [pscustomobject]@{
      path = $profilesRoot
      exists = $false
    }
  }

  $profiles = Get-ChildItem -LiteralPath $profilesRoot -Directory -ErrorAction SilentlyContinue
  $results = @()
  foreach ($profile in $profiles) {
    $prefsPath = Join-Path $profile.FullName "prefs.js"
    if (-not (Test-Path -LiteralPath $prefsPath)) {
      $results += [pscustomobject]@{
        profile = $profile.Name
        path = $prefsPath
        exists = $false
      }
      continue
    }

    $prefLines = Get-Content -LiteralPath $prefsPath -ErrorAction SilentlyContinue
    $localeLine = $prefLines | Where-Object { $_ -match 'intl\.locale\.requested' } | Select-Object -First 1
    $languageLine = $prefLines | Where-Object { $_ -match 'intl\.accept_languages' } | Select-Object -First 1
    $results += [pscustomobject]@{
      profile = $profile.Name
      path = $prefsPath
      exists = $true
      intl_locale_requested = $localeLine
      intl_accept_languages = $languageLine
    }
  }

  $results
}

function Get-JavaScriptProbe {
@'
(() => {
  const input = document.querySelector('input[type="date"], input[type="datetime-local"]');
  return {
    navigatorLanguage: navigator.language,
    navigatorLanguages: navigator.languages,
    intlLocale: Intl.DateTimeFormat().resolvedOptions(),
    htmlLang: document.documentElement.lang,
    bodyLang: document.body?.lang || null,
    inputFound: !!input,
    inputType: input?.type || null,
    inputLangAttribute: input?.getAttribute?.("lang") ?? null,
    inputLangProperty: input?.lang ?? null,
    inputValue: input?.value ?? null,
    inputValueAsDate: input?.valueAsDate ? input.valueAsDate.toISOString() : null,
    userAgent: navigator.userAgent
  };
})()
'@
}

$firefoxSummary = Get-FirefoxPreferenceSummary
$browserSummary = Get-BrowserPreferenceSummary
$browserSummary.firefox = $firefoxSummary

$report = [ordered]@{
  collectedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  computerName = $env:COMPUTERNAME
  userName = "$env:USERDOMAIN\$env:USERNAME"
  os = [pscustomobject]@{
    caption = Get-SafeValue { (Get-CimInstance Win32_OperatingSystem).Caption }
    version = Get-SafeValue { (Get-CimInstance Win32_OperatingSystem).Version }
    buildNumber = Get-SafeValue { (Get-CimInstance Win32_OperatingSystem).BuildNumber }
  }
  culture = [pscustomobject]@{
    currentCulture = Get-SafeValue { Get-Culture | Select-Object Name, DisplayName, EnglishName, KeyboardLayoutId, DateTimeFormat }
    currentUICulture = Get-SafeValue { Get-UICulture | Select-Object Name, DisplayName, EnglishName }
    winSystemLocale = Get-SafeValue { Get-WinSystemLocale | Select-Object Name, DisplayName, EnglishName }
    winUserLanguageList = Get-SafeValue { Get-WinUserLanguageList | Select-Object LanguageTag, Autonym, EnglishName, LocalizedName, ScriptName, InputMethodTips, Handwriting }
    homeLocation = Get-SafeValue { Get-WinHomeLocation }
    timeZone = Get-SafeValue { Get-TimeZone | Select-Object Id, DisplayName, StandardName }
  }
  registry = [pscustomobject]@{
    intlCurrentUser = Get-RegistryProperties -Path "HKCU:\Control Panel\International"
    intlMachineDefault = Get-RegistryProperties -Path "Registry::HKEY_USERS\.DEFAULT\Control Panel\International"
    nlsLanguage = Get-RegistryProperties -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Nls\Language"
  }
  browserPreferences = $browserSummary
  interpretation = [pscustomobject]@{
    likelyCause = "Se o navegador/app mostrar navigator.language = pt-BR mas Intl.DateTimeFormat().resolvedOptions().locale = en-US, o formato americano esta vindo do locale efetivo do sistema ou da WebView, nao da conta do usuario."
    mainFieldsToCompare = @(
      "Get-Culture.Name",
      "Get-UICulture.Name",
      "Get-WinSystemLocale.Name",
      "HKCU:\Control Panel\International\LocaleName",
      "Intl.DateTimeFormat().resolvedOptions().locale",
      "document.documentElement.lang",
      "input[type=date|datetime-local].getAttribute('lang')"
    )
  }
  browserConsoleProbe = Get-JavaScriptProbe
}

if ($AsJson) {
  $report | ConvertTo-Json -Depth 8
  exit 0
}

Write-Host ""
Write-Host "=== Locale Diagnostic Report ===" -ForegroundColor Cyan
Write-Host "Collected at: $($report.collectedAt)"
Write-Host "Computer: $($report.computerName)"
Write-Host "User: $($report.userName)"
Write-Host ""

Write-Host "--- OS ---" -ForegroundColor Yellow
$report.os | Format-List | Out-Host

Write-Host "--- Culture ---" -ForegroundColor Yellow
$report.culture.currentCulture | Format-List | Out-Host
$report.culture.currentUICulture | Format-List | Out-Host
$report.culture.winSystemLocale | Format-List | Out-Host
$report.culture.timeZone | Format-List | Out-Host
Write-Host "WinUserLanguageList:" -ForegroundColor DarkYellow
$report.culture.winUserLanguageList | Format-Table -AutoSize | Out-Host
Write-Host "HomeLocation: $($report.culture.homeLocation)"
Write-Host ""

Write-Host "--- Registry HKCU\\Control Panel\\International ---" -ForegroundColor Yellow
$report.registry.intlCurrentUser | Format-List | Out-Host

Write-Host "--- Registry HKEY_USERS\\.DEFAULT\\Control Panel\\International ---" -ForegroundColor Yellow
$report.registry.intlMachineDefault | Format-List | Out-Host

Write-Host "--- Registry NLS Language ---" -ForegroundColor Yellow
$report.registry.nlsLanguage | Format-List | Out-Host

Write-Host "--- Browser Preferences ---" -ForegroundColor Yellow
Write-Host "Edge:" -ForegroundColor DarkYellow
$report.browserPreferences.edge | Format-List | Out-Host
Write-Host "Chrome:" -ForegroundColor DarkYellow
$report.browserPreferences.chrome | Format-List | Out-Host
Write-Host "Firefox:" -ForegroundColor DarkYellow
$report.browserPreferences.firefox | Format-List | Out-Host

Write-Host "--- Interpretation ---" -ForegroundColor Yellow
$report.interpretation | Format-List | Out-Host

Write-Host "--- Browser Console Probe ---" -ForegroundColor Yellow
Write-Host "Cole isso no console do navegador/app:" -ForegroundColor DarkYellow
Write-Host $report.browserConsoleProbe
