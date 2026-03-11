---
name: platform-guardian-tools
description: >
  Runs Kubernetes security scanning tools and checks availability.
  Use when the Platform Guardian agent needs to audit cluster configuration.
  Does NOT install anything — see PREREQUISITES.md for installation.
---

# Platform Guardian Tools

Runs K8s audit tools. Does **not** install anything.
See [PREREQUISITES.md](../../PREREQUISITES.md) for tool installation.

## Commands

### Check which tools are available
```bash
bash ~/.copilot/skills/platform-guardian/run.sh --check
```

### Run K8s security scan pipeline
```bash
bash ~/.copilot/skills/platform-guardian/run.sh --scan
```
