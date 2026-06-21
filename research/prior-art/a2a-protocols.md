---
title: "Prior-Art Review — Agent-to-Agent (A2A) / Agent-Communication Protocols vs. PACT"
lens: "Agent-to-agent / agent-communication protocols and interoperability standards"
date: 2026-06-21
lifecycle: persistent
status: research / proto-planning input
scope: >
  Contrasts PACT's identity model (§1), wire format (§2 PACT frame), and session
  FSM (§4) against the credible existing bodies of work in agent interoperability.
---

# Prior-Art Review: A2A / Agent-Communication Protocols vs. PACT

> **Research-mode discipline.** Every factual claim about an external protocol below
> carries a bracketed source `[S#]` resolving to the Sources section. Where I reason
> beyond a source I mark it **(inference)**. Where I could not find a credible source
> I say so explicitly. The PACT design is quoted from the two local blueprint files
> (`PACT-spec.md`, `PACT-intent-and-landmines.md`).

---

## 0. Executive orientation

PACT is an A2A trust/coordination protocol with three load-bearing commitments that
make it *unusual* in this field:

1. **Identity is rooted in scarce HUMAN identity** — one-human-one-root, with a cap on
   *effective* network-facing presence per human (§1, INV-12).
2. **Reach/propagation is gated by VERIFICATION, never engagement** (§6.3, INV-9, L1).
3. **A hard P1/P2 split**: a signature proves WHO + UNTAMPERED, *never* TRUE; content
   honesty is *contained*, never solved (§0, INV-1).

The dominant finding of this review: **the entire modern A2A field has converged on the
exact opposite of commitment #1.** Every credible 2024–2026 protocol treats the agent
(or, at most, the *organization*) as a first-class, self-sovereign identity, and several
explicitly *encourage* one principal to mint unlimited identities. Commitments #2 and #3
are genuinely under-served by the field and are where PACT is most defensible. PACT's
*transport* layer (§2/§4), by contrast, is reinventing wheels that A2A, ACP, and ANP
have already shipped with more maturity.

---

## 1. The bodies of work (one capsule each)

### 1.1 Google Agent2Agent (A2A) — the enterprise incumbent

- **Origin/governance.** Announced April 2025 under Apache-2.0; donated to the **Linux
  Foundation** in 2025 for neutral governance. [S1][S2]
- **Identity model.** Agent identity is **machine-to-machine and self-declared**. The
  core protocol "does not define human identity rooting"; agents work together "without
  needing access to each other's internal state, memory, or tools." [S3] The security
  threat-model survey is blunt: "Agent identity is **self-declared using the Agent Card
  with no global uniqueness enforcement**." [S6]
- **Wire format.** **JSON-RPC 2.0** binding; core methods `SendMessage`,
  `SendStreamingMessage`, `GetTask`, `ListTasks`, `CancelTask`, `SubscribeToTask`,
  push-notification config, `GetExtendedAgentCard`. Payloads are `Task` + `Artifact`
  objects. [S3]
