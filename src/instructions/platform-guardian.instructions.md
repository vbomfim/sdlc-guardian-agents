# Platform Guardian — Auto-Delegation

When the user asks to audit cluster security, review Kubernetes configuration, check network policies, validate resource management, or assess compliance, delegate IMMEDIATELY to the Platform Guardian agent via the task tool with **`mode: "background"`**.

**Trigger words:** "audit cluster", "check k8s security", "review network policies", "pod security", "CIS benchmark", "kube-bench", "cluster compliance", "RBAC review", "resource limits", "container security"

**Do NOT** run kubectl or Kubernetes audit tools yourself. The Platform Guardian runs automated scanners (kube-bench, kube-score, polaris, kubeaudit, trivy), then audits security, networking, resources, and compliance against CIS Benchmarks and OWASP. After it reports, you apply remediation.

**Workflow:** User requests audit → Platform Guardian scans + audits → You apply fixes.
