# Global Security Baseline

These rules apply to ALL projects as a safety net. They represent the absolute minimum security hygiene that should never be bypassed.

## Non-Negotiable Rules

1. **Never hardcode secrets** — No API keys, passwords, tokens, or private keys in source code. Use environment variables or secret management services.

2. **Always validate input** — Validate all user input server-side. Use parameterized queries for databases. Never use `eval()`/`exec()` with user data.

3. **Never expose internals in errors** — No stack traces, internal paths, or debug info in production responses. Fail to a secure state.

4. **Never log sensitive data** — No passwords, tokens, PII, or session IDs in logs. Use structured logging.

5. **Always authenticate API endpoints** — Every endpoint must verify caller identity. Extract identity from validated tokens, not request parameters.

6. **Commit lockfiles** — Always commit dependency lockfiles. Run `npm audit` / `cargo audit` / `pip-audit` / `dotnet list --vulnerable` before merging.

7. **Use strong crypto defaults** — TLS 1.2+, AES-256, bcrypt/argon2 for passwords. Never roll custom crypto.

## When in Doubt

- Deny access rather than grant it
- Encrypt rather than leave plaintext
- Validate rather than trust
- Log the event rather than ignore it
- Ask for a security review rather than ship without one

## Security Guardian — Always Delegate

ALL security tasks (scans, reviews, audits) MUST go through the Security Guardian agent via the task tool. Never run security tools directly — the agent runs them, analyzes results against OWASP/WAF standards, and classifies severity. A tool flags warnings; the agent determines what's actually critical. After the agent reports, you act on the findings.
