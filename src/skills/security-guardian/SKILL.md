---
name: security-guardian
description: >
  Security Guardian skill for setting up, running, and validating security tools
  across projects. Use this skill when the user asks to set up security tools,
  run a security scan, check security tool status, install git hooks for security
  enforcement, or adopt the Security Guardian agent in a repository. Automates
  the full security tooling lifecycle.
---

# Security Guardian Skill

Automates security tool setup, scanning, and enforcement for any project.
This is the operational companion to the Security Guardian agent — the agent
provides security guidance, this skill installs and runs the tools that enforce it.

## When to Use

- User says "set up security tools", "install security", or "add security scanning"
- User says "run a security scan", "check for vulnerabilities", or "audit dependencies"
- User says "check security status", "what security tools do I have?"
- User says "install security hooks" or "enforce security on push"
- User says "adopt security guardian" or "add security guardian to this project"
- User asks about security tool status or wants to fix security scan failures

## File Layout

Everything lives under `~/.copilot/`:

```
~/.copilot/
├── copilot-instructions.md                          ← Global security baseline (all projects)
└── skills/security-guardian/
    ├── SKILL.md                                     ← This file (skill definition)
    ├── setup.sh                                     ← Install tools + run scans
    ├── install-hooks.sh                             ← Install git pre-push hook
    ├── hooks/pre-push                               ← The hook script
    └── template/                                    ← Files to copy into repos
        ├── README.md                                ← Usage guide
        └── .github/
            ├── agents/security-guardian.agent.md     ← The Security Guardian agent
            ├── instructions/security-standard.instructions.md  ← Auto-applied rules
            └── workflows/security-scan.yml           ← CI/CD enforcement
```

## Commands

### 1. Setup — Install security tools

Auto-detects project languages and installs the appropriate tools:

```bash
bash ~/.copilot/skills/security-guardian/setup.sh
```

Options:
```bash
bash ~/.copilot/skills/security-guardian/setup.sh --all    # All languages
bash ~/.copilot/skills/security-guardian/setup.sh --ci     # CI-only tools
```

After running, tell the user what was installed and which OWASP rules each tool enforces.

### 2. Scan — Run security analysis

```bash
bash ~/.copilot/skills/security-guardian/setup.sh --scan
```

Runs Semgrep (SAST), Gitleaks (secrets), and language-specific audits.
On success, records `.security-scan-timestamp` for the pre-push hook.

If findings exist, explain each one with its OWASP category and provide a fix.

### 3. Check — View tool status

```bash
bash ~/.copilot/skills/security-guardian/setup.sh --check
```

### 4. Install Hooks — Enable git enforcement

```bash
bash ~/.copilot/skills/security-guardian/install-hooks.sh
```

Installs pre-push hook: warns on feature branches, blocks pushes to main
if scan hasn't run since last commit.

### 5. Adopt — Add Security Guardian to a repo

Copies the agent, instructions, workflow, and tools into the current repo:

```bash
SKILL_DIR="$HOME/.copilot/skills/security-guardian"

# Copy agent, instructions, and CI workflow
mkdir -p .github/agents .github/instructions .github/workflows tools/hooks
cp "$SKILL_DIR/template/.github/agents/security-guardian.agent.md" .github/agents/
cp "$SKILL_DIR/template/.github/instructions/security-standard.instructions.md" .github/instructions/
cp "$SKILL_DIR/template/.github/workflows/security-scan.yml" .github/workflows/
cp "$SKILL_DIR/setup.sh" tools/setup.sh
cp "$SKILL_DIR/install-hooks.sh" tools/install-hooks.sh
cp "$SKILL_DIR/hooks/pre-push" tools/hooks/pre-push
chmod +x tools/setup.sh tools/install-hooks.sh tools/hooks/pre-push

# Install hooks, tools, and run first scan
bash tools/install-hooks.sh
bash tools/setup.sh
bash tools/setup.sh --scan
```

Walk the user through each step and explain what's being added.

## Workflow: Full Adoption

When a user asks to "set up security" or "adopt security guardian":

1. **Adopt** — Copy files into the repo
2. **Setup** — Install the security tools
3. **Hooks** — Install git hooks
4. **Scan** — Run the first scan
5. **Verify** — Run `--check` to confirm everything is in place

After completion, remind the user:
- Use `/agent` → Security Guardian for design reviews, code reviews, and implementation
- The CI workflow enforces scans on every PR
- The pre-push hook warns/blocks if scans are stale

## Troubleshooting

If a tool fails to install:
- Check if the package manager is available (npm, pip3, cargo, brew)
- Suggest alternative install methods
- The setup script is idempotent — safe to re-run

If a scan finds issues:
- Explain what each finding means with its `[OWASP-A0X]` tag
- Provide actionable fixes, not just descriptions
