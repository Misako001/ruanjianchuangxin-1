Param(
  [switch]$SkipWeb
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "[VisionGenie] Using repo root: $repoRoot"

function Install-NpmDeps {
  Param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  Write-Host "[VisionGenie] Installing npm dependencies in $Path"
  Push-Location $Path
  try {
    npm install
  }
  finally {
    Pop-Location
  }
}

Install-NpmDeps -Path $repoRoot
Install-NpmDeps -Path (Join-Path $repoRoot 'backend')

if (-not $SkipWeb) {
  Install-NpmDeps -Path (Join-Path $repoRoot 'web')
}

Write-Host ""
Write-Host "[VisionGenie] Dependency install completed."
Write-Host "[VisionGenie] Next steps:"
Write-Host "  1. Prepare backend\\.env from backend\\.env.example"
Write-Host "  2. Start backend: npm run backend:start"
Write-Host "  3. Start Metro:   npm run start"
Write-Host "  4. Optional web:  cd web && npm run dev"
