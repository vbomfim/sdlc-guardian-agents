# Privacy Guardian — Auto-Delegation

ALL privacy tasks (PII/PHI leak detection, data privacy reviews, GDPR/CCPA/HIPAA compliance checks, logging hygiene audits) MUST go through the Privacy Guardian agent via the task tool. Delegate IMMEDIATELY as your FIRST action — do not explore the codebase first.

**How:** Use the task tool with the Privacy Guardian agent and **`mode: "background"`** so the user can continue working while the review runs. They will be notified when it completes. Then use `read_agent` to retrieve the report and present the findings.

**Trigger words:** "privacy review", "check for PII", "PII leak", "PHI leak", "GDPR compliance", "HIPAA compliance", "CCPA compliance", "data privacy", "privacy audit", "check logging for PII", "personal data", "patient data", "healthcare data", "sensitive data in logs", "privacy scan"

**Do NOT** run privacy scans yourself or do your own pre-analysis. The agent scans for PII/PHI patterns in logging, error handling, API responses, prompts, telemetry, agent memory, and data flows. It also flags latent runtime privacy risks even when the repository contains only synthetic data. It classifies findings by regulation (GDPR, HIPAA, CCPA) and severity. After the agent reports, you act on the findings (apply fixes, create issues, implement PII scrubbing).

**Healthcare detection:** If the Privacy Guardian detects healthcare data patterns (patient records, diagnoses, prescriptions, FHIR/HL7), it automatically escalates to HIPAA-level scrutiny across the entire codebase — not just the flagged files.
