/**
 * Test fixtures — sample Guardian agent handoff reports.
 *
 * These fixtures are based on the actual report formats defined in the
 * Guardian agent definition files (*.agent.md).
 */

// ---------------------------------------------------------------------------
// Security Guardian Report
// ---------------------------------------------------------------------------

export const SECURITY_REPORT = `## Security Guardian Report

### Summary
Reviewed the authentication module. Found 3 vulnerabilities including a critical SQL injection.

### Findings (3 total: 1 critical, 1 high, 1 medium)

| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|----------|-----------|-------|------------------------|---------------|
| 1 | 🔴 CRITICAL | [OWASP-A05] | src/db.py:42 | SQL injection via f-string | OWASP A05:2025 Injection — user input concatenated into query allows arbitrary SQL execution | Use parameterized query |
| 2 | 🟠 HIGH | [OWASP-A04] | config.py:8 | Hardcoded API key | OWASP A04:2025 Cryptographic Failures — secrets in source are exposed in version history | Move to env var or secret manager |
| 3 | 🟡 MEDIUM | [OWASP-A03] [GCP-AF] | CMakeLists.txt:15 | FetchContent pinned to tag, not SHA | OWASP A03:2025 Supply Chain + SLSA Level 3 — tags are mutable, attacker can retag a compromised commit | Pin to full commit SHA |

### Recommended Actions
- [ ] **Create issues** for findings #1, #2 (critical/high)
- [ ] **Install scanning tools** — Semgrep, Gitleaks, Trivy not configured
- [ ] **Add CI workflow** — security-scan.yml from Security Guardian template
- [ ] **Fix code** — suggested fixes above for each finding

### For the Default Agent
The findings above are ready for action. You can:
1. Create GitHub issues for each finding (include the Source & Justification as context)
2. Apply the suggested fixes directly
3. Re-run scans to verify fixes
`;

// ---------------------------------------------------------------------------
// Code Review Guardian Report
// ---------------------------------------------------------------------------

export const CODE_REVIEW_REPORT = `## Code Review Guardian Report

### Summary
Reviewed API module. Found design issues and missing test coverage.

### Metrics
- Linter issues: 12 errors, 34 warnings
- Estimated complexity: high
- Test coverage gaps: error paths in /upload endpoint

### Findings (4 total: 0 critical, 1 high, 2 medium, 1 low)

| # | Severity | Domain | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|--------|-----------|-------|------------------------|---------------|
| 1 | 🟠 HIGH | Design | src/api.ts:120 | God class — 15 methods, 800 lines | [SOLID] SRP violation — class has multiple reasons to change | Extract into AuthService, UserService, NotificationService |
| 2 | 🟡 MEDIUM | Quality | utils.py:45 | Function has cyclomatic complexity 18 | [GOOGLE-ENG] Keep functions simple, complexity > 10 is hard to test | Extract conditions into named helper functions |
| 3 | 🟡 MEDIUM | Testing | tests/test_api.py | No tests for error paths in /upload endpoint | [GOOGLE-ENG] All code must have correct, comprehensive tests | Add tests for invalid file type, oversized file, auth failure |
| 4 | 🔵 LOW | Naming | models.rs:22 | Variable \`d\` — unclear purpose | [CLEAN-CODE] Names should reveal intent | Rename to \`duration_seconds\` |

### Recommended Actions
- [ ] **Refactor** finding #1 (break up god class)
- [ ] **Add tests** for finding #3 (error path coverage)
- [ ] **Fix linter issues** — 12 auto-fixable with \`eslint --fix\`
- [ ] **Update docs** for API module

### For the Default Agent
1. Apply auto-fixable linter issues
2. Create GitHub issues for findings requiring design changes
3. Generate missing tests for flagged coverage gaps
`;

// ---------------------------------------------------------------------------
// QA Guardian Report
// ---------------------------------------------------------------------------

