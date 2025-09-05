param(
  [switch]$Dev
)

Write-Host "Building LiveRouteOCR helper..."

# In dev runs (electron:dev), avoid expensive packaging steps.
if ($Dev) {
  Write-Host "Dev mode detected: skipping packaging steps (zip/copy)."

  $exePath = Join-Path $PSScriptRoot "..\LiveRouteOCR\LiveRouteOCR.exe"
  $needBuild = $true
  if (Test-Path $exePath) {
    try {
      $exeTime = (Get-Item $exePath).LastWriteTimeUtc
      $srcFiles = Get-ChildItem (Join-Path $PSScriptRoot "..\LiveRouteOCR") -Recurse -Include *.cs,*.csproj -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "\\obj\\|\\bin\\" }
      if ($srcFiles) {
        $latestSrc = ($srcFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1)
        if ($latestSrc.LastWriteTimeUtc -le $exeTime) { $needBuild = $false }
      }
    } catch { $needBuild = $true }
  }

  if (-not $needBuild) {
    Write-Host "LiveRouteOCR up-to-date; no rebuild needed."
    return
  }

  # Quick publish to the working folder for dev
  dotnet publish ./LiveRouteOCR/LiveRouteOCR.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o ./LiveRouteOCR
  Write-Host "Dev build complete. Skipping zip and resource copy."
  return
}

# Publish the helper directly into ./LiveRouteOCR
dotnet publish ./LiveRouteOCR/LiveRouteOCR.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o ./LiveRouteOCR

# Mirror to resources/LiveRouteOCR for electron-builder extraResources
New-Item -ItemType Directory -Force -Path ./resources/LiveRouteOCR | Out-Null
Copy-Item -Recurse -Force ./LiveRouteOCR/* ./resources/LiveRouteOCR/

# Create a zip alongside the build for packaging (packaging only)
if (Test-Path ./LiveRouteOCR/LiveRouteOCR.zip) { Remove-Item ./LiveRouteOCR/LiveRouteOCR.zip }
Compress-Archive -Path ./LiveRouteOCR/* -DestinationPath ./LiveRouteOCR/LiveRouteOCR.zip

# Ensure tessdata is in resources/tessdata
New-Item -ItemType Directory -Force -Path ./resources/tessdata | Out-Null
if (Test-Path ./LiveRouteOCR/tessdata/eng.traineddata) {
    Copy-Item ./LiveRouteOCR/tessdata/eng.traineddata ./resources/tessdata/eng.traineddata -Force
}
