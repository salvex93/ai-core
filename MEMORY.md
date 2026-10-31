# PROJECT MEMORY REGISTER

## Architecture Decisions (ADR)
- ADR-001: Strict use of Zod for all runtime payload validation.
- ADR-002: Tiered context strategy (Tier 1 manifest, Tier 2 rules on-demand).

## Known Constraints & Gotchas
- Node runner must enforce timeout <= 5000ms on test suites.
- Avoid global state in core harness modules.
