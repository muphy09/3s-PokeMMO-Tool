param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('linux','windows','mac')]
  [string]$Target
)

$ErrorActionPreference = 'Stop'
$workflowFile = 'dev-export.yml'

function Get-RepoInfo {
  $origin = (git config --get remote.origin.url) 2>$null
  if (-not $origin) {
    throw "Unable to read git remote 'origin'. Ensure the project is a GitHub repository."
  }
  if ($origin -match 'github.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(?:\.git)?$') {
    $owner = $Matches.owner
    $repo = $Matches.repo
    return [pscustomobject]@{
      Owner      = $owner
      Repo       = $repo
      ActionsUrl = "https://github.com/$owner/$repo/actions"
      ApiBase    = "https://api.github.com/repos/$owner/$repo"
    }
  }
  throw "Remote origin URL '$origin' is not a recognized GitHub repository URL."
}

$repo = Get-RepoInfo

$branch = (git rev-parse --abbrev-ref HEAD) 2>$null
if (-not $branch -or $branch -eq 'HEAD') {
  $branch = 'main'
}

$ghCli = Get-Command gh -ErrorAction SilentlyContinue

if ($ghCli) {
  Write-Host "Dispatching '$workflowFile' via GitHub CLI for branch '$branch'..."
  $args = @('workflow','run',$workflowFile,'-f',"target=$Target",'--ref',$branch)
  $output = gh @args 2>&1
  $exitCode = $LASTEXITCODE
  $output | Out-Host
  if ($exitCode -ne 0) {
    exit $exitCode
  }
  $match = Select-String -InputObject $output -Pattern 'https://github.com/\S+/actions/runs/\d+'
  if ($match) {
    Write-Host "Triggered workflow run: $($match.Matches[0].Value)"
  } else {
    Write-Host "Workflow dispatched. Monitor progress at $($repo.ActionsUrl)"
  }
  exit 0
}

$token = $env:GH_TOKEN
if (-not $token) { $token = $env:GITHUB_TOKEN }
if (-not $token) { $token = $env:GITHUB_PAT }
if (-not $token) {
  throw "Set an environment variable 'GH_TOKEN' or 'GITHUB_TOKEN' with a GitHub personal access token that has workflow scope, or install the GitHub CLI ('gh')."
}

$dispatchUrl = "$($repo.ApiBase)/actions/workflows/$workflowFile/dispatches"
$body = @{ ref = $branch; inputs = @{ target = $Target } } | ConvertTo-Json
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'pokemmo-tool-export-script' }

Write-Host "Dispatching '$workflowFile' via GitHub REST API for branch '$branch'..."
Invoke-RestMethod -Uri $dispatchUrl -Headers $headers -Method Post -Body $body -ContentType 'application/json'

Write-Host "Workflow dispatched. Monitor progress at $($repo.ActionsUrl)"
