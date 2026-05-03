<!--
=============================================================================
  Feature Ticket Template — SDLC Guardian Agents
=============================================================================

  PURPOSE
  -------
  The 18-section ticket the PO Guardian writes for each piece of work.
  Organized in three groups:
    - PRODUCT (Sections 1–4) — Google PRD structure
    - QUALITY (Sections 5–10) — Azure Well-Architected Framework + WCAG 2.2
    - ARCHITECTURE & PLANNING (Sections 11–18)

  USAGE
  -----
  Use this template when:
    - Writing a feature, bug, refactor, or hotfix ticket
    - For every individual ticket produced by the PO decomposition step
    - In addition to the Formal Spec (when one is produced) — the spec is
      holistic; this ticket is component-scoped

  EVERY SECTION must have content or an explicit "N/A — [reason]". Silence
  is not acceptable. Every non-functional requirement must be measurable
  ("p95 < 200ms" not "fast"; "max 200 chars" not "short").

  LINKAGE
  -------
  The `Parent Spec:` field at the top is REQUIRED on every ticket.
  Acceptable values:
    - `specs/{feature}/spec.md` — when a Formal Spec was produced
    - `N/A — [explicit reason]` — when the PO Guardian decided no spec
      was warranted (record the rationale)

  Bug-fix tickets against an area with a parent spec MUST also patch the
  spec as part of the same change. The Code Review Guardian's spec-aware
  review enforces this.
=============================================================================
-->

# [Feature Title]

**Parent Spec**: `specs/{feature}/spec.md` — OR — `N/A — [explicit reason for skipping the Formal Spec, e.g., "trivial bug fix; no system impact"]`

<!-- ═══════════════════════════════════════════════════════ -->
<!-- PRODUCT — what we're building and for whom             -->
<!-- Google PRD structure                                    -->
<!-- ═══════════════════════════════════════════════════════ -->

## 1. User Story
As a [specific role/persona],
I want [specific goal or action],
so that [measurable value or outcome].

**Success metrics:** [How will we know this succeeded? OKRs, KPIs, or measurable outcomes]

## 2. Component Design (Rewritable by Design)

This section is critical. Components with clear boundaries and responsibilities enable any component to be rewritten independently by a developer or AI agent.

### Component Map

| Component | Responsibility (single) | New or Existing |
|-----------|------------------------|-----------------|
| [Name] | [One sentence — one reason to change] | New / Existing |

For each component that is new or modified:

**Boundary:** What is inside vs. outside this component's scope?
**File structure:** Where does it live? (e.g., `src/components/maze-generator/`)

**Interface Contract (define BEFORE implementation):**
- **Ports:** What interfaces does this component expose or consume?
- **Input contract:** What data comes in, from where, in what format?
- **Output contract:** What data goes out, to where, in what format?
- **Error contract:** What errors can occur, how are they surfaced?

**Dependencies:**
- **Depends on:** Which components does this consume? Via what interface?
- **Consumed by:** Which components consume this? Via what interface?
- **Rule:** No direct imports from sibling internals — only through defined interfaces

**Rewritability check:**
- [ ] Can this component be rewritten given only its interface definition and tests?
- [ ] Are the interfaces stable enough that consumers survive a rewrite?
- [ ] Is the data model owned by this component (not shared with siblings)?

## 3. Audience & Personas
- **Primary persona:** [Who, their context, skill level]
- **Secondary persona:** [Who else is affected]
- **Scale:** [Expected number of users, frequency of use]

## 4. Functional Requirements

### Acceptance Criteria (Given/When/Then)

**AC1: [Scenario name]**
- Given [precondition]
- When [action]
- Then [expected result]

**AC2: [Scenario name]**
- Given [precondition]
- When [action]
- Then [expected result]

### Edge Cases
- [Empty/null input?]
- [Maximum/minimum values?]
- [Concurrent access?]

### User Flows
- [Primary happy path — step by step]
- [Key alternate paths]

<!-- ═══════════════════════════════════════════════════════ -->
<!-- QUALITY — Azure Well-Architected Framework pillars     -->
<!-- + WCAG 2.2 for accessibility                           -->
<!-- Answer each question or write N/A with a reason.       -->
<!-- ═══════════════════════════════════════════════════════ -->

## 5. Reliability [Azure WAF]
- **Availability target:** [e.g., 99.9% over 30-day window — or N/A for local-only apps]
- **Failure mode:** [What happens when a dependency fails? Graceful degradation? Retry?]
- **Recovery:** [RPO and RTO targets — how much data loss and downtime is acceptable?]
- **Fault tolerance:** [Single points of failure? Redundancy strategy?]
- **Health checks:** [Readiness/liveness probes? Health endpoints?]

## 6. Security [Azure WAF]
- **Authentication:** [None, API key, OAuth, SSO — what method and why?]
- **Authorization:** [Who can access what? RBAC/ABAC rules?]
- **Data sensitivity:** [PII? Encryption at rest/in transit?]
- **Input validation:** [Validation rules, sanitization approach?]
- **Secrets management:** [How are credentials stored and rotated?]
- **Compliance:** [GDPR, HIPAA, SOC2 — or N/A with reason]
- **OWASP surface:** [Which OWASP Top 10 categories are relevant?]

