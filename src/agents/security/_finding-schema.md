# Standard Finding Schema (Security Guardian internal contract)

> **Audience:** sub-Guardian authors and the Security Guardian coordinator. NOT exposed to the orchestrator or end users — the coordinator translates findings into the user-visible markdown report.
>
> **Status:** v1 — established with the Security Guardian split (issue #82). Breaking changes require a coordinated update to all 5 sub-Guardians.
>
> **Spec reference:** FR-006, FR-007, FR-008, FR-009, FR-010 in `specs/security-guardian-split/spec.md`.

## Why a schema?

Every sub-Guardian must speak the same dialect so the coordinator can mechanically deduplicate, reconcile severity, and tag cross-domain findings. Free-form markdown reports from each sub would force the coordinator to do natural-language reconciliation — error-prone and slow. A structured schema makes merge logic deterministic.

## The schema

Every finding emitted by a sub-Guardian MUST conform to the following YAML structure. Sub-Guardians produce a list of findings under a `findings:` key in their handoff to the coordinator.

```yaml
findings:
  - sub_guardian: appsec | supply-chain | secrets | threat-model | iac
    severity: critical | high | medium | low | info
    title: string
    cwe_id: CWE-XXX            # optional — include when applicable
    owasp_category: A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10
                                # optional — include when applicable
    file_path: path/to/file.ext
    line_range: [start, end]   # 1-based, inclusive. [42, 42] for single-line.
    rule_id: tool-rule-id      # optional — populate when finding came from an
                                # automated tool (e.g., 'semgrep.javascript.lang.security.audit.no-eval')
    description: |
      Multi-line context for the user. Why is this a problem?
      What is the impact? Quote 1-3 lines of the offending code if helpful.
    remediation: |
      What to do about it. Concrete code change or pattern to apply.
      Reference the relevant standard inline (e.g., "OWASP A05:2025 — use parameterized queries").
    references:                # optional
      - https://owasp.org/Top10/2025/A05_2025-Injection/
      - https://cwe.mitre.org/data/definitions/89.html
    cross_domain: false        # set true ONLY when the sub-Guardian believes
                                # this finding genuinely spans 2+ domains (the
                                # coordinator makes the final call)
    cross_domain_handoff: []   # optional — list of sub names this should be
                                # routed to next iteration (e.g., ['secrets']
                                # if AppSec spotted a hardcoded secret)
```

## Field reference

### `sub_guardian` (required)

The emitting sub-Guardian's identifier. One of `appsec | supply-chain | secrets | threat-model | iac`. Used by the coordinator to attribute findings and apply per-sub statistics. NEVER appears in the user-visible report unless the finding is cross-domain.

### `severity` (required)

One of: `critical | high | medium | low | info`. Mapped to symbols by the coordinator at render time:

| Severity | Symbol | Re-iteration policy (per `sdlc-workflow.instructions.md`) |
|---|---|---|
| `critical` | 🔴 | Must fix |
| `high` | 🟠 | Should fix; one re-iteration then consult |
| `medium` | 🟡 | Create ticket; do not block |
| `low` | 🔵 | Note in report; never re-iterate |
| `info` | ℹ️ | Note in report; never re-iterate |

Sub-Guardians MUST NOT use other severity strings. The coordinator rejects unknown severities (treated as a sub failure under FR-016).

### `title` (required)

Short human-readable summary, ≤80 characters. Becomes the finding row title in the unified report.

### `cwe_id` (optional but strongly recommended)

CWE identifier in the format `CWE-XXX` (no leading zeros). Used as a dedup key (FR-007). When two findings target the same `(file, overlapping line_range, cwe_id)`, the coordinator treats them as duplicates.

When CWE isn't applicable (e.g., a threat-model design concern), populate `category` via the `owasp_category` field or omit and let the coordinator dedup by `category` derived from `sub_guardian` (e.g., `secrets`).

### `owasp_category` (optional)

One of `A01` through `A10`, mapping to OWASP Top 10 2025. Used in the user-visible report and for OWASP coverage tracking (SC-005).

### `file_path` (required)

Absolute or repo-relative path to the affected file. The coordinator normalizes to repo-relative for the unified report.

### `line_range` (required)

A 2-element array `[start, end]` with 1-based, inclusive line numbers. Use `[N, N]` for single-line findings. Used as a dedup key — overlapping ranges across two findings count as the same location.

For findings without a clear line (e.g., a missing file, a project-wide concern), use `[0, 0]` and put context in `description`. The coordinator treats `[0, 0]` as "file-scoped, no specific line."

### `rule_id` (optional)

The triggering tool's rule identifier when the finding came from an automated scanner (e.g., `semgrep.python.lang.security.audit.exec-detected`, `gitleaks.aws-access-key-id`). Helps users investigate the rule and tune false positives.

### `description` (required)

Multi-line free text. Explains WHY the issue matters and quotes the offending code if it adds clarity. Required because every finding must be self-explanatory per the monolith's existing handoff convention.

### `remediation` (required)

Multi-line free text. WHAT to do — concrete code change, configuration to add, pattern to follow. Reference the relevant standard inline.

### `references` (optional)

List of URLs to standards, CVEs, or documentation supporting the finding.

### `cross_domain` (default `false`)

Set to `true` ONLY when the sub-Guardian believes the finding genuinely spans 2+ security domains AND the OTHER domain is likely to flag the same finding from a different angle (e.g., a leaked secret in a Terraform file is BOTH Secrets and IaC). The coordinator independently verifies cross-domain status during merge — a sub setting `cross_domain: true` is a hint, not a guarantee.

### `cross_domain_handoff` (optional, default `[]`)

When a sub-Guardian spots something outside its primary scope (e.g., sub-AppSec notices a hardcoded API key during code review), it MUST still emit the finding — with this field populated to indicate which other sub(s) should pick it up on the next iteration. This prevents findings from falling through gaps when scope boundaries are imprecise.

Example: sub-AppSec finds a hardcoded AWS key while reviewing `src/config.ts`:

```yaml
- sub_guardian: appsec
  severity: critical
  title: Hardcoded AWS access key
  cwe_id: CWE-798
  cross_domain_handoff: [secrets]
  ...
```

## Coordinator merge rules (informational — implemented in coordinator)

The coordinator's merge step uses the following deterministic logic:

1. **Collect** all findings from all subs that completed.
2. **Dedup key** = `(file_path, overlapping line_range, cwe_id || sub_guardian-as-category)`.
3. **Two findings with the same dedup key but the SAME `sub_guardian`** = duplicate (one sub emitted twice — keep the higher-severity instance).
4. **Two findings with the same dedup key but DIFFERENT `sub_guardian`** AND same `cwe_id` = duplicate (merge — same vuln found by two scanners; concatenate `description` and `remediation`, take highest severity).
5. **Two findings with the same `(file_path, overlapping line_range)` but different categories** = cross-domain (preserve both, tag the merged record `[CROSS-DOMAIN: <subs>]`).
6. **Severity reconciliation** (FR-008): highest severity wins. (`critical` > `high` > `medium` > `low` > `info`.)
7. **Ensemble bump** (FR-009): if 2+ sub-Guardians independently flag the same finding (per dedup key) at `high` or above, bump severity by one level. `high` × 2 → `critical`.

## Versioning

This schema is v1. Backward-incompatible changes require:
1. A spec amendment with rationale
2. Coordinated updates to all 5 sub-Guardian agent files
3. The schema's `version:` field added when v2 lands (omit for v1)

Additive changes (new optional fields) do not require a version bump.

## Examples

### Simple AppSec finding (no cross-domain)

```yaml
findings:
  - sub_guardian: appsec
    severity: critical
    title: SQL injection via f-string
    cwe_id: CWE-89
    owasp_category: A03
    file_path: src/db.py
    line_range: [42, 42]
    rule_id: bandit.B608
    description: |
      Line 42 builds a SQL query by f-string interpolation of `user_id`
      coming from request input. Allows arbitrary SQL execution.
    remediation: |
      Use parameterized queries. Replace the f-string with:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
      Per OWASP A03:2025 Injection.
    references:
      - https://owasp.org/Top10/2025/A03_2025-Injection/
      - https://cwe.mitre.org/data/definitions/89.html
```

### Cross-domain (Secrets + IaC)

Both subs emit independently. The coordinator merges into one cross-domain record.

```yaml
# From sub-Secrets:
- sub_guardian: secrets
  severity: critical
  title: AWS access key in Terraform
  file_path: infra/main.tf
  line_range: [18, 18]
  rule_id: gitleaks.aws-access-key-id
  description: |
    Hardcoded AKIA... key in module variable default.
  remediation: |
    Move to a secret manager (AWS Secrets Manager, Azure Key Vault).
    Rotate the exposed key immediately. Scan git history for prior commits.
  cross_domain: true

# From sub-IaC:
- sub_guardian: iac
  severity: high
  title: Embedded credential in Terraform variable
  file_path: infra/main.tf
  line_range: [18, 18]
  rule_id: checkov.CKV_SECRET_2
  description: |
    Terraform variable contains an AWS-shaped credential. Anyone with read
    access to the IaC repo can extract it.
  remediation: |
    Use a `data` block backed by a secret manager, or Terraform Cloud /
    Vault provider for credential retrieval.
  cross_domain: true
```

After coordinator merge: ONE finding tagged `[CROSS-DOMAIN: secrets+iac]`, severity `critical` (highest wins; ensemble bump does NOT apply because IaC was `high` and Secrets was `critical` — bump only triggers when 2+ are at the SAME `high` level).

### Handoff (sub-AppSec spots a secret)

```yaml
findings:
  - sub_guardian: appsec
    severity: critical
    title: Hardcoded API key in source
    cwe_id: CWE-798
    file_path: src/api/client.ts
    line_range: [12, 12]
    description: |
      Found a hardcoded API key. While this surfaced during AppSec review,
      it falls in sub-Secrets' primary domain.
    remediation: |
      Route to sub-Secrets for full handling. Move to env var or secret manager.
    cross_domain_handoff: [secrets]
```

The coordinator records this finding immediately (no need to wait) and ALSO notes for the next iteration that sub-Secrets should re-scan with this hint.
