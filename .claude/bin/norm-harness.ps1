param()

# Resolucion dinamica — portable a cualquier equipo o ruta de instalacion
$CORE_PATH = (Resolve-Path (Join-Path $PSScriptRoot ".." "..")).Path
$ProjectDir = (Get-Location).Path
$ClaudeMd = Join-Path $ProjectDir "CLAUDE.md"
$SkillsDir = Join-Path $ProjectDir ".\.claude\skills"
$SessionsDir = Join-Path $env:USERPROFILE ".\.claude\sessions"

function Test-IsSymlink {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item -Path $Path -Force
    return ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
}

function New-SymlinkForce {
    param(
        [string]$LinkPath,
        [string]$TargetPath,
        [bool]$IsDirectory = $false
    )
    if (Test-Path $LinkPath) {
        Remove-Item -Path $LinkPath -Force -Recurse -ErrorAction SilentlyContinue
    }
    if ($IsDirectory) {
        New-Item -ItemType SymbolicLink -Path $LinkPath -Target $TargetPath -Force | Out-Null
    } else {
        New-Item -ItemType SymbolicLink -Path $LinkPath -Target $TargetPath -Force | Out-Null
    }
}

$PreviousLocation = Get-Location

try {
    Push-Location $CORE_PATH
    git pull origin main --quiet 2>$null
}
catch {
}
finally {
    Pop-Location
}

# Validar y normalizar CLAUDE.md
if (-not (Test-IsSymlink $ClaudeMd)) {
    $SourceFile = Join-Path $CORE_PATH "CLAUDE.md"
    New-SymlinkForce -LinkPath $ClaudeMd -TargetPath $SourceFile
}

# Validar y normalizar .\.claude\skills
if (-not (Test-IsSymlink $SkillsDir)) {
    $SourceSkills = Join-Path $CORE_PATH ".\.claude\skills"
    New-SymlinkForce -LinkPath $SkillsDir -TargetPath $SourceSkills -IsDirectory $true
}

# Purgar sesiones
if (Test-Path $SessionsDir) {
    Remove-Item -Path "$SessionsDir\*" -Force -Recurse -ErrorAction SilentlyContinue
}

Write-Output "[SUCCESS] Melius v2.4.1: Sincronizacion remota y normalizacion completada."