- **Task lifecycle FSM.** `TASK_STATE_SUBMITTED` → `TASK_STATE_WORKING`; terminal
  `COMPLETED`/`FAILED`/`CANCELED`/`REJECTED`; interrupt states `INPUT_REQUIRED`,
  `AUTH_REQUIRED`. [S3] This is a richer FSM than PACT's `CLOSED → INIT_SENT →
  ESTABLISHED → TEARDOWN` because it models *task* progress, not just *connection*
  liveness.
- **Transport/session.** HTTP with three delivery modes: polling (`GetTask`), streaming
  (SSE), and push webhooks. [S3]
- **Discovery.** The **Agent Card**: a JSON metadata doc at `/.well-known/agent.json`
  declaring `provider`, `capabilities` (`streaming`, `pushNotifications`,
  `extendedAgentCard`), `skills`, `securitySchemes`, `interfaces`. [S1][S3]
- **Trust/auth.** Standard enterprise web auth: OAuth 2.0, API keys, HTTP Basic/Bearer,
  OpenID Connect, **mutual TLS**; JWTs for token transmission. [S1][S3] Threat model
  note: scopes "too broad or tokens long-lived," and **no mandatory issuer-bound
  provenance** for agent claims. [S6]
- **Versioning.** Semantic `Major.Minor` via the `A2A-Version` header; empty == 0.3. [S3]

### 1.2 Anthropic Model Context Protocol (MCP) — the agent↔tool boundary (relevant to P1/P2 split)

- **Origin/governance.** Open standard introduced by Anthropic (late 2024); spec dated
  2025-11-25. [S2a][S2b]
- **What it actually is.** **Not an A2A protocol.** MCP is a **client–server** standard
  for connecting an LLM host to external *tools, resources, and prompts* — Host /
  Client(s) / Server(s). [S2a][S2b] It is the agent↔tool boundary, where A2A/ANP/ACP are
  the agent↔agent boundary. The interoperability survey: "MCP provides a JSON-RPC
  client-server interface for secure tool invocation and typed data exchange." [S5]
- **Identity.** Token-based; **optional** DIDs; agents are not first-class peers —
  "treating agents as tool consumers rather than first-class identities." [S6a] No
  human-rooting. Threat model: "Agents and tools can register without strict identity
  validation, making impersonation highly probable." [S6]
- **Wire/transport.** JSON-RPC 2.0 (Requests/Results/Errors/Notifications); HTTP, Stdio,
  SSE. [S5][S6a]
- **Why it matters to PACT.** MCP encodes a *trust-boundary* discipline directly germane
  to PACT's P1/P2 split: "an MCP tool represents a **trust boundary**…validate and
  properly sanitize all external inputs"; "descriptions of tool behavior…should be
  considered **untrusted**, unless obtained from a trusted server"; "Hosts must obtain
  explicit **user consent** before invoking any tool." [S2c] This is the closest the
  mainstream field comes to PACT's "input untrusted, claim must be verified, human in the
  loop" stance — but it is a *tool*-boundary rule, not a *peer-trust* model.

### 1.3 IBM/BeeAI Agent Communication Protocol (ACP)

- **Origin/governance.** Introduced by IBM's BeeAI; developed under the **Linux
  Foundation**; primary impl is the BeeAI Framework (Python/TS). [S4a][S4b]
- **Identity/trust.** Bearer tokens, **mutual TLS**, **JWS** (message signing);
  integrates with role-based and decentralized identifiers (DIDs). [S5][S6a] No
  human-rooting; agents identified by metadata in an **Agent Detail manifest**. [S6a]
- **Wire format.** **REST over HTTP** (deliberately "no specialized libraries — cURL,
  Postman, or a browser"); **multipart, MIME-typed** message parts; sync + async; an
  OpenAPI spec defines endpoints. [S4][S4a]
- **Discovery.** **Registry-based** — a central ACP Server maintains an Agent Registry
  via the Agent Detail Schema; metadata can be embedded in distribution packages so
  agents are discoverable even while inactive ("scale-to-zero"). [S4][S6a]
- **Session.** Session-aware with run-state tracking; incremental streams. [S6a]

### 1.4 AGNTCY / Internet of Agents (Cisco + LangChain + Galileo) — incl. the closest analog to PACT's rooting

- **Origin/governance.** Announced by Cisco Outshift (March 2025); donated to the
  **Linux Foundation** (July 2025). [S7]
- **Stack.** Four layers: **OASF** (Open Agentic Schema Framework — an OCI-based data
  model that *uniquely identifies* agents), **Agent Directory** (announce/discover),
  **SLIM** (Secure Low-latency Interactive Messaging — pub/sub + req/reply + streaming),
  **Observability/Eval**. [S7a]
- **Identity — the one partial analog to PACT.** AGNTCY issues an **Agent Badge**: an
  enveloped **Verifiable Credential** (JSON-LD) whose `issuer` field is **"ORG"** — the
  *organization* that issued the badge. Badges "prevent impersonation…by ensuring
  **provenance can be verified**," and "the system supports accountability by maintaining
  clear records of **which organization issued each badge**." [S7b][S7c]
- **Why this is the relevant contrast.** AGNTCY is the *only* mainstream effort that roots
  agent identity in an **accountable real-world principal** (an org) rather than a bare
  keypair. But it roots in the **organization**, which is *not scarce* — an org can issue
  unlimited badges. It is provenance/accountability without **Sybil-budget scarcity**.
  PACT's human-scarcity cap (INV-12) has no analog here. **(inference, well-supported by
  [S7b][S7c]).**

### 1.5 Agent Network Protocol (ANP) — the maximally self-sovereign opposite of PACT

- **Origin/governance.** Open-source; W3C AI-Agent-Protocol community-group white paper;
  "the HTTP of the Agentic Web." Community-led. [S8][S5]
- **Identity.** **DID-native, self-sovereign** — `did:wba` (Web-Based Agent DID), "domain
  + path + public key," resolving to an HTTPS-hosted DID document. "Each agent has its
  own cryptographic identity…independent of any central authority." [S8]
- **The direct anti-PACT clause.** The white paper explicitly endorses a **"multi-identity
  strategy"**: "a user or agent can have **multiple independent identity identifiers** for
  different scenarios," with **no limit on agents per human and no Sybil-resistance
  mechanism**. [S8] This is the *exact* design PACT's L11/INV-12 cap exists to prevent.
- **Wire/discovery.** JSON-LD + Schema.org + meta-protocol negotiation (ADP — Agent
  Description Protocol); discovery via search-engine crawling of a
  `.well-known/agent-descriptions` endpoint. [S5][S8]
- **Trust.** Purely cryptographic — DID public-key auth; optional `humanAuthorization`
  for sensitive actions; **no reputation/trust scores at all**. [S5][S8]

### 1.6 Classic prior art — FIPA-ACL and KQML (the 1990s–2000s that PACT's §2/§4 partly re-derives)

- **Lineage.** Both are **speech-act-theoretic** agent communication languages (Searle;
  Winograd & Flores). KQML (early 1990s) → FIPA-ACL (late 1990s) refined its semantics
  into **~20 performatives** with mandatory fields. [S9][S9a][S9b]
- **FIPA-ACL message structure.** Fields: `performative` (required, first), `sender`,
  `receiver`, `content`, `language`, `encoding`, `ontology`, `protocol`,
  `conversation-id`, `reply-with`, `in-reply-to`, `reply-by`, `reply-to`. [S9b]
  Performatives include `inform`, `request`, `agree`, `refuse`, `failure`, `cfp`,
  `propose`, `accept-proposal`/`reject-proposal`, `confirm`/`disconfirm`,
  `query-if`/`query-ref`, `subscribe`, `not-understood`, `cancel`, `proxy`. [S9b]
- **KQML.** Lisp-like; performative-first; reserved performatives `ask-one`, `tell`,
  `achieve`, `reply`, `register`, `forward`, `broadcast`, `subscribe`. A **facilitator**
  (broker/mediator) routes messages and helps agents find each other. [S9b]
- **Identity & trust.** Agents named by simple `sender`/`receiver` strings (FIPA: an
  Agent Identifier / AID); **no built-in authentication, no identity uniqueness, no
  trust/reputation** — these were assumed to live in the (closed, cooperative) platform.
  [S9b] **(inference from [S9b] + absence in [S9][S9a]).**
- **Why it matters to PACT.** PACT's `FLAGS:[INIT][ACK][EXCH][VRFY][FIN]` and its claim
  taxonomy are a **thinner re-derivation of speech acts**. FIPA already standardized 20+
  *typed illocutionary acts* (inform vs. request vs. propose vs. cfp) and *interaction
  protocols* (Contract-Net, request, query). PACT collapses all message intent into a
  generic `EXCH` carrying a `Claim`. See §3 below — this is a borrow opportunity *and* a
  partial wheel-reinvention.

### 1.7 Agora — content-addressed protocol negotiation (the one mechanism PACT should steal)

- **What it is.** A **meta-protocol** (Marro et al., Oct 2024) resolving the *Agent
  Communication Trilemma* — versatility vs. efficiency vs. portability. Agents use
  natural language for rare exchanges, hand-written routines for frequent ones, and
  **LLM-written routines** for everything between. [S10][S10a]
- **The borrowable mechanism.** A **Protocol Document (PD)** formalizes a task's
  syntax/semantics and is **referenced by a content hash** (SHA-based); the receiver
  fetches the PD from any source and **checks the hash matches** — content-addressed
  protocol identity, no central naming authority. [S10a]
- **Trust.** **None.** "No authentication, trust, reputation, or accountability
  mechanisms"; the hash check verifies *data integrity, not identity or trust.* [S10a]
  This is *exactly* PACT's L5 trap (integrity ≠ trust) shipped as a whole protocol.

### 1.8 LOKA — the academic protocol that most resembles PACT's *ambition* (but still self-sovereign)

- **What it is.** "Layered Orchestration for Knowledgeful Agents" (arXiv 2504.10915,
  April 2025): a four-layer stack — **Identity, Governance, Security, Consensus** — for
  "ethically governed, interoperable AI agent ecosystems." [S11][S11a]
- **Identity.** **Universal Agent Identity Layer (UAIL)** on **Self-Sovereign Identity
  (SSI)** principles: each agent gets a unique **DID** + **Verifiable Credentials**;
  post-quantum crypto. [S11a]
- **Closest to PACT.** LOKA shares PACT's vocabulary of *accountability, ethical
  alignment, decentralized consensus, intent-centric communication.* But its identity is
  **agent-sovereign (DID-per-agent)**, not human-scarce. It has a **Decentralized Ethical
  Consensus Protocol** — which is the very "judge of truth / throne" that PACT's M1/M2
  explicitly *refuse to build.* **(inference from [S11a]).**

### 1.9 Standards bodies — IETF, W3C (where the field is heading)

- **W3C AI Agent Protocol Community Group** (proposed May 2025): "open, interoperable
  protocols that enable AI agents to discover, identify, and collaborate"; standardized
  capability metadata, auth/authz, an identity framework "based on open standards." [S12]
- **IETF.** A side meeting at IETF 123 began a charter; the five gaps named are **agent
  discovery/capabilities, inter-agent comms, credentials/permissions, multimodality, and
  "How do we keep humans in the loop?"** [S12a] **Web Bot Auth** became a chartered IETF
  WG (Oct 2025, backed by Cloudflare/Google/AWS/Akamai/Vercel/GoDaddy) — cryptographically
  tying bot/agent traffic to an **accountable operator/origin.** [S12]
- **Relevance to PACT.** The IETF's "keep humans in the loop" gap and **Web Bot Auth**'s
  operator-accountability are the *closest the standards world comes* to PACT's human
  rooting — but both root in an **operator/origin**, not a **scarce human with a capped
  identity budget.** **(inference; Web Bot Auth detail from [S12], not corroborated by a
  second source in this review — treat as directional, not definitive.)**

---

## 2. The comparison matrix

| Protocol | Identity anchor | Human-scarcity / per-human cap? | Wire format | Discovery | Trust/auth | Reach/propagation gating | Governance |
|---|---|---|---|---|---|---|---|
| **PACT** | **Scarce human root** (one-human-one-root) → personas | **YES — cap on EFFECTIVE presence (INV-12)** | Custom signed PACT frame + Claim/premise DAG | (undefined in spec) | DIRECT vs CONSENSUS trust + disjoint cross-verify | **By VERIFICATION strength (INV-9)** | (undefined) |
| A2A | Self-declared Agent Card | No | JSON-RPC 2.0, Task/Artifact | `/.well-known/agent.json` | OAuth2/mTLS/OIDC/API-key | n/a (no propagation model) | Linux Foundation |
| MCP | Token (DID optional) | No | JSON-RPC 2.0 | static/manual | token; user-consent gate | n/a (tool boundary) | Anthropic |
| ACP | Agent Detail manifest | No | REST, multipart MIME | central registry | Bearer/mTLS/JWS, DID | n/a | Linux Foundation (IBM) |
| AGNTCY | **Org-issued VC "badge"** | No (org can mint ∞) | OASF (OCI) + SLIM | Agent Directory | VC provenance, cryptographic | n/a | Linux Foundation |
| ANP | **DID-native, self-sovereign** | **No — endorses multi-identity** | JSON-LD + ADP | search-engine crawl `.well-known` | DID public-key | n/a | Community / W3C CG |
| Agora | self-named (none) | No | NL / routines / PD-by-hash | PD fetch by content hash | **none** | academic |
| LOKA | DID per agent (SSI) | No | intent-centric (proposed) | UAIL | DID + VC + PQ-crypto + ethical consensus | n/a | academic |
| FIPA-ACL / KQML | AID / string name | No | typed performatives (~20) | facilitator/broker | none (platform-assumed) | FIPA / DARPA (legacy) |

Sources for the row data: PACT = local spec; others = [S1]–[S12a] as cited in §1.

---

## 3. The four pressure-test answers

### Q1 — Does ANY existing A2A protocol anchor in human scarcity? Is PACT's human-rooting a real differentiator or a known dead-end?

**Finding: No mainstream A2A protocol anchors in human scarcity. PACT's human-rooting is a
genuine, defensible differentiator — but it is differentiating *into a problem the field
has deliberately walked away from*, and PACT inherits all of that problem's unsolved core.**

- **Every protocol surveyed treats the agent (ANP, LOKA, A2A, Agora, FIPA) or at most the
  organization (AGNTCY) as the identity root.** ANP goes furthest in the *opposite*
  direction: it *endorses* a "multi-identity strategy" with no per-human limit [S8] — the
  precise pattern PACT's L11/INV-12 cap is built to defeat.
- **The closest analogs** are (a) AGNTCY's org-issued badges with verifiable *provenance*
  [S7b][S7c], and (b) IETF Web Bot Auth's operator-accountability [S12]. Both root in an
  *accountable principal* — but **neither is scarce.** An org or operator can mint
  unlimited identities. PACT's distinctive move is binding the budget to a **scarce**
  principal (a human). **No surveyed protocol does this.**
- **Is it a dead-end?** Partially. The 2026 threat-model survey [S6] confirms the *cost*
  of the field's choice — every self-sovereign protocol has a named **impersonation /
  naming-collision / no-uniqueness-enforcement** weakness, and **Sybil resistance is
  absent across the board** (MCP "no uniqueness enforcement"; A2A "no global uniqueness";
  Agora "duplication not prevented"; ANP DID-strong-but-not-Sybil-bounded). PACT is
  *correct* that this is the field's open wound. **But PACT's own spec concedes (U1) that
  one-human-one-root "is the irreducible hard problem" requiring a "real-world identity
  anchor."** The field didn't ignore human-rooting out of ignorance; it walked away
  because the anchor brings *centralization, privacy, and exclusion* costs (the very
  tradeoffs PACT's U1 names). **PACT's honesty here is its strength** — it localizes the
  unsolved core to one layer and claims *containment, not elimination* — but it should not
  be sold as "we anchor in humans and they don't"; it should be sold as "**we make the
  Sybil cost a budgeted, bounded, auditable quantity instead of zero**," which the matrix
  shows is unique. **(inference, strongly supported by [S6][S8] and PACT §1/U1.)**

### Q2 — What does PACT's frame (§2) / FSM (§4) do that's novel? What does it OMIT that the field considers mandatory?

**Novel / better than table-stakes:**

1. **`PREV_HASH` hash-chaining the frame into a tamper-evident audit log at the wire
   level** (§2, §7). A2A/ACP/MCP sign messages but do **not** chain every frame into an
   append-only ledger as a *protocol invariant*. PACT's "all trust + verification computed
   from the auditable record, not hearsay" (INV-10) is a real structural commitment the
   field lacks. **(inference vs. [S1][S4][S5].)**
2. **Payload-as-Claim with premise refs and falsification-propagation** (§3). **No
   surveyed protocol models content as a conditional, scope-bounded, falsifiable claim
   DAG.** Tasks/Artifacts (A2A), MIME parts (ACP), tool results (MCP) are all
   truth-neutral blobs. This is PACT's deepest genuine novelty.
3. **`VRFY` as a *per-frame, binary integrity* flag explicitly separated from honesty**
   (§4) — the wire-level enforcement of INV-1 (P1≠P2). The field conflates these
   constantly (Agora's hash check *is* L5 in the wild [S10a]).

**Omitted, and the field treats these as mandatory:**

1. **Capability / skill discovery.** A2A's **Agent Card**, ACP's **Agent Detail**, ANP's
   **ADP**, AGNTCY's **OASF** — *every* modern protocol ships a structured capability
   descriptor at a well-known endpoint. **PACT §2 has no Agent Card analog and no
   discovery story at all.** This is the single largest table-stakes omission. [S1][S5][S7a][S8]
2. **Content negotiation / typed media.** ACP's MIME-typed multipart and A2A's
   Artifact/Part typing are considered baseline for multimodal agents (the IETF lists
   multimodality as a core gap [S12a]). PACT's `PAYLOAD` is untyped beyond "Claim."
3. **Versioning / extension negotiation.** A2A has `A2A-Version` semantics and an
   `extensions` mechanism [S3]; ANP/Agora negotiate protocols dynamically [S8][S10a].
   PACT's frame has a bare `VER` byte with **no negotiation or extension story.**
4. **Typed message intent (speech acts).** FIPA standardized ~20 performatives +
   interaction protocols (Contract-Net etc.) [S9b]. PACT collapses intent into a generic
   `EXCH`/`Claim`. For *coordination* (the "C" in PACT) this is a real gap — there is no
   `cfp`/`propose`/`accept` vocabulary, no negotiation FSM beyond connection liveness.
5. **Async task lifecycle.** A2A models `INPUT_REQUIRED` / `AUTH_REQUIRED` / long-running
   task states [S3]; ACP tracks run-state [S6a]. PACT's FSM models only the *connection*
   (`ESTABLISHED → FIN`), not the *work*. For multi-step agent coordination this is
   under-specified.

### Q3 — What specific, concrete mechanisms should PACT BORROW?

1. **Agent Card at `/.well-known/` (from A2A/ANP/AGNTCY).** Adopt a discovery descriptor
   — persona public key, parent-human-root hash, declared scopes, supported claim types,
   security schemes. This is the cheapest highest-value borrow; PACT has nothing here.
   [S1][S3][S8]
2. **Agora's content-addressed Protocol Documents (PD-by-hash).** PACT already hash-chains
   its log; extend the same content-addressing to *protocol/claim-schema identity* so two
   agents can agree on a claim schema by hash with no central registry. Cleanly composes
   with PACT's existing hashing. [S10a]
3. **A2A's richer task-lifecycle states (`INPUT_REQUIRED`, `AUTH_REQUIRED`, terminal
   set).** Fold these *under* `EXCH` so PACT can model long-running, human-gated
   coordination — directly serving PACT's "keep the human accountable" intent. [S3]
4. **FIPA typed performatives for the coordination layer.** Reuse the speech-act
   vocabulary (`request`/`propose`/`accept`/`cfp`/`refuse`) rather than re-deriving a
   thinner one. Map each performative to a Claim subtype. [S9b]
5. **Standard security schemes (OAuth2/mTLS/OIDC) for the P1 transport.** PACT §2 already
   says P1 is `[SOLVED]` on mTLS/PKI — adopt A2A/ACP's *exact* `securitySchemes` shape so
   PACT P1 is wire-compatible with the incumbents instead of bespoke. [S1][S3][S4]
6. **MCP's explicit "inputs/descriptions are untrusted; require user consent" boundary
   discipline** as the codified statement of PACT's P1/P2 split at the tool edge. [S2c]
7. **Verifiable Credentials (AGNTCY/LOKA/ANP) as the carrier for `σ_root` and persona
   provenance.** PACT's `σ_root` and `built_by/graded_by` provenance map cleanly onto the
   W3C VC + JSON-LD machinery the field has standardized — don't invent a new credential
   format. [S7b][S8][S11a]

### Q4 — What in PACT is reinventing a wheel that already has a mature standard?

1. **The PACT frame as a bespoke binary wire format.** JSON-RPC 2.0 (A2A, MCP) and REST +
   multipart MIME (ACP) are the two mature, deployed choices [S3][S4][S5]. A new
   custom frame layout (`VER|TYPE|SRC|...`) is effort the field has already spent —
   **carry PACT's *semantics* (Claim DAG, PREV_HASH, VRFY-flag) as a payload/extension on
   JSON-RPC or HTTP, not as a from-scratch frame.**
2. **The session FSM (§4).** `CLOSED → ESTABLISHED → TEARDOWN` over signed frames is
   ~mTLS + a signed-log session. The connection-liveness FSM is fully solved; PACT should
   *consume* TLS sessions, not re-specify them. [S1][S3]
3. **Message-intent flags (`INIT/ACK/EXCH/VRFY/FIN`).** A thinner re-derivation of FIPA
   performatives [S9b] *and* of TCP/TLS handshake states. Reinventing both at once.
4. **Identity keypair-per-persona + signed messages.** This is exactly DID-method
   territory (ANP's `did:wba`, LOKA's UAIL, AGNTCY badges) [S7b][S8][S11a]. PACT's
   *novel* part is the **human-root parent + cap**; the *keypair-per-persona-signs-frames*
   part is a solved DID/VC problem PACT should adopt wholesale and bolt its scarcity
   anchor on top of.
5. **Append-only hash-chained signed log (§7).** A solved primitive (PACT itself tags it
   `[SOLVED]`); just confirming it's a reuse, not a build.

**Net:** PACT's reinvention risk is concentrated entirely in the **transport tier (§2/§4)
and the bare identity-keypair plumbing** — all of which the field has matured. PACT's
**genuine, unreplicated contributions** are the **Claim/premise DAG (§3), verification-gated
reach (§6.3), the DIRECT-vs-CONSENSUS asymmetric trust engine (§5), and the human-scarcity
cap (§1)** — none of which any surveyed protocol has.

---

## 4. The single biggest borrow, and the single biggest risk

- **Biggest borrow:** an **Agent-Card-style discovery descriptor at a well-known endpoint**
  (A2A/ANP/AGNTCY). PACT cannot be a *network* protocol without a discovery story, and the
  field has converged on exactly one pattern. It is cheap, composes with PACT's hash-chain,
  and closes PACT's largest table-stakes gap. (Honorable mention: Agora's PD-by-hash for
  schema agreement — it is the most *philosophically aligned* borrow.)

- **Biggest risk/gap:** **PACT spends its entire novelty budget on the transport/identity
  tier that the field has already solved, while the genuinely novel and unsolved tiers
  (Claim-DAG, verification-gated reach, human-scarcity cap) sit on an `[OPEN]` foundation
  (U1) that PACT itself admits it cannot close.** Concretely: (a) PACT has **no discovery
  layer**, which every incumbent treats as mandatory; (b) PACT's human-root (U1) is the
  one thing differentiating it, yet it is also the one thing PACT marks unimplementable —
  so the differentiator is also the dependency. If PACT rebuilds A2A's wire layer instead
  of *extending* it, it will ship a worse transport *and* still owe the U1 anchor. The
  defensible path is the inverse: **adopt A2A/ANP transport + DID/VC identity wholesale,
  and spend the entire build on §3/§5/§6 + the §1 cap — the parts that are actually new.**

---

## Sources

- [S1] IBM — "What Is Agent2Agent (A2A) Protocol?" https://www.ibm.com/think/topics/agent2agent-protocol
- [S2] Galileo — "Google's Agent2Agent Protocol Explained." https://galileo.ai/blog/google-agent2agent-a2a-protocol-guide
- [S3] A2A Protocol Specification (a2a-protocol.org). https://a2a-protocol.org/latest/specification/
- [S2a] Anthropic — "Introducing the Model Context Protocol." https://www.anthropic.com/news/model-context-protocol
- [S2b] Model Context Protocol — Specification (2025-11-25). https://modelcontextprotocol.io/specification/2025-11-25
- [S2c] (MCP security/trust-boundary text, via the modelcontextprotocol.io specification and Anthropic engineering pages.) https://modelcontextprotocol.io/specification/2025-11-25
- [S4] WorkOS — "IBM's Agent Communication Protocol (ACP): A technical overview." https://workos.com/blog/ibm-agent-communication-protocol-acp
- [S4a] IBM — "What is Agent Communication Protocol (ACP)?" https://www.ibm.com/think/topics/agent-communication-protocol
- [S4b] ACP GitHub (i-am-bee/acp). https://github.com/i-am-bee/acp
- [S5] "A survey of agent interoperability protocols: MCP, ACP, A2A, and ANP" (arXiv 2505.02279). https://arxiv.org/html/2505.02279v1
- [S6] "Security Threat Modeling for Emerging AI-Agent Protocols: MCP, A2A, Agora, and ANP" (arXiv 2602.11327). https://arxiv.org/abs/2602.11327 · HTML: https://arxiv.org/html/2602.11327v2
- [S6a] Identity/format detail per the interoperability survey table (arXiv 2505.02279). https://arxiv.org/html/2505.02279v1
- [S7] VentureBeat — "A standard, open framework for building AI agents… Cisco, LangChain and Galileo." https://venturebeat.com/ai/a-standard-open-framework-for-building-ai-agents-is-coming-from-cisco-langchain-and-galileo
- [S7a] AGNTCY Documentation. https://docs.agntcy.org/
- [S7b] AGNTCY — Agent Badge / Verifiable Credentials. https://docs.agntcy.org/identity/vc_agent_badge/ · https://docs.agntcy.org/identity/credentials/
- [S7c] AGNTCY Identity (GitHub). https://github.com/agntcy/identity
- [S8] Agent Network Protocol White Paper (W3C CG draft). https://w3c-cg.github.io/ai-agent-protocol/
- [S9] Wikipedia — "Agent Communications Language." https://en.wikipedia.org/wiki/Agent_Communications_Language
- [S9a] "Agent Communication Languages Comparison: FIPA-ACL and KQML." https://www.academia.edu/88620133/Agent_Communication_Languages_Comparison_Fipa_Acl_and_KQML
- [S9b] DigitalOcean — "Agent Communication Protocols Explained" (FIPA-ACL fields + performatives, KQML, facilitator). https://www.digitalocean.com/community/tutorials/agent-communication-protocols-explained
- [S10] Hugging Face / arXiv — "A Scalable Communication Protocol for Networks of Large Language Models" (Agora; Marro et al.). https://arxiv.org/abs/2410.11905
- [S10a] Agora paper (full text, PD-by-hash + trust-absence). https://arxiv.org/html/2410.11905v1
- [S11] LOKA Protocol (arXiv abstract). https://arxiv.org/abs/2504.10915
- [S11a] LOKA Protocol (full text — UAIL/SSI/DID/VC, ethical consensus). https://arxiv.org/pdf/2504.10915v2
- [S12] W3C AI Agent Protocol Community Group. https://www.w3.org/community/agentprotocol/ · (Web Bot Auth IETF WG context) https://www.ietf.org/blog/agentic-ai-standards/
- [S12a] IETF — "Agentic AI communications: Identifying the standards we need." https://www.ietf.org/blog/agentic-ai-standards/

### Source-quality caveats (research-mode honesty)

- The **A2A spec** [S3] and **interoperability survey** [S5] are primary/peer-style and the
  backbone of this review. The **threat-model survey** [S6] PDF would not decompress; its
  findings here come from the HTML rendering [S6/S6a] + the search-result abstract —
  directionally reliable, but I did not read the raw PDF tables firsthand.
- **FIPA-ACL/KQML** field lists [S9b] are corroborated against the well-known FIPA standard
  shape but were extracted from a tutorial, not the FIPA spec PDFs (which failed to fetch).
  The field names are standard and cross-checked against [S9][S9a]; treat exact-count
  ("~20") as approximate.
- **Web Bot Auth / IETF operator-accountability** [S12] is from a single source in this
  review and is marked directional, not definitive.
- Vendor blogs (IBM, Galileo, WorkOS, VentureBeat) are used for *capsule* facts only;
  every load-bearing contrast (identity model, Sybil/uniqueness, human-rooting) is anchored
  to a spec, white paper, or peer survey.