export const QA_REPORT = `## QA Guardian — Test Report

### Summary
Tested upload feature. 20 tests written, 3 coverage gaps identified.

### Tests Written
| Type | Count | File | Traces To |
|------|-------|------|-----------|
| Integration | 5 | tests/integration/test_upload.py | [AC-1], [AC-2] |
| E2E | 3 | tests/e2e/test_user_flow.py | [AC-1], [AC-3] |
| Contract | 4 | tests/contract/test_api.py | [CONTRACT] |
| Edge case | 6 | tests/edge/test_boundaries.py | [EDGE] |
| Performance | 2 | tests/perf/test_load.py | [PERF] |

### Findings (2 total: 0 critical, 1 high, 1 medium)

| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|----------|-----------|-------|------------------------|---------------|
| 1 | 🟠 HIGH | Testing | tests/integration/test_upload.py:30 | Missing error path test for large files | [GOOGLE-ENG] Comprehensive tests — error paths must be tested | Add test for files > 10MB |
| 2 | 🟡 MEDIUM | Testing | tests/e2e/test_user_flow.py:15 | No test for expired session | [OWASP-A07] Session timeout must be validated | Add E2E test for expired JWT redirect |

### Coverage Gaps Found
| Gap | Risk | Status |
|-----|------|--------|
| No test for concurrent upload | 🟠 HIGH | ✅ Added test |
| No test for expired JWT | 🟡 MEDIUM | ✅ Added test |
| No load test for /search | 🔵 LOW | ⚠️ Noted for later |

### Recommended Actions
- [ ] **Run full test suite** to validate new tests
- [ ] **Add load test** for /search endpoint
- [ ] **Configure CI** to run E2E tests on merge

### For the Default Agent
1. Run the test suite to verify new tests pass
2. Create an issue for the remaining coverage gap
`;

// ---------------------------------------------------------------------------
// Edge case: Report with no findings
// ---------------------------------------------------------------------------

export const EMPTY_FINDINGS_REPORT = `## Security Guardian Report

### Summary
Reviewed the codebase. No security issues found.

### Findings (0 total)

No findings.

### Recommended Actions
- [ ] **Continue** with current security practices

### For the Default Agent
No action required.
`;

// ---------------------------------------------------------------------------
// Edge case: Report with INFO severity
// ---------------------------------------------------------------------------

export const INFO_SEVERITY_REPORT = `## Code Review Guardian Report

### Summary
Minor observations found during review.

### Findings (1 total: 0 critical, 0 high, 0 medium, 0 low, 1 info)

| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|----------|-----------|-------|------------------------|---------------|
| 1 | ℹ️ INFO | Documentation | README.md:1 | README could include architecture diagram | [GOOGLE-ENG] Documentation should help new contributors onboard | Add architecture section with Mermaid diagram |

### Recommended Actions
- [ ] **Update README** with architecture diagram
`;

// ---------------------------------------------------------------------------
// Edge case: Report with missing columns in findings table
// ---------------------------------------------------------------------------

export const MISSING_COLUMNS_REPORT = `## Security Guardian Report

### Summary
Partial review completed.

### Findings (1 total: 1 high)

| # | Severity | Issue |
|---|----------|-------|
| 1 | 🟠 HIGH | Possible XSS vulnerability |

### Recommended Actions
- [ ] **Investigate** XSS vector
`;

// ---------------------------------------------------------------------------
// Edge case: Malformed / unexpected format
// ---------------------------------------------------------------------------

export const MALFORMED_REPORT = `This is not a Guardian report at all.
Just some random text that someone might pass in.
No tables, no headers, no structure.
`;

// ---------------------------------------------------------------------------
// Edge case: Multiple findings tables
// ---------------------------------------------------------------------------

export const MULTIPLE_TABLES_REPORT = `## Security Guardian Report

### Summary
Found issues in two separate scans.

### Findings (2 total: 1 critical, 1 high)

| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|----------|-----------|-------|------------------------|---------------|
| 1 | 🔴 CRITICAL | [OWASP-A01] | src/auth.ts:10 | Broken access control | OWASP A01 — missing auth check | Add authorization middleware |

### Additional Findings

| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|----------|-----------|-------|------------------------|---------------|
| 2 | 🟠 HIGH | [OWASP-A09] | deps/package.json:5 | Known vulnerable dependency | OWASP A09 — using lodash 4.17.15 with prototype pollution | Upgrade to lodash >= 4.17.21 |

### Recommended Actions
- [ ] **Fix auth** in finding #1
- [ ] **Upgrade lodash** in finding #2
`;

// ---------------------------------------------------------------------------
// Edge case: Unicode and special characters in findings
// ---------------------------------------------------------------------------

export const UNICODE_REPORT = `## Security Guardian Report

### Summary
Reviewed the internationalization module — found encoding issues.

### Findings (1 total: 0 critical, 0 high, 1 medium)

| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|----------|-----------|-------|------------------------|---------------|
| 1 | 🟡 MEDIUM | [OWASP-A03] | src/i18n/日本語.ts:42 | Unsanitized Unicode input in template — "Héllo Wörld" | OWASP A03 — injection via Unicode normalization attack | Normalize input with NFC before interpolation |

### Recommended Actions
- [ ] **Sanitize** Unicode input in i18n module
`;
