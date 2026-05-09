#Requires -Version 5.1
<#
.SYNOPSIS
    SDLC Guardian Agents — Package & Deploy (Windows / PowerShell)

.DESCRIPTION
    Windows equivalent of package.sh. Functionally identical:
    - Builds the distributable zip (dist\sdlc-guardian-agents.zip)
    - Installs to %USERPROFILE%\.copilot\
    - Uninstalls from %USERPROFILE%\.copilot\ (preserving user side-notes)
    - Runs the doctor preflight to verify tools and Guardian files

    The Copilot CLI on Windows reads from %USERPROFILE%\.copilot\, the same
    relative location as ~/.copilot on macOS/Linux, so the installed layout
    is identical.

.PARAMETER Install
    Build zip AND install to %USERPROFILE%\.copilot\

.PARAMETER Uninstall
    Remove SDLC Guardian Agents files from %USERPROFILE%\.copilot\
    (side-notes *.notes.md files are preserved — they are user data)

.PARAMETER Doctor
    Verify all prerequisites are installed (Git, gh, Copilot CLI, optional
    Guardian tools) and that Guardian files have been deployed.

.EXAMPLE
    .\package.ps1
    Build zip only.

.EXAMPLE
    .\package.ps1 -Install
    Build zip and install to %USERPROFILE%\.copilot\

.EXAMPLE
    .\package.ps1 -Uninstall

.EXAMPLE
    .\package.ps1 -Doctor

.NOTES
    Mirror of package.sh. Keep changes in sync between the two scripts.
#>

[CmdletBinding(DefaultParameterSetName = 'Package')]
param(
    [Parameter(ParameterSetName = 'Install')]
    [switch]$Install,

    [Parameter(ParameterSetName = 'Uninstall')]
    [switch]$Uninstall,

    [Parameter(ParameterSetName = 'Doctor')]
    [switch]$Doctor
)

$ErrorActionPreference = 'Stop'

# ────────────────────────────────────────────────────────────────────────────
# Paths
# ────────────────────────────────────────────────────────────────────────────

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SrcDir    = Join-Path $ScriptDir 'src'
$DistDir   = Join-Path $ScriptDir 'dist'

# Cross-platform user profile directory:
#   Windows → %USERPROFILE% (e.g. C:\Users\vbomfim)
#   macOS / Linux → $HOME (e.g. /Users/vbomfim)
# [Environment]::GetFolderPath('UserProfile') returns the correct location on
# both platforms, which keeps the install layout identical to package.sh.
$UserHome  = [Environment]::GetFolderPath('UserProfile')
$TargetDir = Join-Path $UserHome '.copilot'

# ────────────────────────────────────────────────────────────────────────────
# Guardian roster — single source of truth (must match package.sh)
# ────────────────────────────────────────────────────────────────────────────

$Guardians = @(
    'security-guardian',
    'code-review-guardian',
    'po-guardian',
    'dev-guardian',
    'qa-guardian',
    'platform-guardian',
    'delivery-guardian',
    'privacy-guardian'
)

# ────────────────────────────────────────────────────────────────────────────
# Helpers — colored output
# ────────────────────────────────────────────────────────────────────────────

function Write-Ok      { param([string]$Msg) Write-Host "✔  $Msg" -ForegroundColor Green }
function Write-Bad     { param([string]$Msg) Write-Host "✘  $Msg" -ForegroundColor Red }
function Write-Warn    { param([string]$Msg) Write-Host "⚠  $Msg" -ForegroundColor Yellow }
function Write-Info    { param([string]$Msg) Write-Host $Msg -ForegroundColor Cyan }
function Write-Section { param([string]$Msg) Write-Host ''; Write-Host $Msg -ForegroundColor White }
function Write-Bold    { param([string]$Msg) Write-Host $Msg -ForegroundColor White }

