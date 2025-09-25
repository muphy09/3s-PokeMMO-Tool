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

function Ensure-LinuxNativeLibraries {
  param(
    [string]$Destination
  )

  if (-not $Destination) { return }
  $nativeRoot = Join-Path $root 'usr/lib/x86_64-linux-gnu'
  if (-not (Test-Path $nativeRoot)) { return }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  foreach ($baseName in 'libtesseract', 'liblept') {
    $pattern = "$baseName.so*"
    $candidate = Get-ChildItem -Path $nativeRoot -Filter $pattern -File | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $candidate) { continue }

    $major = $null
    $parts = $candidate.Name -split '\.so\.'
    if ($parts.Length -ge 2) {
      $major = ($parts[1] -split '\.')[0]
    }

    $aliases = @("$baseName.so")
    if ($major) { $aliases += "$baseName.so.$major" }
    $aliases += $candidate.Name

    foreach ($alias in $aliases | Select-Object -Unique) {
      Copy-Item -Force $candidate.FullName (Join-Path $Destination $alias)
    }
  }
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

$linuxNative = Join-Path $linuxOut 'native'
Ensure-LinuxNativeLibraries -Destination $linuxNative

$tessSourceCandidates = @(
  (Join-Path $linuxOut 'tessdata/eng.traineddata')
  (Join-Path $winOut 'tessdata/eng.traineddata')
  (Join-Path $resourcesRoot 'tessdata/eng.traineddata')
) | Where-Object { Test-Path $_ }
if ($tessSourceCandidates.Count -gt 0) {
  $linuxTess = Join-Path $linuxOut 'tessdata'
  New-Item -ItemType Directory -Force -Path $linuxTess | Out-Null
  Copy-Item -Force $tessSourceCandidates[0] (Join-Path $linuxTess 'eng.traineddata')
}

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
