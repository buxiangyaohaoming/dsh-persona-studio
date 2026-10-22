#Requires -Version 5.1
<#
.SYNOPSIS
  Remove dsh-persona-studio from a DSH profile.

.DESCRIPTION
  Deletes <profile>\node_modules\dsh-persona-studio and strips the matching
  insert row (plus its comment lines) from <profile>\cordis.patch.yml.
  The patch file is backed up before it is rewritten.

.PARAMETER ProfileName
  DSH profile name. Default: desktop.
#>
param(
    [string]$ProfileName = "desktop",
    [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" })
)

$ErrorActionPreference = "Stop"

$profileDir = Join-Path (Join-Path $DshHome "profiles") $ProfileName
$patchPath = Join-Path $profileDir "cordis.patch.yml"
$target = Join-Path (Join-Path $profileDir "node_modules") "dsh-persona-studio"

if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed $target"
} else {
    Write-Host "Package directory not present: $target"
}

if (Test-Path -LiteralPath $patchPath) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $text = [System.IO.File]::ReadAllText($patchPath, $utf8)
    $pattern = "(?ms)^[ \t]*#[^\n]*dsh-persona-studio[^\n]*\r?\n(?:[ \t]*#[^\n]*\r?\n)*^[ \t]*-[ \t]*insert:[ \t]*\r?\n[ \t]*-[ \t]*id:[ \t]*dsh-persona-studio[ \t]*\r?\n[^\n]*\r?\n"
    if ([regex]::IsMatch($text, $pattern)) {
        $backup = "$patchPath.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
        Copy-Item -LiteralPath $patchPath -Destination $backup -Force
        $text = [regex]::Replace($text, $pattern, "")
        [System.IO.File]::WriteAllText($patchPath, $text, $utf8)
        Write-Host "Stripped loader row from $patchPath (backup: $backup)"
    } else {
        Write-Host "No dsh-persona-studio row found in $patchPath - nothing to strip."
        Write-Host "If the row is present in another form, delete it by hand:"
        Write-Host "  - insert:"
        Write-Host "      - id: dsh-persona-studio"
        Write-Host "        name: 'dsh-persona-studio'"
    }
}

Write-Host ""
Write-Host "Done. Restart DeepSeek Harness. The saved persona config stays in the patch file;"
Write-Host "delete that entry's config block as well if you want a clean slate."
