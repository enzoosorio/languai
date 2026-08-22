# validate_repo_ids.ps1
# Detecta identificadores D<n>, Q<n> o G<n> que puedan confundir al parser de repo
# (por ejemplo, comandos SVG como Q80 en un path) fuera de los items canónicos.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repoRoot = Split-Path -Parent $PSScriptRoot
$canonical = @{}

function Register-Canonical {
    param([string]$path, [string]$pattern)
    $full = Join-Path $repoRoot $path
    if (-not (Test-Path $full)) { return }
    foreach ($line in Get-Content $full -Encoding UTF8) {
        if ($line -match $pattern) {
            $id = $matches[1].Trim()
            $canonical[$id] = $true
        }
    }
}

# Items canónicos
Register-Canonical 'crafting\00-DECISIONS.md' '^\s*\|\s*([DQG]\d+)\b'
Register-Canonical 'crafting\MINI_TASKS.md'  '^\s*\|\s*(\d+)\s*\|'

$files = Get-ChildItem -Path $repoRoot -Recurse -File -Include '*.md','*.svg','*.tsx','*.ts','*.jsx','*.js' |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\\.git\\' }

$findings = @()
$codeFence = $false

foreach ($file in $files) {
    $lines = Get-Content $file.FullName -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $lines) { continue }

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if (-not $codeFence -and $line -match '^```') {
            $codeFence = $true
            continue
        }
        if ($codeFence -and $line -match '^```') {
            $codeFence = $false
            continue
        }
        if ($codeFence) { continue }

        # Ignorar inline code simple (una o varias backticks en la misma línea)
        $lineWithoutInline = $line -replace '`[^`]*`', ''

        # Buscar D<n>, Q<n>, G<n> como palabra
        $matches = [regex]::Matches($lineWithoutInline, '\b([DQG]\d+)\b')
        foreach ($m in $matches) {
            $id = $m.Groups[1].Value
            if (-not $canonical.ContainsKey($id)) {
                $findings += [PSCustomObject]@{
                    File = $file.FullName.Substring($repoRoot.Length + 1)
                    Line = $i + 1
                    Text = $line.Trim()
                    Id   = $id
                }
            }
        }
    }
}

if ($findings.Count -eq 0) {
    Write-Host "OK: No hay identificadores D/Q/G fugaces fuera de los items canonicos." -ForegroundColor Green
    exit 0
} else {
    Write-Host "ADVERTENCIA: Se encontraron identificadores que pueden confundir al parser:" -ForegroundColor Yellow
    $findings | Format-Table -AutoSize
    Write-Host "Corregir usando variables/placeholders en ejemplos tecnicos (SVG, paths, etc.)." -ForegroundColor Yellow
    exit 1
}
