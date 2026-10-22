#Requires -Version 5.1
<#
.SYNOPSIS
  Install or upgrade dsh-persona-studio into a DSH profile without touching pnpm.

.DESCRIPTION
  1. Copies lib/, package.json and cordis.patch.yml into
     <DSH_HOME>\profiles\<ProfileName>\node_modules\dsh-persona-studio
  2. Ensures <DSH_HOME>\profiles\<ProfileName>\cordis.patch.yml contains the
     insert row for the plugin (idempotent; the patch file is backed up first).

.PARAMETER ProfileName
  DSH profile name. Default: desktop.

.PARAMETER DshHome
  DSH home directory. Default: $env:DSH_HOME, else %USERPROFILE%\.dsh

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -ProfileName web
#>
param(
    [string]$ProfileName = "desktop",
    [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" })
)

$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$profileDir = Join-Path (Join-Path $DshHome "profiles") $ProfileName
$patchPath = Join-Path $profileDir "cordis.patch.yml"
$target = Join-Path (Join-Path $profileDir "node_modules") "dsh-persona-studio"

if (-not (Test-Path -LiteralPath (Join-Path $profileDir "package.json"))) {
    throw "DSH profile not found: $profileDir (pass -ProfileName / -DshHome)"
}
if (-not (Test-Path -LiteralPath $patchPath)) {
    throw "Profile patch file not found: $patchPath"
}

# Guard: a real profile manifest carries a dsh.profile section. Without it we are
# probably pointed at the wrong DSH_HOME, and writing there would scatter files
# into an unrelated directory.
$manifestPath = Join-Path $profileDir "package.json"
try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    throw "Profile manifest is not readable JSON: $manifestPath"
}
if ($null -eq $manifest.dsh -or $null -eq $manifest.dsh.profile) {
    throw "This does not look like a DSH profile (no dsh.profile in $manifestPath). Check -DshHome / -ProfileName."
}

# --- 1. copy the package -------------------------------------------------
if (Test-Path -LiteralPath $target) {
    Write-Host "Updating $target"
    Remove-Item -LiteralPath $target -Recurse -Force
} else {
    Write-Host "Installing to $target"
}
New-Item -ItemType Directory -Force -Path (Join-Path $target "lib") | Out-Null
Copy-Item -LiteralPath (Join-Path $source "lib\index.js") -Destination (Join-Path $target "lib\index.js") -Force
Copy-Item -LiteralPath (Join-Path $source "lib\client.js") -Destination (Join-Path $target "lib\client.js") -Force
Copy-Item -LiteralPath (Join-Path $source "package.json") -Destination (Join-Path $target "package.json") -Force
Copy-Item -LiteralPath (Join-Path $source "cordis.patch.yml") -Destination (Join-Path $target "cordis.patch.yml") -Force

# --- 2. ensure the loader row -------------------------------------------
$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($patchPath, $utf8)

$already = [regex]::IsMatch($text, "(?m)^\s*-?\s*id:\s*dsh-persona-studio\s*$")
if ($already) {
    Write-Host "Patch row already present in $patchPath"
} else {
    $backup = "$patchPath.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $patchPath -Destination $backup -Force
    Write-Host "Backed up patch to $backup"

    if (-not $text.EndsWith("`n")) { $text += "`n" }
    $block = @(
        ""
        "# dsh-persona-studio: Settings -> Persona."
        "# Writes a persona into the system prompt; disable/remove these two lines to uninstall."
        "- insert:"
        "    - id: dsh-persona-studio"
        "      name: 'dsh-persona-studio'"
        ""
    ) -join "`n"
    [System.IO.File]::WriteAllText($patchPath, $text + $block, $utf8)
    Write-Host "Inserted loader row into $patchPath"
}

Write-Host ""
Write-Host "Done. Restart DeepSeek Harness, then open Settings -> Persona."
Write-Host "Config is stored in the profile patch as the entry's config block; edits go through the settings page."