If significant security surface exists, recommend Security Guardian reviews the implementation.

## 7. Cost Optimization [Azure WAF]
- **Resource efficiency:** [Right-sized compute? Auto-scaling? Spot instances?]
- **Cost boundaries:** [Budget limits? Cost alerts?]
- **Waste prevention:** [Idle resources? Over-provisioning risks?]

## 8. Operational Excellence [Azure WAF]
- **Deployment strategy:** [Blue-green, canary, rolling — or N/A for static/local]
- **Rollback plan:** [How to revert a bad deployment?]
- **CI/CD:** [Pipeline requirements — build, test, deploy on merge?]
- **Incident response:** [Runbook needed? Escalation path?]
- **Automation:** [What can be automated? What requires manual intervention?]

## 9. Performance Efficiency [Azure WAF]
- **Latency targets:** [e.g., p95 < 200ms — or N/A for offline apps]
- **Throughput:** [Expected requests/sec, concurrent users, data volume?]
- **Scalability:** [Horizontal? Vertical? Auto-scaling triggers?]
- **Resource budget:** [CPU/memory limits? Connection pools?]
- **Caching strategy:** [What is cached? TTL? Invalidation?]

## 10. Accessibility [WCAG 2.2]
- **Conformance target:** [WCAG 2.2 Level A / AA / AAA — AA is recommended minimum]
- **Keyboard navigation:** [All interactive elements reachable via keyboard?]
- **Screen reader:** [VoiceOver/NVDA compatible? Semantic HTML? ARIA labels?]
- **Color contrast:** [Minimum 4.5:1 for normal text, 3:1 for large text]
- **Touch targets:** [Minimum 44×44pt for mobile/touch]
- **Text scaling:** [Supports browser zoom to 200%?]
- **No color-only information:** [Patterns or labels supplement color?]
- **Motion:** [Respects prefers-reduced-motion?]
- **Cognitive load:** [Clear language, predictable navigation, helpful errors?]

N/A for pure backend/API/CLI — state the reason.

<!-- ═══════════════════════════════════════════════════════ -->
<!-- ARCHITECTURE & PLANNING                                -->
<!-- ═══════════════════════════════════════════════════════ -->

## 11. API & Data Contracts
### Endpoints (if applicable)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/resource | Create resource | Bearer token |

### Request/Response Schemas
[Define input/output schemas with types, constraints, and examples]

### Pagination, Filtering, Sorting
[Strategy and defaults — or N/A]

## 12. Data Model & Storage
- [New tables/collections needed]
- [Schema changes to existing models]
- [Migration strategy]
- [Storage type: SQL, NoSQL, blob, cache]
- [Data retention and lifecycle]

## 13. Deployment & Infrastructure
- **Target environment:** [Local-only, static hosting, container, serverless, PaaS]
- **Hosting:** [GitHub Pages, S3, Azure, K8s — or file:// for local apps]
- **Environment strategy:** [dev/staging/production? Feature flags?]
- **Infrastructure as code:** [Terraform, Helm, Kustomize — or N/A]

If K8s/containers, recommend Platform Guardian and Delivery Guardian review.

## 14. Observability [Google SRE]
### SLIs / SLOs
| SLI | Target (SLO) | Window |
|-----|-------------|--------|
| [Availability] | [99.9%] | [30 days] |
| [Latency p95] | [< 200ms] | [Rolling] |

### Monitoring
- **Metrics:** [Key business and technical metrics]
- **Dashboards:** [What dashboards are needed?]
- **Alerts:** [Alert conditions, severity, escalation path]
- **Logging:** [Structured logging? Log levels? Retention?]
- **Tracing:** [Distributed tracing? — or N/A]

## 15. Dependencies & Risks
- **Upstream:** [Services/APIs this depends on]
- **Downstream:** [Services/consumers affected]
- **Third-party:** [External APIs, SDKs, libraries]
- **Risks:** [Each risk must have a mitigation — even if "accept and monitor"]

## 16. Out of Scope
- [Feature X is explicitly NOT part of this ticket]
- [Edge case Y will be handled in a follow-up]

## 17. Open Questions & Trade-offs

### Open Questions
- [ ] [Unresolved decision needing input]

### Trade-off Decisions
When two quality attributes are in tension, document explicitly:

| Trade-off | Option A | Option B | Decision | Rationale |
|-----------|----------|----------|----------|-----------|
| [e.g., Security vs. UX] | [Strict MFA] | [Session-based auth] | [Option B] | [Balances security with usability] |

## 18. Testing Strategy
- **Unit tests:** [Key functions — Developer Guardian scope]
- **Integration tests:** [Service interactions — QA Guardian scope]
- **E2E tests:** [User flows — QA Guardian scope]
- **Accessibility tests:** [Screen reader, keyboard, contrast — user-facing apps]
- **Performance tests:** [Load testing — if applicable]
- **Edge cases:** [Specific scenarios from Section 4]

### Guardian Review Plan
| Guardian | Why | When |
|----------|-----|------|
| [Security Guardian] | [Auth + data sensitivity] | [Implementation review] |
| [Code Review Guardian] | [Always] | [Implementation review] |
