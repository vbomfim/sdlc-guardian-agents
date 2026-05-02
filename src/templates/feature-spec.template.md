<!--
=============================================================================
  Feature Spec Template — SDLC Guardian Agents
=============================================================================

  COMPATIBILITY: Spec Kit (https://github.com/github/spec-kit)
  -----------------------------------------------------------
  Sections 1–4 below are MECHANICALLY IDENTICAL to Spec Kit's
  templates/spec-template.md (source: github/spec-kit, ref:
  259494a328e13df32e18b2df31abd421c881c071). Heading text, ID format
  (FR-001, SC-001), user-story structure, and field labels match exactly.

  This means a Spec Kit-aware tool (`/speckit.specify`, `specify`, etc.)
  can read and process this file as if it were a native Spec Kit spec.
  The SDLC Guardian extensions in Sections 5–8 use new top-level headings
  Spec Kit does not consume; tooling will ignore them safely.

  Spec Kit's separate plan.md (Technical Context, Project Structure) is
  intentionally NOT included here — that ground is covered by the PO
  Guardian's 18-section ticket and the project's ARCHITECTURE.md. Users
  who want a parallel Spec Kit plan can run `/speckit.plan` to generate
  one alongside this file.

  PURPOSE
  -------
  Single readable artifact per feature. Aggregates the PO Guardian's
  research output into a holistic, system-aware view BEFORE decomposition
  into tickets. The spec is derived from work the PO already does — it
  reorganizes that output into a format developers, reviewers, and AI
  agents can consume in one read.

  WHEN TO PRODUCE
  ---------------
  PO Guardian decides per request based on complexity. The judgment and
  rationale MUST be captured in the parent ticket(s) — see the
  `Parent Spec:` field convention.

    - Produce a Formal Spec when it adds clarity (multi-component changes,
      cross-Guardian impact, architectural shifts, new product surfaces).
    - Skip a Formal Spec when ceremony exceeds value (trivial bug fixes,
      single-file refactors, hotfixes). Record skip rationale in the
      ticket's `Parent Spec:` field as "N/A — [reason]".

  STORAGE
  -------
  Target projects store specs at:    specs/{feature}/spec.md
  where {feature} is a kebab-case slug derived from the feature name.

  The spec lives in the target project repo (NOT in the SDLC Guardians
  source repo). Bidirectional links: spec links to the issue tracker;
  tickets and PRs carry a `Parent Spec:` field referencing this file.

  AUTHORING NOTES
  ---------------
  - Every section MUST have content or "N/A — [reason]". Silence is not
    acceptable. The spec is the holistic surface — gaps here produce gaps
    in tickets, implementation, and review.
  - Mark unresolved ambiguity with [NEEDS CLARIFICATION: ...] inline.
    Open clarifications block decomposition.
  - Be specific, not vague. "p95 < 200ms" not "fast"; "max 200 chars" not
    "short". Measurable success criteria are mandatory.
  - Do not modify Section 1–4 headings or ID formats — Spec Kit
    compatibility depends on them. Sections 5–8 are SDLC extensions and
    may evolve independently.
=============================================================================
-->

# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`
**Created**: [DATE]
**Status**: Draft
**Input**: User description: "$ARGUMENTS"

<!--
  SDLC Guardian extension fields (additive — Spec Kit ignores unknown fields).
  Populate during PO Step 0 / decomposition.
-->

**Owner**: [Person or team accountable for the spec]
**Last updated**: [DATE]
**Issue tracker**: [Link to parent epic, milestone, or coordinating issue]
**Tickets**: [List of ticket IDs derived from this spec — populated during decomposition]

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]

<!--
=============================================================================
  END OF SPEC KIT-COMPATIBLE CONTENT
