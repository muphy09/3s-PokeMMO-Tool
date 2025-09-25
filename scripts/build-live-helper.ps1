param(
  [switch]$Dev
)

Write-Host "Building LiveRouteOCR helper..."

$root = Split-Path -Parent $PSScriptRoot
$helperProject = Join-Path $root 'LiveRouteOCR'
$winOut = Join-Path $helperProject 'win-x64'
$linuxOut = Join-Path $helperProject 'linux-x64'
$resourcesRoot = Join-Path $root 'resources'
$helperResources = Join-Path $resourcesRoot 'LiveRouteOCR'
$winResources = Join-Path $helperResources 'win-x64'
$linuxResources = Join-Path $helperResources 'linux-x64'

function Publish-Helper {
  param(
    [string]$Runtime,
    [string]$Output
  )

  $framework = if ($Runtime -eq 'win-x64') { 'net6.0-windows' } else { 'net6.0' }
  dotnet publish ./LiveRouteOCR/LiveRouteOCR.csproj -c Release -r $Runtime -f $framework --self-contained true -p:PublishSingleFile=false -o $Output
}

if ($Dev) {
  Write-Host "Dev mode detected: publishing Windows helper only."
  Publish-Helper -Runtime 'win-x64' -Output $winOut
  Copy-Item -Force (Join-Path $winOut 'LiveRouteOCR.exe') (Join-Path $helperProject 'LiveRouteOCR.exe')
  return
}

Publish-Helper -Runtime 'win-x64' -Output $winOut
Publish-Helper -Runtime 'linux-x64' -Output $linuxOut

Copy-Item -Force (Join-Path $winOut 'LiveRouteOCR.exe') (Join-Path $helperProject 'LiveRouteOCR.exe')

New-Item -ItemType Directory -Force -Path $winResources | Out-Null
New-Item -ItemType Directory -Force -Path $linuxResources | Out-Null
Copy-Item -Recurse -Force (Join-Path $winOut '*') $winResources
Copy-Item -Recurse -Force (Join-Path $linuxOut '*') $linuxResources

$winZip = Join-Path $helperProject 'LiveRouteOCR.zip'
$linuxZip = Join-Path $helperProject 'LiveRouteOCR-linux.zip'
if (Test-Path $winZip) { Remove-Item $winZip }
if (Test-Path $linuxZip) { Remove-Item $linuxZip }
Compress-Archive -Path (Join-Path $winOut '*') -DestinationPath $winZip
Compress-Archive -Path (Join-Path $linuxOut '*') -DestinationPath $linuxZip

$tessSource = Join-Path $winOut 'tessdata/eng.traineddata'
if (Test-Path $tessSource) {
  $tessTarget = Join-Path $resourcesRoot 'tessdata'
  New-Item -ItemType Directory -Force -Path $tessTarget | Out-Null
  Copy-Item $tessSource (Join-Path $tessTarget 'eng.traineddata') -Force
}
