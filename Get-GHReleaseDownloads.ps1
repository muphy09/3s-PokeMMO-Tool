param(
  [string]$Owner = "muphy09",
  [string]$Repo  = "3s-PokeMMO-Tool"
)

$headers = @{
  "User-Agent" = "powershell-download-stats"
  "Accept"     = "application/vnd.github+json"
}

$allReleases = @()
$page = 1
while ($true) {
  $url = "https://api.github.com/repos/$Owner/$Repo/releases?per_page=100&page=$page"
  $resp = Invoke-RestMethod -Headers $headers -Uri $url -ErrorAction Stop
  if (-not $resp -or $resp.Count -eq 0) { break }
  $allReleases += $resp
  if ($resp.Count -lt 100) { break } # stop once we’ve pulled the last page
  $page++
}

if (-not $allReleases) { Write-Host "No releases found."; exit }

# Per-release totals
$report = $allReleases | ForEach-Object {
  [pscustomobject]@{
    ReleaseTag     = $_.tag_name
    PublishedDate  = $_.published_at
    ReleaseURL     = $_.html_url
    TotalDownloads = ($_.assets | Measure-Object -Property download_count -Sum).Sum
  }
} | Sort-Object PublishedDate -Descending

Write-Host "`nPer-release download totals:`n"
$report | Format-Table -AutoSize

# Grand total
$grand = ($allReleases | ForEach-Object assets | Measure-Object -Property download_count -Sum).Sum
Write-Host "`nGrand total downloads across ALL releases: $grand`n"
