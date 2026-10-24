#Requires -Version 5.1
<#
.SYNOPSIS
  Run the two dsh-persona-studio test suites.

.DESCRIPTION
  The host half imports @deepseek-ai/* packages that only resolve through the DSH
  launcher's runtime resolution, so the suites are staged into a scratch directory
  inside the DSH runtime tree (which owns those packages) and executed there.
  The scratch directory is removed afterwards unless -Keep is passed.

.PARAMETER DshRuntime
  DSH runtime directory (the one holding node_modules\@deepseek-ai). Defaults to
  $env:DSH_RUNTIME, then to a probe of the usual DeepSeek Harness install roots.

.PARAMETER Keep
  Keep the staging directory for inspection.
#>
param(
    [string]$DshRuntime = $(if ($env:DSH_RUNTIME) { $env:DSH_RUNTIME } else { "" }),
    [switch]$Keep
)

$ErrorActionPreference = "Stop"

$tests = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Split-Path -Parent $tests

# Locate the runtime that owns node_modules\@deepseek-ai. Nothing here is machine
# specific: pass -DshRuntime (or set DSH_RUNTIME) when the probe misses.
function Test-DshRuntime([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) { return $false }
    return Test-Path -LiteralPath (Join-Path $path "node_modules\@deepseek-ai\schemastery")
}

if (-not (Test-DshRuntime $DshRuntime)) {
    $probes = @(
        (Join-Path $env:LOCALAPPDATA "Programs\DeepSeek Harness\resources\app\dsh"),
        (Join-Path $env:PROGRAMFILES "DeepSeek Harness\resources\app\dsh"),
        (Join-Path ${env:ProgramFiles(x86)} "DeepSeek Harness\resources\app\dsh"),
        (Join-Path $env:USERPROFILE "AppData\Local\Programs\DeepSeek Harness\resources\app\dsh")
    ) | Where-Object { $_ }
    $DshRuntime = $probes | Where-Object { Test-DshRuntime $_ } | Select-Object -First 1
}

if (-not (Test-DshRuntime $DshRuntime)) {
    throw "DSH runtime directory not found. Pass it explicitly, e.g. -DshRuntime 'C:\Program Files\DeepSeek Harness\resources\app\dsh' (it must contain node_modules\@deepseek-ai\schemastery)."
}

$stage = Join-Path $DshRuntime "_persona_probe"

Write-Host "Staging into $stage"
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stage "plugin\lib") | Out-Null
Copy-Item -Path (Join-Path $project "lib\*.js") -Destination (Join-Path $stage "plugin\lib") -Force
Copy-Item -LiteralPath (Join-Path $project "package.json") -Destination (Join-Path $stage "plugin\package.json") -Force
Copy-Item -LiteralPath (Join-Path $tests "test.mjs") -Destination (Join-Path $stage "test.mjs") -Force
Copy-Item -LiteralPath (Join-Path $tests "client_test.mjs") -Destination (Join-Path $stage "client_test.mjs") -Force

$failed = 0
try {
    Write-Host "`n== host: system-prompt injection =="
    & node (Join-Path $stage "test.mjs")
    if ($LASTEXITCODE -ne 0) { $failed += 1 }

    Write-Host "`n== client: settings page =="
    & node (Join-Path $stage "client_test.mjs")
    if ($LASTEXITCODE -ne 0) { $failed += 1 }
} finally {
    if ($Keep) {
        Write-Host "`nStaging kept at $stage"
    } else {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "`nStaging removed."
    }
}

if ($failed -ne 0) {
    Write-Host "FAILED suites: $failed"
    exit 1
}
Write-Host "All suites passed."
exit 0