=============================================================================
  Sections below are SDLC Guardian extensions. They use new top-level (##)
  headings that Spec Kit tooling does not consume. They MUST be filled out
  for the SDLC Guardian pipeline (PO decomposition, Guardian reviews,
  drift detection, archive) but are optional from a Spec Kit perspective.
=============================================================================
-->

## Decomposition

> **The ticket tree.** Populated during PO Step 5. Each ticket links back to
> this spec via its `Parent Spec:` field. The decomposition shows how the
> holistic feature breaks into independently shippable units.

### Module map

| Module | Purpose | Tickets |
|--------|---------|---------|
| [Module name] | [Single responsibility] | [#123, #124] |

### Sequencing and dependencies

> Which tickets must complete before others? What can ship in parallel?

- **Phase A (foundation):** [Tickets]
- **Phase B (depends on A):** [Tickets]
- **Phase C (parallel with B):** [Tickets]

### Decomposition rationale

[One paragraph. Why this decomposition? What alternatives were considered? What trade-offs were accepted?]

## Guardian Consultation Results

> **Captured ONCE at the feature level**, not repeated per ticket. Output of
> PO Step 5b (and Step 5c once Phase 2 of issue #78 lands). Each subsection
> lists the requirements that domain Guardian raised when consulted.

### Security Guardian

- [Requirement]: [Rationale / OWASP reference]
- [Requirement]: ...

### Privacy Guardian

- [Requirement]: [Rationale / GDPR/HIPAA/CCPA reference]
- [Requirement]: ...

### Platform Guardian

- [Requirement]: [Rationale / infra/k8s/networking concern]
- [Requirement]: ...

### Delivery Guardian

- [Requirement]: [Rationale / deployment/CI/observability concern]
- [Requirement]: ...

### Code Review Guardian (architectural impact)

> Populated by PO Step 5c — added in Phase 2 of issue #78. Until then,
> leave as N/A or omit.

- [Architectural concern]: [Rationale]

## System Impact

> **The delta — what changes in the existing system.** Tickets describe new
> components well; they describe deltas to the existing architecture poorly.
> This section is mandatory and exists to close that gap.

### Affected components

| Component | Change type | Description |
|-----------|-------------|-------------|
| [Existing component] | New / Modified / Deprecated / Removed | [What changes about it] |

### Affected contracts

> APIs, message schemas, database schemas, configuration files, environment
> variables, CLI flags — anything with a contract surface.

| Contract | Change | Backward compatible? |
|----------|--------|---------------------|
| [Contract name] | [Add field / breaking change / deprecate / etc.] | Yes / No — [if no, migration strategy] |

### Architectural deltas

> What assumptions about the system change as a result of this feature?

- [Assumption that no longer holds, or new assumption introduced]

### Backward compatibility and migration

- **Breaking changes:** [List, or "None"]
- **Migration path:** [How existing users/data/integrations move to the new state]
- **Deprecation timeline:** [If applicable]

### Risk surface

- **Risks introduced:** [New attack surface, new failure modes, new operational burden]
- **Risks reduced:** [Existing risks this feature mitigates]

## Product Impact

> **The strategic delta — how this feature shifts the product.** Often
> implicit in feature requests; making it explicit prevents scope drift and
> aligns reviewers.

### Positioning shift

[Does this feature change how the product is positioned, marketed, or differentiated? If yes, how?]

### Scope boundary changes

[Does this feature expand or narrow the product's overall scope? Does it open or close a category of future work?]

### Roadmap dependencies

- **Unlocks:** [Future features that become possible because of this one]
- **Blocks or delays:** [Future features deprioritized or made harder by this one]
- **Depends on:** [Existing work this feature relies on]

### User-facing communication

- **Internal stakeholders to inform:** [Teams that need a heads-up]
- **External communication needed:** [Release notes, docs, blog post, customer comms — or "None"]

## Appendix — References

- [Link to research, prior art, related ADRs, design docs]
- [Link to user research, support tickets, analytics that motivated the feature]
- [Link to relevant standards or external specifications]