function New-DirIfMissing {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Copy-FileSafe {
    param(
        [Parameter(Mandatory)] [string]$From,
        [Parameter(Mandatory)] [string]$To
    )
    if (-not (Test-Path -LiteralPath $From)) {
        throw "Source file not found: $From"
    }
    Copy-Item -LiteralPath $From -Destination $To -Force
}

function Copy-DirContents {
    param(
        [Parameter(Mandatory)] [string]$From,
        [Parameter(Mandatory)] [string]$To
    )
    if (-not (Test-Path -LiteralPath $From)) {
        throw "Source directory not found: $From"
    }
    New-DirIfMissing -Path $To
    # -Path (not -LiteralPath) so the wildcard is expanded
    Copy-Item -Path (Join-Path $From '*') -Destination $To -Recurse -Force
}

# ────────────────────────────────────────────────────────────────────────────
# package — build zip
# ────────────────────────────────────────────────────────────────────────────

function Invoke-Package {
    Write-Host ''
    Write-Info '📦 Packaging SDLC Guardian Agents...'

    New-DirIfMissing -Path $DistDir
    $zipPath = Join-Path $DistDir 'sdlc-guardian-agents.zip'
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    # Build a staging dir that mirrors src but excludes hidden files and *.test.* files
    $staging = Join-Path ([System.IO.Path]::GetTempPath()) "sdlc-guardian-stage-$(Get-Random)"
    try {
        New-DirIfMissing -Path $staging

        Get-ChildItem -LiteralPath $SrcDir -Recurse -File | Where-Object {
            $_.Name -notlike '.*' -and $_.Name -notmatch '\.test\.'
        } | ForEach-Object {
            $relative = $_.FullName.Substring($SrcDir.Length).TrimStart('\', '/')
            $destPath = Join-Path $staging $relative
            $destDir  = Split-Path -Parent $destPath
            New-DirIfMissing -Path $destDir
            Copy-Item -LiteralPath $_.FullName -Destination $destPath -Force
        }

        Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
    }
    finally {
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
    }

    $size = '{0:N0} KB' -f ((Get-Item -LiteralPath $zipPath).Length / 1KB)
    Write-Host ''
    Write-Ok "Package created: dist\sdlc-guardian-agents.zip ($size)"
    Write-Host ''
    Write-Host '  To install:'
    Write-Info '    Expand-Archive dist\sdlc-guardian-agents.zip -DestinationPath (Join-Path ([Environment]::GetFolderPath(''UserProfile'')) ''.copilot'')'
    Write-Info '    .\package.ps1 -Install   (recommended)'
}

# ────────────────────────────────────────────────────────────────────────────
# install — copy files into ~/.copilot/
# ────────────────────────────────────────────────────────────────────────────

function Invoke-Install {
    Write-Host ''
    Write-Info "🛡️  Installing Guardians to $TargetDir\..."
    Write-Host ''

    # Ensure target dirs exist
    New-DirIfMissing (Join-Path $TargetDir 'skills\security-guardian')
    New-DirIfMissing (Join-Path $TargetDir 'skills\code-review-guardian')
    New-DirIfMissing (Join-Path $TargetDir 'skills\platform-guardian')
    New-DirIfMissing (Join-Path $TargetDir 'skills\privacy-guardian')
    New-DirIfMissing (Join-Path $TargetDir 'agents')
    New-DirIfMissing (Join-Path $TargetDir 'instructions')
    New-DirIfMissing (Join-Path $TargetDir 'templates')

    # ── Install agents ──
    foreach ($g in $Guardians) {
        Copy-FileSafe -From (Join-Path $SrcDir "agents\$g.agent.md") -To (Join-Path $TargetDir 'agents')
    }

    # Security Guardian sub-Guardians (coordinator/specialist split — see specs/security-guardian-split/spec.md)
    $secSubSrc = Join-Path $SrcDir 'agents\security'
    if (Test-Path $secSubSrc) {
        $secSubDst = Join-Path $TargetDir 'agents\security'
        New-DirIfMissing $secSubDst
        Copy-DirContents -From $secSubSrc -To $secSubDst
    }

    # ── Install instructions ──
    foreach ($g in $Guardians) {
        Copy-FileSafe -From (Join-Path $SrcDir "instructions\$g.instructions.md") -To (Join-Path $TargetDir 'instructions')
    }
    Copy-FileSafe -From (Join-Path $SrcDir 'instructions\sdlc-workflow.instructions.md') -To (Join-Path $TargetDir 'instructions')

    # ── Install Operator (not a Guardian — separate naming convention) ──
    Copy-FileSafe -From (Join-Path $SrcDir 'agents\operator.agent.md') -To (Join-Path $TargetDir 'agents')
    Copy-FileSafe -From (Join-Path $SrcDir 'instructions\operator.instructions.md') -To (Join-Path $TargetDir 'instructions')

    # ── Install Craig instructions ──
    Copy-FileSafe -From (Join-Path $SrcDir 'instructions\craig.instructions.md') -To (Join-Path $TargetDir 'instructions')

    # ── Install templates (Spec Kit-compatible Formal Spec, ticket, audit, scaffolds) ──
    New-DirIfMissing (Join-Path $TargetDir 'templates\scaffold')
    Copy-FileSafe -From (Join-Path $SrcDir 'templates\feature-spec.template.md')   -To (Join-Path $TargetDir 'templates')
    Copy-FileSafe -From (Join-Path $SrcDir 'templates\feature-ticket.template.md') -To (Join-Path $TargetDir 'templates')
    Copy-FileSafe -From (Join-Path $SrcDir 'templates\project-audit.template.md')  -To (Join-Path $TargetDir 'templates')
    Copy-DirContents -From (Join-Path $SrcDir 'templates\scaffold')               -To (Join-Path $TargetDir 'templates\scaffold')

    # ── Install skills (tool definitions only — no scripts) ──
    New-DirIfMissing (Join-Path $TargetDir 'skills\playwright-mcp')
    Copy-DirContents -From (Join-Path $SrcDir 'skills\security-guardian')    -To (Join-Path $TargetDir 'skills\security-guardian')
    Copy-DirContents -From (Join-Path $SrcDir 'skills\code-review-guardian') -To (Join-Path $TargetDir 'skills\code-review-guardian')
    Copy-DirContents -From (Join-Path $SrcDir 'skills\platform-guardian')    -To (Join-Path $TargetDir 'skills\platform-guardian')
    Copy-DirContents -From (Join-Path $SrcDir 'skills\privacy-guardian')     -To (Join-Path $TargetDir 'skills\privacy-guardian')
    Copy-DirContents -From (Join-Path $SrcDir 'skills\playwright-mcp')       -To (Join-Path $TargetDir 'skills\playwright-mcp')

    # ── Install extensions (runtime modules only — no test files) ──
    New-DirIfMissing (Join-Path $TargetDir 'extensions\sdlc-guardian')
    Copy-FileSafe -From (Join-Path $SrcDir 'extensions\sdlc-guardian\extension.mjs')         -To (Join-Path $TargetDir 'extensions\sdlc-guardian')
    Copy-FileSafe -From (Join-Path $SrcDir 'extensions\sdlc-guardian\uat-state-machine.mjs') -To (Join-Path $TargetDir 'extensions\sdlc-guardian')

    New-DirIfMissing (Join-Path $TargetDir 'extensions\craig')
    Copy-FileSafe -From (Join-Path $SrcDir 'extensions\craig\extension.mjs')      -To (Join-Path $TargetDir 'extensions\craig')
    Copy-FileSafe -From (Join-Path $SrcDir 'extensions\craig\craig-scheduler.mjs') -To (Join-Path $TargetDir 'extensions\craig')
    Copy-FileSafe -From (Join-Path $SrcDir 'extensions\craig\craig-config.mjs')   -To (Join-Path $TargetDir 'extensions\craig')

    # ── Seed side-notes files (never overwrite existing — user data) ──
    $notesCreated = 0
    $notesExisted = 0
    foreach ($g in $Guardians) {
        if ($g -notmatch '^[a-z-]+$') { continue }
        $notesFile = Join-Path $TargetDir "instructions\$g.notes.md"
        if (-not (Test-Path -LiteralPath $notesFile)) {
            $body = @"
# $g — Advisory Notes

<!-- Learned patterns from past reviews. Guardians read this file at startup. -->
<!-- Add notes as markdown bullets. Keep to ~20 items; prune when exceeded. -->
"@
            # Use WriteAllText so we get UTF-8 without BOM (matches package.sh output)
            [System.IO.File]::WriteAllText($notesFile, $body, [System.Text.UTF8Encoding]::new($false))
            $notesCreated++
        } else {
            $notesExisted++
        }
    }

    # ── Print summary in package.sh order ──
    Write-Bold 'Security Guardian:'
    Write-Ok 'Agent:        ~/.copilot/agents/security-guardian.agent.md'
    $secSubDst = Join-Path $TargetDir 'agents\security'
    if (Test-Path $secSubDst) {
        $subCount = (Get-ChildItem -Path $secSubDst -Filter '*.agent.md' -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Ok ("Sub-agents:   ~/.copilot/agents/security/ ({0} specialist file(s))" -f $subCount)
    }
    Write-Ok 'Instructions: ~/.copilot/instructions/security-guardian.instructions.md'
    Write-Ok 'Skill:        ~/.copilot/skills/security-guardian/'
    Write-Host ''
    Write-Bold 'Code Review Guardian:'
    Write-Ok 'Agent:        ~/.copilot/agents/code-review-guardian.agent.md'
    Write-Ok 'Instructions: ~/.copilot/instructions/code-review-guardian.instructions.md'
    Write-Ok 'Skill:        ~/.copilot/skills/code-review-guardian/'
    Write-Host ''
    Write-Bold 'Product Owner Guardian:'
    Write-Ok 'Agent:        ~/.copilot/agents/po-guardian.agent.md'
    Write-Ok 'Instructions: ~/.copilot/instructions/po-guardian.instructions.md'
    Write-Host ''
    Write-Bold 'Developer Guardian:'
    Write-Ok 'Agent:        ~/.copilot/agents/dev-guardian.agent.md'
    Write-Ok 'Instructions: ~/.copilot/instructions/dev-guardian.instructions.md'
    Write-Host ''
    Write-Bold 'QA Guardian:'
    Write-Ok 'Agent:        ~/.copilot/agents/qa-guardian.agent.md'
    Write-Ok 'Instructions: ~/.copilot/instructions/qa-guardian.instructions.md'
    Write-Host ''
    Write-Bold 'Platform Guardian:'
    Write-Ok 'Agent:        ~/.copilot/agents/platform-guardian.agent.md'
    Write-Ok 'Instructions: ~/.copilot/instructions/platform-guardian.instructions.md'
    Write-Ok 'Skill:        ~/.copilot/skills/platform-guardian/'
    Write-Host ''
    Write-Bold 'Delivery Guardian:'
    Write-Ok 'Agent:        ~/.copilot/agents/delivery-guardian.agent.md'
    Write-Ok 'Instructions: ~/.copilot/instructions/delivery-guardian.instructions.md'
    Write-Host ''
    Write-Bold 'Privacy Guardian:'
    Write-Ok 'Agent:        ~/.copilot/agents/privacy-guardian.agent.md'
    Write-Ok 'Instructions: ~/.copilot/instructions/privacy-guardian.instructions.md'
    Write-Ok 'Skill:        ~/.copilot/skills/privacy-guardian/'
    Write-Host ''
    Write-Bold 'Operator (task runner):'
    Write-Ok 'Agent:        ~/.copilot/agents/operator.agent.md'
    Write-Ok 'Instructions: ~/.copilot/instructions/operator.instructions.md'
    Write-Ok 'Skill:        ~/.copilot/skills/playwright-mcp/'
    Write-Host ''
    Write-Bold 'Craig (scheduled tasks):'
    Write-Ok 'Instructions: ~/.copilot/instructions/craig.instructions.md'
    Write-Ok 'Extension:    ~/.copilot/extensions/craig/extension.mjs'
    Write-Ok 'Scheduler:    ~/.copilot/extensions/craig/craig-scheduler.mjs'
    Write-Ok 'Config loader: ~/.copilot/extensions/craig/craig-config.mjs'
    Write-Host ''
    Write-Bold 'SDLC Guardian Extension:'
    Write-Ok 'Extension:    ~/.copilot/extensions/sdlc-guardian/extension.mjs'
    Write-Ok 'State machine: ~/.copilot/extensions/sdlc-guardian/uat-state-machine.mjs'
    Write-Host ''
    Write-Bold 'Templates:'
    Write-Ok 'Feature Spec:   ~/.copilot/templates/feature-spec.template.md (Spec Kit-compatible)'
    Write-Ok 'Feature Ticket: ~/.copilot/templates/feature-ticket.template.md (18 sections)'
    Write-Ok 'Project Audit:  ~/.copilot/templates/project-audit.template.md'
    Write-Ok 'Scaffolds:      ~/.copilot/templates/scaffold/ (README, ARCHITECTURE, ADR, CONTRIBUTING, SECURITY)'
    Write-Host ''
    Write-Bold 'Side-Notes (advisory):'
    Write-Ok ('Notes: {0} created, {1} preserved' -f $notesCreated, $notesExisted)
    Write-Host ''
    Write-Bold "You're set! Open Copilot CLI and:"
    Write-Host '  • Global instructions are already active' -ForegroundColor Green
    Write-Host '  • Use /agent to pick any Guardian (Security, Code Review, PO, …)'
    Write-Host '  • Say "set up security" to install scanning tools'
}

# ────────────────────────────────────────────────────────────────────────────
# uninstall — remove Guardian files (preserve side-notes)
# ────────────────────────────────────────────────────────────────────────────

function Remove-IfExists {
    param([string]$Path, [string]$Description)
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
        Write-Ok "Removed $Description"
    }
}

function Invoke-Uninstall {
    Write-Host ''
    Write-Host '🗑️  Uninstalling Guardians...' -ForegroundColor Yellow
    Write-Host ''

    foreach ($g in $Guardians) {
        Remove-IfExists -Path (Join-Path $TargetDir "skills\$g")                  -Description "~/.copilot/skills/$g/"
        Remove-IfExists -Path (Join-Path $TargetDir "agents\$g.agent.md")          -Description "~/.copilot/agents/$g.agent.md"
        Remove-IfExists -Path (Join-Path $TargetDir "instructions\$g.instructions.md") -Description "~/.copilot/instructions/$g.instructions.md"
    }

    Remove-IfExists -Path (Join-Path $TargetDir 'instructions\sdlc-workflow.instructions.md') -Description '~/.copilot/instructions/sdlc-workflow.instructions.md'
    Remove-IfExists -Path (Join-Path $TargetDir 'agents\operator.agent.md')                   -Description '~/.copilot/agents/operator.agent.md'
    Remove-IfExists -Path (Join-Path $TargetDir 'instructions\operator.instructions.md')      -Description '~/.copilot/instructions/operator.instructions.md'
    Remove-IfExists -Path (Join-Path $TargetDir 'extensions\sdlc-guardian')                   -Description '~/.copilot/extensions/sdlc-guardian/'
    Remove-IfExists -Path (Join-Path $TargetDir 'extensions\craig')                           -Description '~/.copilot/extensions/craig/'

    # ── Remove templates ──
    Remove-IfExists -Path (Join-Path $TargetDir 'templates\feature-spec.template.md')   -Description '~/.copilot/templates/feature-spec.template.md'
    Remove-IfExists -Path (Join-Path $TargetDir 'templates\feature-ticket.template.md') -Description '~/.copilot/templates/feature-ticket.template.md'
    Remove-IfExists -Path (Join-Path $TargetDir 'templates\project-audit.template.md')  -Description '~/.copilot/templates/project-audit.template.md'
    Remove-IfExists -Path (Join-Path $TargetDir 'templates\scaffold')                   -Description '~/.copilot/templates/scaffold/'
    $templatesDir = Join-Path $TargetDir 'templates'
    if ((Test-Path -LiteralPath $templatesDir) -and (-not (Get-ChildItem -LiteralPath $templatesDir))) {
        Remove-Item -LiteralPath $templatesDir -Force
        Write-Ok 'Removed empty ~/.copilot/templates/'
    }

    Write-Host ''
    Write-Host 'Done.' -ForegroundColor Green
    Write-Host 'Repo-level files (.github/) are untouched — remove per-repo if needed.'
    Write-Host 'Side-notes files (~/.copilot/instructions/*.notes.md) are preserved — they contain user data.' -ForegroundColor DarkGray
}

# ────────────────────────────────────────────────────────────────────────────
# doctor — verify prerequisites and installed Guardian files
# ────────────────────────────────────────────────────────────────────────────

# Doctor counters (script-scoped so the check helpers can update them)
$script:DoctorTotal           = 0
$script:DoctorAvailable       = 0
$script:DoctorOptionalMissing = 0
$script:DoctorCoreMissing     = 0
$script:DoctorFileTotal       = 0
$script:DoctorFileOk          = 0
$script:DoctorFileMissing     = 0

function Test-Tool {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [string]$Command,
        [string]$VersionFlag = '',
        [Parameter(Mandatory)] [string]$Guardian,
        [string]$Hint = '',
        [switch]$Core
    )
    $script:DoctorTotal++

    $cmdInfo = Get-Command $Command -ErrorAction SilentlyContinue
    if ($cmdInfo) {
        $version = ''
        if ($VersionFlag) {
            try {
                $output = & $Command $VersionFlag.Split(' ') 2>&1 | Out-String
                $match = [regex]::Match($output, '\d+\.\d+(\.\d+)*')
                if ($match.Success) { $version = $match.Value }
            } catch {
                # ignore — version detection is best-effort
            }
        }
        if ($version) {
            Write-Host "  ✅ $Name " -NoNewline -ForegroundColor Green
            Write-Host "($version)" -ForegroundColor DarkGray
        } else {
            Write-Host "  ✅ $Name" -ForegroundColor Green
        }
        $script:DoctorAvailable++
        return
    }

    if ($Core) {
        Write-Host "  ❌ $Name " -NoNewline -ForegroundColor Red
        Write-Host "— Used by: $Guardian" -ForegroundColor DarkGray
        $script:DoctorCoreMissing++
    } else {
        Write-Host "  ⚠  $Name " -NoNewline -ForegroundColor Yellow
        Write-Host "— Used by: $Guardian" -ForegroundColor DarkGray
        $script:DoctorOptionalMissing++
    }
    if ($Hint) {
        Write-Host "      Install: $Hint" -ForegroundColor DarkGray
    }
}

function Test-Artifact {
    param(
        [Parameter(Mandatory)] [string]$RelativePath,
        [Parameter(Mandatory)] [string]$Description
    )
    $script:DoctorFileTotal++
    $fullPath = Join-Path $TargetDir $RelativePath

    if (Test-Path -LiteralPath $fullPath) {
        Write-Host "  ✅ $Description" -ForegroundColor Green
        $script:DoctorFileOk++
    } else {
        Write-Host "  ⚠  $Description " -NoNewline -ForegroundColor Yellow
        Write-Host "— ~/.copilot/$RelativePath" -ForegroundColor DarkGray
        $script:DoctorFileMissing++
    }
}

function Doctor-CheckTools {
    Write-Section 'Core Requirements'
    Test-Tool -Name 'Git'         -Command 'git'     -VersionFlag '--version' -Guardian 'All Guardians'             -Hint 'see PREREQUISITES.md' -Core
    Test-Tool -Name 'GitHub CLI'  -Command 'gh'      -VersionFlag '--version' -Guardian 'PO Guardian, Default Agent' -Hint 'see PREREQUISITES.md' -Core
    Test-Tool -Name 'Copilot CLI' -Command 'copilot' -VersionFlag '--version' -Guardian 'All Guardians'             -Hint 'see PREREQUISITES.md' -Core

    Write-Section 'Security Guardian Tools'
    Test-Tool -Name 'Semgrep'  -Command 'semgrep'  -VersionFlag '--version' -Guardian 'Security Guardian, Privacy Guardian' -Hint 'pip install semgrep (see PREREQUISITES.md)'
    Test-Tool -Name 'Gitleaks' -Command 'gitleaks' -VersionFlag 'version'   -Guardian 'Security Guardian, Privacy Guardian' -Hint 'see PREREQUISITES.md'
    Test-Tool -Name 'Trivy'    -Command 'trivy'    -VersionFlag '--version' -Guardian 'Security Guardian, Platform Guardian' -Hint 'see PREREQUISITES.md'

    Write-Section 'Code Review Guardian Tools'
    Test-Tool -Name 'ESLint'             -Command 'eslint'       -VersionFlag '--version' -Guardian 'Code Review Guardian' -Hint 'npm install -g eslint (see PREREQUISITES.md)'
    Test-Tool -Name 'Ruff'               -Command 'ruff'         -VersionFlag '--version' -Guardian 'Code Review Guardian' -Hint 'pip install ruff (see PREREQUISITES.md)'
    Test-Tool -Name 'Pylint'             -Command 'pylint'       -VersionFlag '--version' -Guardian 'Code Review Guardian' -Hint 'pip install pylint (see PREREQUISITES.md)'
    Test-Tool -Name 'Clippy'             -Command 'cargo-clippy' -VersionFlag '--version' -Guardian 'Code Review Guardian' -Hint 'rustup component add clippy (see PREREQUISITES.md)'
    Test-Tool -Name 'dotnet'             -Command 'dotnet'       -VersionFlag '--version' -Guardian 'Code Review Guardian' -Hint 'see PREREQUISITES.md'
    Test-Tool -Name 'Maven (Checkstyle)' -Command 'mvn'          -VersionFlag '--version' -Guardian 'Code Review Guardian' -Hint 'see PREREQUISITES.md'

    Write-Section 'Platform Guardian Tools'
    Test-Tool -Name 'kubectl'    -Command 'kubectl'    -VersionFlag 'version --client' -Guardian 'Platform Guardian'                     -Hint 'see PREREQUISITES.md'
    Test-Tool -Name 'kube-bench' -Command 'kube-bench' -VersionFlag 'version'          -Guardian 'Platform Guardian'                     -Hint 'see PREREQUISITES.md'
    Test-Tool -Name 'kube-score' -Command 'kube-score' -VersionFlag 'version'          -Guardian 'Platform Guardian'                     -Hint 'see PREREQUISITES.md'
    Test-Tool -Name 'Polaris'    -Command 'polaris'    -VersionFlag 'version'          -Guardian 'Platform Guardian'                     -Hint 'see PREREQUISITES.md'
    Test-Tool -Name 'kubeaudit'  -Command 'kubeaudit'  -VersionFlag 'version'          -Guardian 'Platform Guardian'                     -Hint 'see PREREQUISITES.md'
    Test-Tool -Name 'Helm'       -Command 'helm'       -VersionFlag 'version --short'  -Guardian 'Platform Guardian, Delivery Guardian'  -Hint 'see PREREQUISITES.md'

    Write-Section 'Delivery Guardian Tools'
    Test-Tool -Name 'k6'        -Command 'k6' -VersionFlag 'version'    -Guardian 'Delivery Guardian, QA Guardian'         -Hint 'see PREREQUISITES.md'
    Test-Tool -Name 'Azure CLI' -Command 'az' -VersionFlag '--version'  -Guardian 'Platform Guardian, Delivery Guardian'   -Hint 'see PREREQUISITES.md'

    Write-Section 'Dependency Auditors'
    Test-Tool -Name 'pip-audit'   -Command 'pip-audit'   -VersionFlag '--version' -Guardian 'Security Guardian' -Hint 'pip install pip-audit (see PREREQUISITES.md)'
    Test-Tool -Name 'Bandit'      -Command 'bandit'      -VersionFlag '--version' -Guardian 'Security Guardian' -Hint 'pip install bandit (see PREREQUISITES.md)'
    Test-Tool -Name 'Safety'      -Command 'safety'      -VersionFlag '--version' -Guardian 'Security Guardian' -Hint 'pip install safety (see PREREQUISITES.md)'
    Test-Tool -Name 'cargo-audit' -Command 'cargo-audit' -VersionFlag '--version' -Guardian 'Security Guardian' -Hint 'cargo install cargo-audit (see PREREQUISITES.md)'
    Test-Tool -Name 'cargo-deny'  -Command 'cargo-deny'  -VersionFlag '--version' -Guardian 'Security Guardian' -Hint 'cargo install cargo-deny (see PREREQUISITES.md)'

    Write-Section 'Operator Tools'
    Test-Tool -Name 'npx (Playwright MCP)' -Command 'npx' -VersionFlag '--version' -Guardian 'Operator' -Hint 'Install Node.js; then: npx @playwright/mcp@0.0.28 (see PREREQUISITES.md §7)'
}

function Doctor-CheckFiles {
    Write-Section 'Guardian Files (installed to ~/.copilot/)'

    foreach ($g in $Guardians) {
        Test-Artifact -RelativePath "agents\$g.agent.md" -Description "$g.agent.md"
    }
    foreach ($g in $Guardians) {
        Test-Artifact -RelativePath "instructions\$g.instructions.md" -Description "$g.instructions.md"
    }
    Test-Artifact -RelativePath 'instructions\sdlc-workflow.instructions.md' -Description 'sdlc-workflow.instructions.md'

    Test-Artifact -RelativePath 'agents\operator.agent.md'                -Description 'operator.agent.md'
    Test-Artifact -RelativePath 'instructions\operator.instructions.md'   -Description 'operator.instructions.md'

    foreach ($skill in @('security-guardian', 'code-review-guardian', 'platform-guardian', 'privacy-guardian')) {
        Test-Artifact -RelativePath "skills\$skill\SKILL.md" -Description "skills/$skill/"
    }

    Test-Artifact -RelativePath 'extensions\sdlc-guardian\extension.mjs'         -Description 'extensions/sdlc-guardian/extension.mjs'
    Test-Artifact -RelativePath 'extensions\sdlc-guardian\uat-state-machine.mjs' -Description 'extensions/sdlc-guardian/uat-state-machine.mjs'
    Test-Artifact -RelativePath 'extensions\craig\extension.mjs'                 -Description 'extensions/craig/extension.mjs'
    Test-Artifact -RelativePath 'extensions\craig\craig-scheduler.mjs'           -Description 'extensions/craig/craig-scheduler.mjs'
    Test-Artifact -RelativePath 'extensions\craig\craig-config.mjs'              -Description 'extensions/craig/craig-config.mjs'

    Test-Artifact -RelativePath 'templates\feature-spec.template.md'   -Description 'templates/feature-spec.template.md (Spec Kit-compatible)'
    Test-Artifact -RelativePath 'templates\feature-ticket.template.md' -Description 'templates/feature-ticket.template.md'
    Test-Artifact -RelativePath 'templates\project-audit.template.md'  -Description 'templates/project-audit.template.md'
    Test-Artifact -RelativePath 'templates\scaffold\README.template.md'        -Description 'templates/scaffold/README.template.md'
    Test-Artifact -RelativePath 'templates\scaffold\ARCHITECTURE.template.md'  -Description 'templates/scaffold/ARCHITECTURE.template.md'
    Test-Artifact -RelativePath 'templates\scaffold\ADR.template.md'           -Description 'templates/scaffold/ADR.template.md'
    Test-Artifact -RelativePath 'templates\scaffold\CONTRIBUTING.template.md'  -Description 'templates/scaffold/CONTRIBUTING.template.md'
    Test-Artifact -RelativePath 'templates\scaffold\SECURITY.template.md'      -Description 'templates/scaffold/SECURITY.template.md'

    foreach ($g in $Guardians) {
        Test-Artifact -RelativePath "instructions\$g.notes.md" -Description "$g.notes.md (side-notes)"
    }

    if ($script:DoctorFileMissing -gt 0) {
        Write-Host ''
        Write-Host '  Run ' -NoNewline -ForegroundColor DarkGray
        Write-Host '.\package.ps1 -Install' -NoNewline -ForegroundColor Cyan
        Write-Host ' to install Guardian files.' -ForegroundColor DarkGray
    }
}

function Doctor-PrintSummary {
    Write-Host ''
    Write-Host '────────────────────────────────────────'
    Write-Host ('Summary: {0}/{1} tools available. {2} optional missing. {3} core missing.' -f `
        $script:DoctorAvailable, $script:DoctorTotal, $script:DoctorOptionalMissing, $script:DoctorCoreMissing)

    if ($script:DoctorFileMissing -gt 0) {
        Write-Host ('         {0}/{1} Guardian files installed. {2} missing.' -f `
            $script:DoctorFileOk, $script:DoctorFileTotal, $script:DoctorFileMissing)
    } else {
        Write-Host ('         {0}/{1} Guardian files installed.' -f $script:DoctorFileOk, $script:DoctorFileTotal)
    }

    if ($script:DoctorCoreMissing -gt 0) {
        Write-Host ''
        Write-Host '✘ Core requirements missing.' -ForegroundColor Red
        Write-Host 'Install them before using Guardians.'
        exit 1
    } else {
        Write-Host ''
        Write-Host '✔ Core requirements met.' -ForegroundColor Green
        Write-Host 'Optional tools can be installed as needed.'
    }
}

function Invoke-Doctor {
    # Reset counters
    $script:DoctorTotal           = 0
    $script:DoctorAvailable       = 0
    $script:DoctorOptionalMissing = 0
    $script:DoctorCoreMissing     = 0
    $script:DoctorFileTotal       = 0
    $script:DoctorFileOk          = 0
    $script:DoctorFileMissing     = 0

    Write-Host ''
    Write-Info '🩺 SDLC Guardian Agents — Doctor'
    Write-Host 'Checking prerequisites...' -ForegroundColor DarkGray

    Doctor-CheckTools
    Doctor-CheckFiles
    Doctor-PrintSummary
}

# ────────────────────────────────────────────────────────────────────────────
# Dispatch
# ────────────────────────────────────────────────────────────────────────────

if ($Install) {
    Invoke-Package
    Write-Host ''
    Invoke-Install
}
elseif ($Uninstall) {
    Invoke-Uninstall
}
elseif ($Doctor) {
    Invoke-Doctor
}
else {
    Invoke-Package
}
