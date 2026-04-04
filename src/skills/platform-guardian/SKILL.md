---
name: platform-guardian-tools
description: >
  Kubernetes security tool definitions. Tells the Platform Guardian agent
  which tools to check and run. Does NOT install anything.
  See PREREQUISITES.md for installation.
---

# Platform Guardian Tools

## Tool Inventory

Check each tool's availability and relevance before scanning. Report status in the Tools Report.

### Core Kubernetes Tools

| Tool | Check Command | Purpose |
|------|--------------|---------|
| kubectl | `kubectl version --client` | Kubernetes cluster access and manifest inspection |
| kube-bench | `kube-bench version` | CIS Benchmark compliance scanning |
| Trivy | `trivy --version` | IaC and container image vulnerability scanning |

### Additional Audit Tools

| Tool | Check Command | Purpose |
|------|--------------|---------|
| kube-score | `kube-score version` | Workload best practices validation |
| Polaris | `polaris version` | Configuration validation against policies |
| kubeaudit | `kubeaudit version` | Security audit of K8s resources |
| Helm | `helm version` | Chart management and template inspection |

## Scan Commands (run in parallel, when available)

```
# CIS Benchmark (requires live cluster context)
kube-bench run --json

# Workload best practices (static manifests)
find . -name "*.yaml" -o -name "*.yml" | xargs kube-score score

# Configuration validation (static manifests)
polaris audit --audit-path . --format pretty

# Security audit (static manifests)
find . -name "*.yaml" -o -name "*.yml" | xargs -I{} kubeaudit all -f {}

# IaC vulnerabilities
trivy config --severity CRITICAL,HIGH .
```

