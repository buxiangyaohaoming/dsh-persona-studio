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
# Two copies on purpose:
#   local-plugins\  - stable source for the profile manifest dependency below,
#                     so a later `pnpm install` does not prune the plugin.
#   node_modules\   - what the loader resolves right away, even before pnpm runs.
$localDir = Join-Path $profileDir "local-plugins"
$localTarget = Join-Path $localDir "dsh-persona-studio"

function Copy-Plugin([string]$dest) {
    if (Test-Path -LiteralPath $dest) {
        Write-Host "Updating $dest"
        Remove-Item -LiteralPath $dest -Recurse -Force
    } else {
        Write-Host "Installing to $dest"
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $dest "lib") | Out-Null
    Copy-Item -Path (Join-Path $source "lib\*.js") -Destination (Join-Path $dest "lib") -Force
    Copy-Item -LiteralPath (Join-Path $source "package.json") -Destination (Join-Path $dest "package.json") -Force
    Copy-Item -LiteralPath (Join-Path $source "cordis.patch.yml") -Destination (Join-Path $dest "cordis.patch.yml") -Force
}

Copy-Plugin $localTarget
Copy-Plugin $target

# --- 1b. keep the plugin across `pnpm install` ---------------------------
# pnpm prunes anything in node_modules that the manifest does not depend on,
# which silently removed this plugin once and broke startup. Declaring a
# file: dependency on the local copy makes pnpm keep (and re-create) it.
$depValue = "file:./local-plugins/dsh-persona-studio"
$depDirty = $false
if ($null -eq $manifest.dependencies) {
    $manifest | Add-Member -MemberType NoteProperty -Name dependencies -Value ([pscustomobject]@{}) -Force
    $depDirty = $true
}
$currentDep = $manifest.dependencies.'dsh-persona-studio'
if ($currentDep -ne $depValue) {
    $manifest.dependencies | Add-Member -MemberType NoteProperty -Name 'dsh-persona-studio' -Value $depValue -Force
    $depDirty = $true
}
if ($depDirty) {
    $depBackup = "$manifestPath.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $manifestPath -Destination $depBackup -Force
    $jsonText = $manifest | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($manifestPath, $jsonText + "`n", (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Added dependency 'dsh-persona-studio' -> $depValue (backup: $depBackup)"
} else {
    Write-Host "Dependency 'dsh-persona-studio' already declared"
}

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
