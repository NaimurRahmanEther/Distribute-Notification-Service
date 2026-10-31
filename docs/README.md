# Notification Service Documentation

| Document control | Value |
| --- | --- |
| Baseline | Repository implementation reviewed on 30 October 2026 |
| Lifecycle | Local development and integration verification |
| Audience | Product reviewers, backend developers, client developers, maintainers |
| Authority | Executable source and database migrations define current behavior |
| Maintenance | Update requirements, contracts, design, and verification together when behavior changes |

This documentation combines the useful parts of a Business Requirements Document (BRD), Product Requirements Document (PRD), Software Design Document (SDD), and Technical Specification Document (TSD). Each topic has one primary home to avoid conflicting copies.

## Reading paths

| Your goal | Read |
| --- | --- |
| Understand the purpose, scope, policies, and acceptance criteria | [Requirements: BRD and PRD](requirements.md) |
| Understand processes, modules, flows, and design decisions | [Architecture and design: SDD](architecture.md) |
| Inspect tables, queues, settings, reliability, and security details | [Technical specification: TSD](technical-specification.md) |
| Integrate a frontend or API client | [API and client contracts](client-contracts.md) |
| Install, run, troubleshoot, and maintain a local environment | [Development guide](development-guide.md) |
| Review evidence, reproduce checks, and identify coverage gaps | [Verification and traceability](verification.md) |
| Find the source in a useful reading order | [Backend guide](../backend/README.md) |

Start with the [project README](../README.md) for a quick local setup. Business stakeholders can read the requirements without reading SQL or queue configuration. Developers should read the architecture before the technical specification.

## Scope and evidence conventions

- **Implemented:** behavior is represented in the reviewed source; this alone does not mean every execution path was tested.
- **Locally verified:** an explicit check was executed successfully during the recorded local verification session.
- **Partially verified:** some paths passed, but external integrations, timing, concurrency, or failure combinations remain untested.
- **Proposed:** a future decision or target, not an implemented capability or an approved business commitment.

The requirements document derives the product intent from the application and the development scope agreed in this project. It is not a record of independently approved stakeholder research, budgets, or commercial targets. Performance, availability, and delivery-time guarantees have not been established.

Production deployment, CI/CD, infrastructure hardening, and production service-level commitments are outside this documentation baseline. Existing Docker and Nginx files are documented because they are part of the current local runtime.

Some workspaces also contain Git-ignored `phase-*.md` and `legacy-backend.md` personal notes. They describe earlier designs and can contain obsolete paths. They are historical material, not part of this current documentation set.

## Glossary

| Term | Meaning here |
| --- | --- |
| Notification | Persistent inbox content belonging to one user |
| Delivery | One channel and stage of an attempt to deliver a notification |
| Stage | `INITIAL`, `UNREAD_REMINDER_1`, or `UNREAD_REMINDER_2` |
| Outbox | PostgreSQL records of delivery intent awaiting queue publication |
| Provider | The in-app, Resend email, or Web Push adapter |
| Presence | Expiring Redis records describing connected and active sockets |
| Active | At least one socket has a current explicit activity heartbeat |
| Replay | An admin-authorized new processing round for an eligible failure |
| DLQ | Dead-letter queue; terminal failures also have durable PostgreSQL records |
| Idempotency | Repeating a request/job without intentionally creating duplicate work |
| At-least-once | Work may be processed again after retries or uncertain outcomes |
| `SENT` | Application/provider acceptance as defined by the channel; not proof of reading |

## Change discipline

1. Assign or update a requirement ID when externally visible behavior changes.
2. Update API contracts when paths, validation, payloads, or status codes change.
3. Update architecture and technical details when module boundaries, persistence, queue rules, or configuration change.
4. Record what was actually verified and what remains unverified.
5. Keep example credentials as placeholders. Do not document real secrets, refresh tokens, push subscription URLs, or private keys.
