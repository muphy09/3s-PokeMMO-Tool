param()

Write-Host "Building LiveRouteOCR helper..."

# Publish the helper directly into ./LiveRouteOCR
dotnet publish ./LiveRouteOCR/LiveRouteOCR.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o ./LiveRouteOCR

# Mirror to resources/LiveRouteOCR for electron-builder extraResources
New-Item -ItemType Directory -Force -Path ./resources/LiveRouteOCR | Out-Null
Copy-Item -Recurse -Force ./LiveRouteOCR/* ./resources/LiveRouteOCR/

# Create a zip alongside the build for packaging
if (Test-Path ./LiveRouteOCR/LiveRouteOCR.zip) { Remove-Item ./LiveRouteOCR/LiveRouteOCR.zip }
Compress-Archive -Path ./LiveRouteOCR/* -DestinationPath ./LiveRouteOCR/LiveRouteOCR.zip

# Ensure tessdata is in resources/tessdata
New-Item -ItemType Directory -Force -Path ./resources/tessdata | Out-Null
if (Test-Path ./LiveRouteOCR/tessdata/eng.traineddata) {
    Copy-Item ./LiveRouteOCR/tessdata/eng.traineddata ./resources/tessdata/eng.traineddata -Force
}
