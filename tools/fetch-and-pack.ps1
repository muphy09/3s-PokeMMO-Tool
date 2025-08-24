# tools/fetch-and-pack.ps1 (v1.1.1)
param([switch]$Portable=$true)
$ErrorActionPreference = "Stop"
Write-Host "==> Installing deps (if needed)..." -ForegroundColor Cyan
if (Test-Path package-lock.json) { npm ci } else { npm install }

Write-Host "==> Running PokeMMO ingestor..." -ForegroundColor Cyan
node tools/ingest-pokemmohub.js

if (!(Test-Path "public/data/pokemmo_locations.json")) {
  Write-Error "Ingestor did not produce public/data/pokemmo_locations.json"
  exit 1
}

Write-Host "==> Building web bundle..." -ForegroundColor Cyan
npm run build:web

if ($Portable) {
  Write-Host "==> Building portable EXE..." -ForegroundColor Cyan
  npm run portable
}

# Pack release or app+public into zip
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$zipName = "weakness-finder_v1.1.1_full_${stamp}.zip"
Add-Type -AssemblyName 'System.IO.Compression.FileSystem'
if (Test-Path "release") {
  [System.IO.Compression.ZipFile]::CreateFromDirectory("release", $zipName)
} elseif (Test-Path "dist") {
  [System.IO.Compression.ZipFile]::CreateFromDirectory("dist", $zipName)
} else {
  $tmp = Join-Path $env:TEMP ("wkpkg_" + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  if (Test-Path "app")   { Copy-Item app -Dest (Join-Path $tmp "app") -Recurse }
  if (Test-Path "public"){ Copy-Item public -Dest (Join-Path $tmp "public") -Recurse }
  if (Test-Path "electron"){ Copy-Item electron -Dest (Join-Path $tmp "electron") -Recurse -ErrorAction SilentlyContinue }
  if (Test-Path "package.json"){ Copy-Item package.json -Dest (Join-Path $tmp "package.json") -ErrorAction SilentlyContinue }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($tmp, $zipName)
  Remove-Item $tmp -Recurse -Force
}
Write-Host "==> Done. Output: $zipName" -ForegroundColor Green