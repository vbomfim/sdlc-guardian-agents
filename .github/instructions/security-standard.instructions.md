---
applyTo: "**/*.{ts,tsx,js,jsx,mjs,cjs,cs,rs,py,java,go,rb,php,swift,kt,scala}"
---

# Security Standard — Auto-Applied Rules

These rules apply automatically to all code files. They are the always-on guardrails that complement the Security Guardian agent.

## Proactive Security Requirement

Before implementing any feature that involves authentication, user data, API endpoints, file handling, or external services: **stop and ask the user security-clarifying questions** about the aspects they didn't mention. Do not assume the user has considered authentication, authorization, input validation, encryption, error handling, or data isolation. Use secure defaults for anything the user cannot answer, and state what you chose.

## Critical Rules (MUST follow — violations are blockers)

### Never Hardcode Secrets `[OWASP-A04]` `[AZURE-WAF]` `[AWS-WAF]`
- NO API keys, passwords, tokens, connection strings, or private keys in source code
- Load secrets from environment variables or a secret management service (Azure Key Vault, AWS Secrets Manager, GCP Secret Manager)
- Ensure `.gitignore` covers files that may contain secrets (`.env`, `*.pem`, `*.key`)

### Always Validate Input `[OWASP-A05]`
- Validate ALL user input server-side (type, length, range, format)
- Use parameterized queries or prepared statements for database operations — NEVER concatenate user input into queries
- Encode output for the correct context (HTML, URL, JavaScript, SQL)
- Never use `eval()`, `exec()`, or equivalent with user-controlled data

### Always Authenticate and Authorize `[OWASP-A01]` `[OWASP-A07]`
- Every API endpoint MUST verify the caller's identity
- Extract user identity from validated tokens (JWT `sub` claim), NEVER from request parameters
- Apply least privilege: deny by default, explicitly grant permissions
- Verify authorization for EVERY resource access, not just at the API gateway

### Handle Errors Securely `[OWASP-A10]`
- NEVER expose stack traces, internal paths, or debug information in client-facing responses
- On error, fail to a secure state (deny access rather than grant)
- Log errors with correlation IDs for debugging, but keep sensitive data out of logs

### Protect Sensitive Data in Logs `[OWASP-A09]`
- NEVER log passwords, tokens, API keys, PII, session IDs, or credit card numbers
- Use structured logging with severity levels
- Ensure logs are stored securely and cannot be tampered with

## Important Rules (SHOULD follow — exceptions require justification)

### Secure Dependencies `[OWASP-A03]` `[GCP-AF]`
- Commit lockfiles (package-lock.json, Cargo.lock, poetry.lock, etc.)
- Pin dependency versions to exact or narrow ranges
- Run dependency audits regularly (`npm audit`, `cargo audit`, `pip-audit`, `dotnet list --vulnerable`)
- Prefer well-maintained libraries with active security response

### Use Strong Cryptography `[OWASP-A04]`
- Use proven crypto libraries, never implement custom cryptographic algorithms
- Enforce TLS 1.2+ (prefer 1.3) for all network communication
- Use AES-256 for symmetric encryption, RSA-2048+ or ECDSA for asymmetric
- Use cryptographically secure random number generators (CSPRNG)
- Hash passwords with bcrypt, argon2, or scrypt — never MD5 or plain SHA

### Apply Security Headers `[OWASP-A02]`
- Set `Strict-Transport-Security` (HSTS)
- Set `Content-Security-Policy` (CSP)
- Set `X-Content-Type-Options: nosniff`
- Set `X-Frame-Options: DENY` (or use CSP frame-ancestors)
- Set `Referrer-Policy: strict-origin-when-cross-origin`
- Do NOT use wildcard (`*`) CORS in production

### Rate Limit Public Endpoints `[OWASP-A07]` `[AWS-WAF]`
- Apply rate limiting to authentication endpoints
- Apply rate limiting to any public-facing API
- Implement account lockout with exponential backoff for failed auth attempts

## Awareness Rules (CONSIDER — good practices for defense in depth)

### Isolation & Multi-Tenancy `[OWASP-A01]` `[AZURE-WAF]`
- Isolate tenant data at the storage layer when possible
- Derive data access paths from validated identity, not client-provided params
- Verify that API responses never include data belonging to other users/tenants

### Infrastructure as Code `[AZURE-WAF]` `[AWS-WAF]` `[GCP-AF]`
- Define infrastructure in version-controlled templates
- Avoid manual configuration changes in production
- Ensure IaC templates do not contain hardcoded secrets

### Supply Chain Integrity `[OWASP-A08]` `[GCP-AF]`
- Sign releases and deployment artifacts
- Protect CI/CD pipelines (require reviews, use protected branches)
- Verify container image provenance before deployment
