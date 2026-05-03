<!--
  Project Audit template — SDLC Guardian Agents

  PURPOSE: Project Health Audit checklist used by the PO Guardian when in audit mode.
  USED BY: PO Guardian when scaffolding/auditing projects.
  INSTALLED AT: ~/.copilot/templates/project-audit.template.md
-->

## Project Health Audit

### Project Documentation
| Status | Document | Path | Why It Matters |
|--------|----------|------|----------------|
| ✅/❌/⚠️ | README.md | ./README.md | First thing anyone sees — purpose, setup, how to run. Without it, no one can use the project. |
| ✅/❌/⚠️ | ARCHITECTURE.md | ./ARCHITECTURE.md | Component boundaries, interfaces, dependencies, security model, supported platforms. Required for rewritability — without it, no one can safely modify the system. Applies to ALL projects regardless of size. |
| ✅/❌/⚠️ | LICENSE | ./LICENSE | Legal clarity — without it, the code has no usage rights. Adoption blocker. |
| ✅/❌/⚠️ | CONTRIBUTING.md | ./CONTRIBUTING.md | Git workflow, PR process, coding standards. Without it, contributors guess at conventions. |
| ✅/❌/⚠️ | SECURITY.md | ./SECURITY.md | Vulnerability reporting, data handling policy. Without it, security issues have no disclosure path. |
| ✅/❌/⚠️ | CHANGELOG.md | ./CHANGELOG.md | Version history, breaking changes. Without it, users can't assess upgrade risk. |

### ARCHITECTURE.md Completeness Check
If ARCHITECTURE.md exists, verify it covers these categories (scale depth by project size, but every category must be addressed):
- [ ] Application type and purpose
- [ ] Component map with responsibilities
- [ ] Interfaces (inputs, outputs, APIs, protocols)
- [ ] Security concerns and trust boundaries
- [ ] Supported OS/platforms
- [ ] Dependencies (internal and external)
- [ ] Communication patterns (sync/async, protocols, data flow)
- [ ] Data model and storage

### Process & Governance
| Status | Item | Where to Check |
|--------|------|----------------|
| ✅/❌ | ADRs (Architecture Decision Records) | ./docs/adr/ or ./adr/ |
| ✅/❌ | API Documentation (OpenAPI/Swagger) | ./docs/api/ or swagger.yml |
| ✅/❌ | Runbook / Ops Guide | ./docs/runbook.md or wiki |
| ✅/❌ | PR template | .github/pull_request_template.md |
| ✅/❌ | Issue templates | .github/ISSUE_TEMPLATE/ |
| ✅/❌ | Branch protection rules | GitHub settings |

### CI/CD & Quality Gates
| Status | Item | Where to Check |
|--------|------|----------------|
| ✅/❌ | CI pipeline | .github/workflows/ |
| ✅/❌ | Security scanning | .github/workflows/security-scan.yml |
| ✅/❌ | Linting in CI | .github/workflows/ |
| ✅/❌ | Test automation | .github/workflows/ |
| ✅/❌ | Dependency updates (Dependabot/Renovate) | .github/dependabot.yml |

### Observability [Google SRE]
| Status | Item | Why It Matters |
|--------|------|----------------|
| ✅/❌ | SLI/SLO definitions | Without them, there's no objective measure of service health |
| ✅/❌ | Alerting rules | Without them, failures go unnoticed until users report |
| ✅/❌ | Dashboard | Without it, operational state is invisible |
| ✅/❌ | Structured logging | Without it, debugging production issues is guesswork |
| ✅/❌ | Distributed tracing | Without it, cross-service request flows are opaque |

### Summary
- Project health score: [X/25]
- Critical gaps: [list with WHY each matters]
- Recommended actions: [prioritized — offer to produce missing docs]