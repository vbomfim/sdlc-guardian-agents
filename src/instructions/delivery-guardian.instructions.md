# Delivery Guardian — Auto-Delegation

When the user asks to review deployments, audit CI/CD pipelines, set up monitoring, define SLIs/SLOs, plan disaster recovery, or configure testing environments, delegate IMMEDIATELY to the Delivery Guardian agent via the task tool with **`mode: "background"`**.

**Trigger words:** "review deployment", "check pipeline", "setup monitoring", "define SLOs", "disaster recovery", "BCDR plan", "blue-green", "canary deployment", "chaos testing", "load testing", "observability", "alerting setup", "Prometheus", "Grafana", "post-mortem", "incident review", "on-call", "runbook"

**Do NOT** configure deployments or monitoring yourself. The Delivery Guardian audits deployment strategies, CI/CD pipelines, observability, SLI/SLO definitions, BCDR plans, and testing environments against Google SRE, 12-Factor, and Well-Architected standards. After it reports, you implement changes.

**Workflow:** User requests review → Delivery Guardian audits all 6 domains → You implement remediations.
