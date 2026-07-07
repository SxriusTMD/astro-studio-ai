[CmdletBinding()]
param(
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$failures = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$passes = [System.Collections.Generic.List[string]]::new()

function Add-Pass([string]$Message) {
  $passes.Add($Message)
  Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Add-Warning([string]$Message) {
  $warnings.Add($Message)
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Add-Failure([string]$Message) {
  $failures.Add($Message)
  Write-Host "[FAIL] $Message" -ForegroundColor Red
}

Push-Location $repoRoot
try {
  $required = @('index.html', 'server.js', 'package.json', 'src/main.js', 'src/api.js', 'src/auth.js', 'src/chat.js', 'src/persistence.js', 'src/ui-components.js', 'src/supabaseClient.js')
  $missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_) })
  if ($missing.Count -eq 0) {
    Add-Pass 'Required project files are present'
  } else {
    Add-Failure ("Missing required files: " + ($missing -join ', '))
  }

  $jsFiles = @('server.js') + @(Get-ChildItem -LiteralPath 'src' -Filter '*.js' -File | ForEach-Object { $_.FullName })
  foreach ($file in $jsFiles) {
    $display = if ([System.IO.Path]::IsPathRooted($file) -and $file.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      $file.Substring($repoRoot.Length).TrimStart('\', '/')
    } else {
      $file
    }
    $syntaxOutput = & node --check $file 2>&1
    if ($LASTEXITCODE -eq 0) {
      Add-Pass "Syntax: $display"
    } else {
      Add-Failure "Syntax: $display - $($syntaxOutput -join ' ')"
    }
  }

  $diffOutput = & git diff --check 2>&1
  if ($LASTEXITCODE -eq 0) {
    Add-Pass 'git diff --check'
  } else {
    Add-Failure ("git diff --check - " + ($diffOutput -join ' '))
  }

  $localhostMatches = @(Get-ChildItem -LiteralPath 'src' -Filter '*.js' -File | Select-String -SimpleMatch 'http://localhost:3000')
  if ($localhostMatches.Count -eq 0) {
    Add-Pass 'No hardcoded localhost URL in src'
  } else {
    Add-Failure ("Hardcoded localhost URL: " + (($localhostMatches | ForEach-Object { "$($_.Path):$($_.LineNumber)" }) -join ', '))
  }

  $trackedEnv = @(& git ls-files -- '.env')
  if ($trackedEnv.Count -eq 0) {
    Add-Pass '.env is not tracked'
  } else {
    Add-Failure '.env is tracked by Git'
  }

  $secretMatches = @(& git grep -n -I -E 'GOCSPX-|nvapi-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{20,}' -- ':!package-lock.json' ':!.agents/skills/aerolex-release-check/scripts/project-check.ps1' 2>$null)
  if ($secretMatches.Count -eq 0) {
    Add-Pass 'No common secret pattern in tracked files'
  } else {
    Add-Failure ("Potential secret in tracked files: " + ($secretMatches -join '; '))
  }

  $routePattern = [regex]'app\.(get|post|put|patch|delete)\(\s*[\x27\x22]([^\x27\x22]+)[\x27\x22]'
  $routes = [System.Collections.Generic.List[object]]::new()
  $serverLines = Get-Content -LiteralPath 'server.js'
  for ($i = 0; $i -lt $serverLines.Count; $i++) {
    $match = $routePattern.Match($serverLines[$i])
    if ($match.Success) {
      $routes.Add([pscustomobject]@{
        Key = ($match.Groups[1].Value.ToUpperInvariant() + ' ' + $match.Groups[2].Value)
        Line = $i + 1
      })
    }
  }

  $duplicates = @($routes | Group-Object Key | Where-Object Count -gt 1)
  if ($duplicates.Count -eq 0) {
    Add-Pass 'No duplicate Express routes'
  } else {
    foreach ($duplicate in $duplicates) {
      $lines = ($duplicate.Group.Line -join ', ')
      Add-Warning "Duplicate route $($duplicate.Name) at lines $lines"
    }
  }

  if ($Strict -and $warnings.Count -gt 0) {
    foreach ($warning in $warnings) {
      $failures.Add("Strict mode: $warning")
    }
  }

  Write-Host ''
  Write-Host "Summary: $($passes.Count) passed, $($warnings.Count) warnings, $($failures.Count) failures"
  if ($failures.Count -gt 0) { exit 1 }
  exit 0
}
finally {
  Pop-Location
}
