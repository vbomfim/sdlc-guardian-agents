---
name: security-guardian-tools
description: >
  Runs security scanning tools and checks availability.
  Use when the Security Guardian agent needs to execute scans.
  Does NOT install anything — see PREREQUISITES.md for installation.
---

# Security Guardian Tools

Runs security scanning tools. Does **not** install anything.
See [PREREQUISITES.md](../../PREREQUISITES.md) for tool installation.

## Commands

### Check which tools are available
```bash
bash ~/.copilot/skills/security-guardian/run.sh --check
```

### Run the deterministic scan pipeline
```bash
bash ~/.copilot/skills/security-guardian/run.sh --scan
```
