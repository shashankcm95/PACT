---
lifecycle: persistent
phase: proto-planning
created: 2026-06-21
---

# PACT proto-planning — research plan

**Goal.** Pressure-test the PACT blueprint (`PACT-spec.md` + `PACT-intent-and-landmines.md`)
against credible prior art in agent-to-agent (A2A) protocols, trust/reputation/Sybil
resistance, and computational epistemics; contrast designs; decide **what to build**
atop the existing Power Loom `kernel → runtime → lab(evolution)` as a *single PACT node*.

**Discipline.** This is the phase that decides what to build → full HETS verification.
route-decide returned `root` (0.15) on a stakes-lexicon miss; **overridden to route by
judgment** (architect-shaped, user explicitly requested a research team + full HETS verification).

## Research team (fan-out)

| Agent | Lens | Charter |
|---|---|---|
| R1 | A2A protocols + comms standards | Google A2A, MCP, ACP (IBM/BeeAI), AGNTCY/Internet-of-Agents, ANP, FIPA-ACL/KQML, LOKA, IETF/W3C. Contrast vs PACT §1/§2/§4 (identity, frame, session FSM). |
| R2 | Trust / reputation / Sybil | EigenTrust, web-of-trust (PGP), Advogato/Appleseed/TidalTrust, proof-of-personhood (World ID, BrightID, PoH, Idena), Sybil literature, stake mechanisms. Contrast vs PACT §1/§5. |
| R3 | Epistemics: TMS / argumentation / provenance / scope | JTMS/ATMS (Doyle, de Kleer), Dung AF + defeasible logic, Toulmin, AGM belief revision, W3C PROV, McCarthy contexts. Contrast vs PACT §3/§6. |
| R4 | Power-Loom mapping analyst | Verify every §11 mapping row against the ACTUAL repo. Is kernel→runtime→lab a real PACT node? What are the genuine GAPS to become inter-node? |
| V1 | hacker (adversarial) | Break the Sybil/disjoint-path/reach/cap guards + [OPEN] containments. Are L1–L12 actually defended? |
| V2 | honesty-auditor | Claim-vs-evidence: [SOLVED] tags really solved? Over-claims? Intent-doc ↔ spec internal consistency. |
| V3 | architect (integration) | Run AFTER R1–R4 + V1/V2. Design soundness, coherence, scaling single-node→network, gaps/inconsistencies. |

## Output

- `research/prior-art/{a2a-protocols,trust-reputation-sybil,epistemics}.md`
- `research/prior-art/power-loom-mapping.md`
- `research/verification/{adversarial,honesty,architect}.md`
- `research/10-synthesis-and-recommendation.md` (the decision: what to build, what to borrow, what to drop)

## Runtime probes (verify, don't assume)

- PACT is NOT a git repo yet (probed: `git rev-parse` fails) — workspace created under `research/`.
- Power Loom tiers exist: `packages/{kernel,runtime,lab}` (probed: `ls`).
