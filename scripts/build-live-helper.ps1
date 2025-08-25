param()

Write-Host "Building LiveRouteOCR helper..."

# Publish the helper to ./LiveRouteOCR
dotnet publish ./LiveRouteOCR/LiveRouteOCR.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o ./LiveRouteOCR

# Mirror to resources/live-helper for electron-builder extraResources
New-Item -ItemType Directory -Force -Path ./resources/LiveRouteOCR | Out-Null
Copy-Item -Recurse -Force ./live-helper/* ./resources/LiveRouteOCR/

# Ensure tessdata is in resources/tessdata
New-Item -ItemType Directory -Force -Path ./resources/tessdata | Out-Null
if (Test-Path ./LiveRouteOCR/tessdata/eng.traineddata) {
    Copy-Item ./LiveRouteOCR/tessdata/eng.traineddata ./resources/tessdata/eng.traineddata -Force
} elseif (Test-Path ./LiveRouteOCR/tessdata/eng.traineddata) {
    Copy-Item ./LiveRouteOCR/tessdata/eng.traineddata ./resources/tessdata/eng.traineddata -Force
}
