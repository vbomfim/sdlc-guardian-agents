---
name: code-review-guardian-tools
description: >
  Runs code quality linters and checks availability.
  Use when the Code Review Guardian agent needs to execute linters.
  Does NOT install anything — see PREREQUISITES.md for installation.
---

# Code Review Guardian Tools

Runs linters. Does **not** install anything.
See [PREREQUISITES.md](../../PREREQUISITES.md) for tool installation.

## Commands

### Check which linters are available
```bash
bash ~/.copilot/skills/code-review-guardian/run.sh --check
```

### Run linters
```bash
bash ~/.copilot/skills/code-review-guardian/run.sh --scan
```
