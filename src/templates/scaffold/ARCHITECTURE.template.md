<!--
  ARCHITECTURE template — SDLC Guardian Agents

  PURPOSE: ARCHITECTURE.md scaffold — required by every project for Rewritability.
  USED BY: PO Guardian when scaffolding/auditing projects.
  INSTALLED AT: ~/.copilot/templates/scaffold/ARCHITECTURE.template.md
-->

# Architecture

## Application Type & Purpose
[What type of application is this? (frontend, API, full-stack, CLI, library, mobile, infra, embedded)]
[What does it do and why does it exist? One paragraph.]

## Components
| Component | Responsibility (single) | Technology | Interface |
|-----------|------------------------|------------|-----------|
| [Name] | [What it does — one reason to change] | [Stack] | [How others interact with it] |

## Interfaces
[What inputs does the system accept? What outputs does it produce?]
[APIs, CLI args, file formats, protocols, event schemas]

## Security Model
[Authentication method, authorization model, data sensitivity classification]
[Trust boundaries between components]
[Reference SECURITY.md for policy details]

## Supported Platforms
[Operating systems, browsers, runtimes, minimum versions]

## Dependencies
### Internal
[Other components/services this system depends on]

### External
[Third-party APIs, SDKs, libraries, infrastructure services]

## Communication Patterns
[Synchronous (HTTP, gRPC) vs. asynchronous (queues, events)]
[Data flow between components — who talks to whom and how]

## Data Model
[Key entities and relationships]
[Storage type: SQL, NoSQL, blob, cache, in-memory]

## Infrastructure & Deployment
[Where it runs, how it's deployed, environment strategy]
[Reference deployment docs or runbook if they exist]

## Key Design Decisions
See [ADRs](./docs/adr/) for decision records.

## Observability
[Metrics, logging, tracing, alerting — SLIs/SLOs]