# scripts/build-live-helper.ps1
# Builds LiveRouteOCR and mirrors the ENTIRE publish output into your app's resources.

$ErrorActionPreference = "Stop"

function Resolve-PathSafe([string]$p) {
  return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $p))
}

# Locate the .csproj (works no matter where the script is called from)
$repoRoot = Resolve-PathSafe ".."
$projFile = Get-ChildItem -Path $repoRoot -Recurse -Filter "LiveRouteOCR.csproj" | Select-Object -First 1
if (-not $projFile) { throw "LiveRouteOCR.csproj not found under $repoRoot" }
$projDir = $projFile.Directory.FullName

# Clean helper dist
$helperDist = Join-Path $repoRoot "dist\live-helper"
if (Test-Path $helperDist) { Remove-Item $helperDist -Recurse -Force }
New-Item -ItemType Directory -Path $helperDist | Out-Null

Write-Host "== Building LiveRouteOCR to $helperDist =="

Push-Location $projDir
try {
  # IMPORTANT: NOT single-file and NOT trimmed (Tesseract + native deps need files beside exe)
  dotnet publish `
    -c Release `
    -r win-x64 `
    /p:PublishSingleFile=false `
    /p:PublishTrimmed=false `
    /p:IncludeNativeLibrariesForSelfExtract=true `
    -o $helperDist | Out-Null
}
finally {
  Pop-Location
}

# Ensure tessdata/eng.traineddata ships with the helper
$tessDest = Join-Path $helperDist "tessdata"
New-Item -ItemType Directory -Path $tessDest -Force | Out-Null

# Prefer an in-repo tessdata if you keep it; otherwise reuse the copy you’ve been using
$repoTess = Get-ChildItem -Path $repoRoot -Recurse -Filter "eng.traineddata" | Select-Object -First 1
if ($repoTess) {
  Copy-Item $repoTess.FullName (Join-Path $tessDest "eng.traineddata") -Force
} else {
  $appDataTess = Join-Path $env:LOCALAPPDATA "PokemmoLive\tessdata\eng.traineddata"
  if (Test-Path $appDataTess) {
    Copy-Item $appDataTess (Join-Path $tessDest "eng.traineddata") -Force
  } else {
    Write-Warning "eng.traineddata not found; OCR will not work until it exists."
  }
}

# Mirror into the electron/electron-builder unpacked output
# (works for both electron-builder --dir and electron-builder --win portable)
$releaseRoot = @(Join-Path $repoRoot "release\win-unpacked\resources"),
               @(Join-Path $repoRoot "dist\win-unpacked\resources") `
               | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $releaseRoot) {
  # Not built yet – electron-builder will still pick it up via extraResources (see package.json edit below)
  Write-Host "NOTE: release/dist win-unpacked not found. Skipping mirror to unpacked. (extraResources will handle it)"
} else {
  $dest = Join-Path $releaseRoot "live-helper"
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Path $dest | Out-Null
  Copy-Item "$helperDist\*" $dest -Recurse -Force
  Write-Host "Mirrored helper to $dest"
}

Write-Host "== LiveRouteOCR built successfully =="
