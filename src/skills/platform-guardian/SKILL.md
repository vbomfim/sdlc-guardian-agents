---
name: platform-guardian
description: >
  Platform Guardian skill for installing Kubernetes security scanning tools.
  Use this skill ONLY when the user asks to install kube-bench, kube-score,
  polaris, kubeaudit, or other K8s audit tools. Do NOT use for running
  audits — those MUST go through the Platform Guardian agent.
---

# Platform Guardian Skill

Handles K8s security tool **installation** only. For audits, the Platform Guardian agent is used.

## Commands

### Install tools
```bash
bash ~/.copilot/skills/platform-guardian/setup.sh
```

### Check installed tools
```bash
bash ~/.copilot/skills/platform-guardian/setup.sh --check
```

### Run scan pipeline
```bash
bash ~/.copilot/skills/platform-guardian/setup.sh --scan
```
