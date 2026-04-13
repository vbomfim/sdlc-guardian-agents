---
name: privacy-guardian-tools
description: >
  Privacy scanning tool definitions. Tells the Privacy Guardian agent
  which tools to check and run. Does NOT install anything.
  See PREREQUISITES.md for installation.
---

# Privacy Guardian Tools

## Required Tools (must have — stop and ask user to install if missing)

| Tool | Check Command | Purpose |
|------|--------------|---------|
| Semgrep | `semgrep --version` | SAST — PII/PHI pattern detection in code |

## Optional Tools (useful but not blocking)

| Tool | Check Command | Purpose | When Required |
|------|--------------|---------|---------------|
| Gitleaks | `gitleaks version` | Detect PII accidentally committed in git history | Any project handling PII |
| Trivy | `trivy --version` | Scan container configs for data exposure | Projects with containers |

## Scan Commands (run in this order)

### Phase 1: Semgrep privacy scan (REQUIRED)
```
semgrep scan --config=auto --severity ERROR --severity WARNING .
semgrep scan --config=p/owasp-top-ten --severity ERROR --severity WARNING .
```

### Phase 2: PII/PHI pattern detection (REQUIRED — grep-based)
```
# PII field names in logging statements
grep -rn --include='*.ts' --include='*.js' --include='*.py' --include='*.java' --include='*.cs' --include='*.go' --include='*.rb' --include='*.rs' -iE \
  '(log|logger|console|print|debug|info|warn|error|trace|fatal)\b.*\b(email|ssn|social.?security|password|credit.?card|phone.?number|date.?of.?birth|dob|address|zip.?code|passport|driver.?license|ip.?address|patient|diagnosis|prescription|medication|mrn|medical.?record|health.?plan|biometric|genetic|ethnicity|religion|sexual)' .

# Object dumping in logs (log(user), log(patient), etc.)
grep -rn --include='*.ts' --include='*.js' --include='*.py' --include='*.java' --include='*.cs' --include='*.go' --include='*.rb' --include='*.rs' -iE \
  '(log|logger|console|print|debug|info|warn|error)\b.*\b(user|patient|customer|client|member|subscriber|employee|applicant|beneficiary|claimant)\b' .

# Serialization in logs
grep -rn --include='*.ts' --include='*.js' --include='*.py' --include='*.java' --include='*.cs' --include='*.go' --include='*.rb' --include='*.rs' -iE \
  '(log|logger|console|print)\b.*(stringify|to_json|to_string|toString|repr|serialize|dump|inspect|pprint)' .

# SSN patterns in code
grep -rn --include='*.ts' --include='*.js' --include='*.py' --include='*.java' --include='*.cs' --include='*.go' --include='*.rb' --include='*.rs' --include='*.json' --include='*.yaml' --include='*.yml' -E \
  '[0-9]{3}-[0-9]{2}-[0-9]{4}' .
```

### Phase 3: Healthcare data detection (CONDITIONAL — run if any PHI indicators found)
```
# FHIR/HL7 references
grep -rn --include='*.ts' --include='*.js' --include='*.py' --include='*.java' --include='*.cs' --include='*.go' --include='*.rb' --include='*.rs' -iE \
  '(fhir|hl7|dicom|icd.?10|cpt.?code|snomed|loinc|ndc.?code)' .

# PHI model/schema fields
grep -rn --include='*.ts' --include='*.js' --include='*.py' --include='*.java' --include='*.cs' --include='*.go' --include='*.rb' --include='*.rs' -iE \
  '(diagnosis|prognosis|prescription|medication|treatment|clinical|medical.?record|patient.?id|provider.?id|health.?plan|insurance.?id|claim.?number)' .
```
