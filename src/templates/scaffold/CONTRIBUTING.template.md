<!--
  CONTRIBUTING template — SDLC Guardian Agents

  PURPOSE: CONTRIBUTING.md scaffold — git workflow, PR process, coding standards.
  USED BY: PO Guardian when scaffolding/auditing projects.
  INSTALLED AT: ~/.copilot/templates/scaffold/CONTRIBUTING.template.md
-->

# Contributing

## Git Workflow
- Branch from `main`: `feature/[short-name]` or `issue-[N]-[short-name]`
- One commit per logical change
- PR required, minimum 1 reviewer

## PR Process
1. Create draft PR early for visibility
2. Link related issue: `Closes #N`
3. Fill out PR template
4. Pass CI checks (lint, test, security scan)
5. Get review approval
6. Squash merge to main

## Coding Standards
[Link to style guide or describe conventions]

## Review Process
- Security-sensitive changes → invoke Security Guardian (`/agent`)
- All code changes → invoke Code Review Guardian (`/agent`)
- New features → require PO Guardian ticket first