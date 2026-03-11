---
name: platform-guardian-tools
description: >
  Kubernetes security tool definitions. Tells the Platform Guardian agent
  which tools to check and run. Does NOT install anything.
  See PREREQUISITES.md for installation.
---

# Platform Guardian Tools

## Required Tools (must have — stop and ask user to install if missing)

| Tool | Check Command | Purpose |
|------|--------------|---------|
| kubectl | `kubectl version --client` | Kubernetes cluster access |
| kube-bench | `kube-bench version` | CIS Benchmark compliance |
| Trivy | `trivy --version` | IaC and image vulnerability scanning |

## Recommended Tools (valuable — note if missing but don't block)

| Tool | Check Command | Purpose |
|------|--------------|---------|
| kube-score | `kube-score version` | Workload best practices |
| Polaris | `polaris version` | Configuration validation |
| kubeaudit | `kubeaudit version` | Security audit |
| Helm | `helm version` | Chart management |

## Scan Commands (run in parallel)

```
# CIS Benchmark
kube-bench run --json

# Workload best practices
find . -name "*.yaml" -o -name "*.yml" | xargs kube-score score

# Configuration validation
polaris audit --audit-path . --format pretty

# Security audit
find . -name "*.yaml" -o -name "*.yml" | xargs -I{} kubeaudit all -f {}

# IaC vulnerabilities
trivy config --severity CRITICAL,HIGH .
```

