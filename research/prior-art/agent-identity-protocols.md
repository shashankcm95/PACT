---
title: "Prior-Art Review — Agent Identity Protocol (AIP) vs. PACT's Identity Boundary (§1/§2)"
lens: "Agent identity / principal-binding / delegation standards — deepening the IDENTITY-BOUNDARY thread"
date: 2026-06-21
lifecycle: persistent
status: research / proto-planning input
scope: >
  Evaluates the "Agent Identity Protocol (AIP)" family of IETF drafts as a concrete
  competing/complementary standard for PACT's §1 identity model and §2 frame boundary.
  Decides INTEGRATE vs OVERLAP-with-DID/VC vs PARTIAL/OUT-OF-SCOPE, and answers the U1
  question: does AIP anchor in HUMAN scarcity, or relocate the Sybil throne to the issuer?
builds-on: research/prior-art/a2a-protocols.md (the DID/VC + Agent Card recommendation)
---

# Prior-Art Review: Agent Identity Protocol (AIP) vs. PACT

> **Research-mode discipline.** Every factual claim about AIP carries a bracketed source
> `[A#]` resolving to the Sources section, and is drawn from a firsthand fetch of the
> spec text (not memory). Where I reason beyond a source I mark it **(inference)**. PACT
> design is quoted from `PACT-spec.md` (§1, §2, §9-U1). The prior A2A recommendation is in
> `research/prior-art/a2a-protocols.md`.

---

## 0. The naming trap — "AIP" is THREE different drafts (read this first)

The single most important thing to get right before comparing: **"Agent Identity Protocol
(AIP)" is not one spec.** There are at least three *independent* IETF Internet-Drafts, by
different unaffiliated authors, all claiming the name and acronym, with *materially
different identity models*. Conflating them produces a wrong verdict. Verified firsthand
via the IETF datatracker [A5][A6]:

| Draft | Author / affiliation | Identity model | GitHub / site | Latest rev |
|---|---|---|---|---|
| **`draft-aip-agent-identity-protocol`** | J. Cao (Montcao) + C. Arango Gutierrez (**NVIDIA**) | **Registry-issued UUID** Agent ID + signed "AIP Token"; **enforcement proxy** | `agentidentityprotocol.io` / `openagentidentityprotocol` repo [A2][A8] | -00, 16 Mar 2026 [A1][A5] |
| **`draft-singla-agent-identity-protocol`** | P. Singla (**Independent**, inviscel.com) | **`did:aip`** self-derived DID + **W3C-DID-rooted principal** + multi-hop **delegation chain** | none linked [A6] | -03, 9 Jun 2026 [A3][A6] |
| **`draft-prakash-aip`** | Prakash | "Verifiable Delegation for AI Agent Systems" (not fetched in depth) | — | -00 [A7] |

- The IETF URL the proto-planning prompt pointed at — `draft-aip-agent-identity-protocol-00`
  [A1] — is the **Cao/NVIDIA registry-proxy** flavor. Its own text says "A Go proxy
  implementation is available at the working group's GitHub repository" and references
  `https://agentidentityprotocol.io` [A5] — so **the GitHub repo
  `openagentidentityprotocol/agentidentityprotocol`** (v0.1 "Localhost Proxy", AAT/AID
  terminology, no `did:aip`, no W3C DID) [A2][A8] is the **Cao** spec's implementation, NOT
  the Singla `did:aip` one. I confirmed this firsthand: the repo README describes an "Agent
  Authentication Token (AAT)" + "Agent Identity Document (AID)" registry-signs-certificates
  model and **does not mention W3C DIDs or `did:aip`** [A2].
- The **Singla** draft [A3] is the one that *looks most like* what a "DID-native agent
  identity with principal delegation" should be — and is therefore the **most directly
  comparable to PACT §1**. I treat it as the primary comparison and call out where the Cao
  flavor differs.

**Maturity verdict up front (so it colors everything below):** *all three* are **individual
Internet-Drafts with explicitly "no formal standing in the IETF standards process," "not
endorsed by the IETF," "(No stream defined)"** [A5][A6]. **None has been adopted by any IETF
working group.** The phrase "the working group's GitHub repository" in the Cao draft [A5] is
**aspirational/misleading** — there is no working group; it is an individual submission. An
IETF `-00` is one person (or a tiny team) posting a document; it is *not* consensus, *not* a
standard, and confers no interoperability guarantee. (Same status discipline the A2A report
applied to ANP/LOKA arXiv papers.)

---

## 1. What AIP actually is (firsthand extraction)

### 1.1 Identity model — what IS an agent identity, and how is it minted

**Singla `did:aip` flavor [A3] (the DID-native one):**
- An agent identity is a **W3C Decentralized Identifier** under a new method `did:aip`.
  > "An AID is derived deterministically from the agent's Ed25519 public key... Compute
  > SHA-256(base64url_decode(x)) ... Hex-encode the hash (lowercase) to form the agent-id."
  Structure: `did:aip:<namespace>:<32-hex-agent-id>` [A3, §4.2].
- It is therefore a **self-certifying / cryptographically self-derived** identifier — *not*
  issued by an authority: "possession of the private key is both necessary and sufficient to
  claim ownership of the AID" [A3, §4.2]. This is the **`did:key` pattern** (an identifier
  that *is* a hash of its own public key) with a bespoke method name.
- The runtime credential is a **JWT** ("Credential Token") presented to Relying Parties,
  carrying `aip_chain` (the delegation hops), `aip_scope` (capabilities), `sub`/`iss` [A3,
  §5.4-5.5]. Signing of non-JWT objects uses **RFC 8785 JCS canonical JSON**; Tier-2 uses
  **DPoP (RFC 9449)** proofs [A3].

**Cao/NVIDIA registry-proxy flavor [A1][A5] (the GitHub one):**
- An agent identity is a **registry-assigned UUID v4 prefixed with the registry hostname**,
  e.g. `reg.example.com/01933f4a-...` [A5, §4-5]. It is **issued by a registry at
  registration time**, not self-derived — the opposite minting model from Singla.
  > "An agent is provisioned by its principal submitting a registration request to an AIP
  > Registry. The request MUST include ... the agent's public key. The registration request
  > MUST be authenticated." [A5, §5.1]
- The runtime credential is an **"AIP Token"** (base64url JSON, EdDSA-signed: `agentId`,
  `tool`, `argumentsHash`, `nonce`, `timestamp`) carried in an `AIP-Token:` HTTP header or a
  `_aip` field on MCP stdio JSON-RPC [A5, §6].

**Bottom line on §1.1:** the Singla flavor is **DID/VC-shaped** (a `did:`-method + JWT/VC
credential); the Cao flavor is a **registry-IAM-shaped** (issuer mints a UUID + a bearer
token, mediated by an enforcement proxy). Neither invents a fundamentally new crypto
primitive — both are Ed25519 + signed tokens (the same primitives PACT §2 `SIG` and the
Power Loom `edge-attestation.js` already use).

### 1.2 Principal binding — does AIP bind an agent to a human/org principal?

**This is AIP's headline feature and its strongest contribution.** Both flavors bind an
agent to an accountable principal — and the Singla flavor does it more rigorously than DID/VC
alone does:

**Singla [A3]:**
> "Every AIP delegation chain MUST have a verifiable principal at its root. Principals are
> identified by W3C DIDs, but NOT by `did:aip` (which is reserved for agents)." [A3, §5.5]
> "principal.id MUST be a valid W3C DID; pattern: any valid DID method and suffix ... MUST
> NOT use did:aip method." [A3, §5.5]
- The principal carries a typed field: `principal.type ∈ {"human","organisation"}` [A3, §5.5].
- The binding is **a cryptographic delegation chain**: a `Credential Token` carries an
  `aip_chain` array of signed `Principal Token` JWTs, each hop signed by the delegating
  AID's private key, tracing back to the root principal DID [A3, §5.4-5.10]. This **is** a
  real multi-hop delegation primitive (principal → agent → sub-agent), with rules:
  - D-1 child cannot grant looser constraints than its own manifest (attenuation-only);
  - D-2/D-3 depth bounded by the root's `max_delegation_depth`;
  - D-5 each hop signed by the delegated-by AID [A3, §5.10].

**Cao [A5]:**
> The principal is "The human operator or organization accountable for an agent." [A5, §5]
> The Agent Record stores `principalId (string): Identifier of the accountable principal.`
- But principal authentication is **explicitly unfinished**: the principal identifier is
  "a string that uniquely identifies the accountable human or organization (e.g., an email
  address, an organization slug, or an OAuth subject claim); **(TO BE WORKED ON FURTHER)**"
  [A5, §5.1]. It is **asserted, not rooted** — the registry is not required to verify the
  principal's claimed identity against any authoritative source [A5, §5.1-5.2].

**This maps directly onto PACT's `Persona.parent = human_uid` (§1).** AIP's
`agent → principal` edge is the same shape as PACT's `Persona → HumanRoot` edge. The Singla
delegation chain is *richer* than PACT's single `parent` pointer — PACT has no multi-hop
sub-delegation primitive, no attenuation-only depth rules, no `aip_chain`. **(This is the one
thing AIP gives PACT that bare DID/VC does not — see §3.)**

### 1.3 Lifecycle, delegation, revocation, authz, discovery

**Singla [A3]:** revocation has four typed verbs — `full_revoke`, `scope_revoke`,
`delegation_revoke`, `principal_revoke` — checked via a **CRL** (periodic Tier-1 / real-time
Tier-2) [A3, §5.7]. Discovery: DID resolution `GET /v1/agents/{aid}` + a well-known endpoint
`/.well-known/aip-registry` [A3]. Authz: `Capability Manifest` + registry-stored **Capability
Overlays** (attenuation-only, CO-1) + **Chained Approval Envelopes** for pre-authorized
multi-step workflows [A3, §5.11, §12]. Engagement objects: proposed → active →
completed/terminated/suspended.

**Cao [A5]:** revocation is a `DELETE /v1/agents/{agentId}` → status `revoked` + an **SSE
revocation event**; proxies reject with `AIP-E012` and cache agent records ≥30s [A5].
Authz is the **enforcement proxy + declarative AgentPolicy (YAML)**: tool allowlist,
per-arg regex validation, DLP scanning, and **human-in-the-loop (HITL) gates** for sensitive
ops [A5, §7]. Discovery: `GET /v1/agents/{agentId}` [A5].

**Note the convergence with the A2A report's recommendation:** AIP (both flavors) puts its
descriptor at **`/.well-known/`** [A3][A5] — exactly the Agent-Card pattern the A2A report
named as PACT's single biggest borrow. AIP is one more data point that the field has
converged on `/.well-known/` discovery.

### 1.4 Transport / message format — does it overlap PACT §2's frame?

**Partially, and it's a *better-trodden* version of the same idea, but it is NOT a frame.**
- AIP does **not** define a bespoke binary wire frame like PACT §2. It rides **existing
  transports**: an HTTP header (`Authorization: AIP <token>` / `AIP-Token:`) or an MCP
  JSON-RPC `_aip` field [A3][A5]. This is exactly the A2A report's recommendation —
  *carry identity as a payload/extension on JSON-RPC/HTTP, not a from-scratch frame.*
- The AIP **Token** overlaps PACT §2's per-message `SIG` + `SRC_PERSONA` + `parent HUMAN_UID`
  fields: it is a signed envelope binding (agent-id, action, principal/chain). It does **not**
  overlap PACT's `PREV_HASH` hash-chain-into-audit-log (INV-10) — **AIP has no append-only
  per-message ledger invariant** (it has CRLs and audit logging at the proxy, but not PACT's
  "every frame chains into a tamper-evident log" structural commitment). **(inference from
  the absence of any PREV_HASH-equivalent in [A3][A5]).**
- AIP has **nothing** at PACT's §3 layer — no Claim/premise DAG, no scope, no
  falsification. AIP's "scope"/"capability" is *authorization* (which tools may I call), a
  completely different axis from PACT's *epistemic* scope (domain of validity of a premise).
  This is the clean line: **AIP = authorization & accountability of actions; PACT §3+ =
  grounding & truth of claims.** They do not overlap; they stack.

---

## 2. The DECISION

### 2.1 The U1 question (most important): does AIP anchor in HUMAN scarcity?

**Verdict: NO. AIP does not anchor in human scarcity. It relocates the Sybil throne to the
issuer/principal exactly as the rest of the field does — and in the Cao flavor, leaves even
the principal's identity an unverified asserted string.** This is decisive and well-sourced.

The evidence, quoted:

1. **No cardinality limit, both flavors.**
   - Singla: "The specification contains **no quantitative limit** on agents per principal."
     The only uniqueness check is per-key: "identity.aid MUST NOT already exist in the
     Registry" [A3, §6.2] — i.e. each *new keypair* is a *new* agent. "A principal may mint
     **unlimited agents** so long as each receives a unique key material" [A3]. The
     `aip_chain` `maxItems: 11` [A3, §5.4] bounds delegation **depth** (how many hops in a
     chain), **not** the number of agents a principal may directly mint — a critical
     distinction the spec's own structure makes.
   - Cao: "**No quota, no 'one principal per identity' anchor.** A principal can repeatedly
     call `POST /v1/agents` to create unlimited agent instances." [A5, §5]

2. **The principal's OWN identity is not scarcity-rooted.**
   - Singla: "The specification contains **no human-scarcity or proof-of-personhood
     requirement**. Any W3C DID is accepted at face value. No mechanism is defined to verify
     that a `did:web` or `did:key` principal is authentic" [A3, §5.5]. The `principal.type:
     "human"` enum exists but "**no verification mechanism** [confirms] the claimed type is
     authentic" [A3, §5.5].
   - Cao: the principalId is "(TO BE WORKED ON FURTHER)" and "**asserted, not rooted or
     verified**" [A5, §5.1].

3. **The security model does not even contemplate Sybil.** The Cao draft's §9 Security
   Considerations names exactly one threat: "The principal threat model for AIP at Layer 2
   is the **prompt injection attack**." It "**does not address Sybil attacks, identity
   proliferation, or impersonation** ... no discussion of preventing malicious principals
   from registering multiple agents" [A5, §9].

**What this means for PACT precisely:** AIP answers a *different* question than U1. AIP's
contribution is **accountability and authorization** — "*which* accountable principal is
behind this agent, and *what* is this agent allowed to do" — with a verifiable cryptographic
chain from action → agent → principal. That is genuinely valuable. But it presupposes the
principal as a *given, trusted, unmetered* root. **It moves the Sybil problem from the agent
to the principal and then stops** — precisely the "relocate the throne to the issuer" failure
mode the prompt flagged, and the same pattern the A2A report found in AGNTCY (org can mint ∞
badges [a2a-report §1.4]) and ANP (endorses multi-identity [a2a-report §1.5]). AIP is
**AGNTCY-with-delegation**: it adds a real principal→agent→sub-agent chain, but the root of
that chain is still an *unmetered, possibly-unverified* DID, not a *scarce* human.
**AIP does NOT help PACT's U1.** PACT's U1 (one-human-one-root + a cap on effective presence,
INV-12) remains exactly as `[OPEN]` and exactly as much PACT's own burden as before — AIP is
not a candidate solution to it. **(This is the load-bearing finding.)**

### 2.2 INTEGRATE vs OVERLAP vs PARTIAL

**Verdict: PARTIAL — and where it overlaps DID/VC, it IS DID/VC (so the prior DID/VC pick
stands); where it adds something, that something is the *delegation chain*, which is worth
adopting as a pattern, not as the spec.**

Decomposed against PACT's boundary layers:

| PACT layer | AIP relationship | Decision |
|---|---|---|
| **§1 agent identity = keypair** | Singla `did:aip` = `did:key`-with-a-name; Cao = registry-UUID. **Pure OVERLAP with the already-recommended DID/VC.** AIP `did:aip` is *strictly weaker* than `did:key`/`did:web` (a brand-new, unadopted method with one author vs. registered W3C methods). | **OVERLAP → keep DID/VC.** Do not adopt `did:aip`; it is a non-standard method that buys nothing `did:key` doesn't already give, and costs a dependency on a one-author `-00`/`-03` draft. |
| **§1 `Persona.parent = human_uid`** | AIP's `agent → principal` + the Singla **multi-hop delegation chain** (`aip_chain`, attenuation-only D-1..D-5). **This is the one place AIP > bare DID/VC.** | **PARTIAL / ADOPT-THE-PATTERN.** PACT should adopt a *delegation-chain* shape (principal → persona → sub-agent, attenuation-only, depth-bounded) — but model it itself / on a registered VC delegation profile, **not** by importing `draft-singla`. |
| **§2 frame / transport** | AIP rides HTTP/JSON-RPC, carries a signed token. **Reinforces the A2A report:** don't build a bespoke frame; carry identity as a token on JSON-RPC/HTTP. | **OVERLAP → confirms the A2A "drop the §2 frame" recommendation.** AIP is corroborating prior art, not a new borrow. |
| **§2 `PREV_HASH` audit ledger (INV-10)** | AIP has **no** per-message hash-chain. | **OUT-OF-SCOPE for AIP.** PACT keeps its own (Power Loom `transaction-record.js` already provides it). |
| **§3 Claim/premise DAG, §5 trust, §6 grounding/REACH** | AIP has **nothing** here. AIP "scope" = tool-authorization, orthogonal to PACT epistemic scope. | **OUT-OF-SCOPE.** AIP does not touch PACT's novel core — confirming the §5 build-vs-borrow inversion (spend the build here). |

**Is AIP a better drop-in than DID/VC?** **No.** For the *identity primitive* it overlaps
DID/VC and is a *weaker* choice (an unadopted single-author method/registry-IAM vs. the W3C
DID/VC machinery AGNTCY/LOKA/ANP already use [a2a-report §1.4-1.8]). For the *frame* it
re-confirms "use JSON-RPC/HTTP, not a bespoke frame." **The only axis where AIP beats bare
DID/VC is principal-delegation** — and there, the right move is to **adopt the *pattern*
(verifiable attenuation-only delegation chain), not the *spec*.**

### 2.3 What PACT should adopt from AIP, and what AIP does NOT solve

**ADOPT (as a pattern, not a dependency):**
1. **The verifiable, attenuation-only, depth-bounded delegation chain** (Singla `aip_chain` +
   rules D-1..D-5, CO-1 [A3, §5.10-5.11]). PACT today has a *single* `Persona.parent`
   pointer; real agent networks need **principal → persona → sub-agent** delegation where a
   child can only *narrow* (never widen) its parent's authority, and depth is capped. This is
   directly useful for PACT's "user authors the abstraction structure beneath the root"
   (§1/INV-12) — the abstraction tree *is* a delegation chain, and AIP shows the correct
   attenuation-only/depth-bound rules to make it safe. **Adopt the shape; bind it to PACT's
   cap so a wider tree never expands the budget.**
2. **Typed revocation verbs** (`scope_revoke` / `delegation_revoke` / `principal_revoke` vs.
   a single binary revoke [A3, §5.7]) — a clean, more expressive model than "revoke the key,"
   and it composes with PACT's INV-8 decay.
3. **Corroboration of two A2A-report borrows:** `/.well-known/` discovery and "identity-as-
   a-token-on-JSON-RPC, not a bespoke frame." AIP is independent prior art that the field has
   converged on these — *strengthens* the existing recommendation.

**AIP does NOT solve (PACT still must build / borrow elsewhere):**
- **U1 human-scarcity** — AIP explicitly does not; it relocates the throne and stops (§2.1).
  PACT's cap (INV-12) + pluggable root-issuance (Personhood Credentials et al., per the
  trust-report) remain entirely PACT's burden.
- **The epistemic layer** (§3 Claim/premise DAG, scope-as-domain-of-validity, FALSIFY) — AIP
  is an *authorization* protocol; it has no concept of a claim being *true* or *grounded*,
  only of an action being *permitted*. PACT's entire novel core is untouched.
- **The trust engine** (§5 DIRECT/CONSENSUS) and **verification-gated REACH** (§6.3) — AIP
  has no reputation/trust model at all (like ANP).
- **The audit ledger invariant** (INV-10 / `PREV_HASH`) — AIP logs at the proxy but has no
  per-message hash-chain-as-protocol-invariant.

---

## 3. One-paragraph integration note for the synthesis doc

AIP slots **underneath** PACT's §1, as a *candidate concrete profile* for the
agent↔principal binding — but it should be read as **"DID/VC + a delegation-chain pattern,"
not as a new standard to depend on.** The synthesis doc's §5 "ADOPT WHOLESALE: DID/VC" row
stands; AIP does **not** displace it (its `did:aip` method is weaker than `did:key`/`did:web`,
and all three AIP drafts are unadopted single-author `-00..03` Internet-Drafts with "no
formal standing" [A5][A6]). The one *additive* idea — a **verifiable, attenuation-only,
depth-bounded delegation chain from a rooted principal** — is worth folding into the P0
Boundary phase as the shape of PACT's "abstraction structure beneath the root" (§1/INV-12),
*provided the chain root is bound to PACT's scarce-human cap.* Without that binding, AIP is
the field's standard throne-relocation: a clean accountability/authorization layer that
**presupposes** the very scarcity anchor (U1) that is PACT's entire reason to exist.

---

## Sources

- [A1] IETF Internet-Draft — *Agent Identity Protocol: Agentic Authentication and Authorized Policy Enforcement* (`draft-aip-agent-identity-protocol-00`), J. Cao + C. Arango Gutierrez. https://www.ietf.org/archive/id/draft-aip-agent-identity-protocol-00.html (fetched firsthand 2026-06-21)
- [A2] GitHub — `openagentidentityprotocol/agentidentityprotocol` (the Cao-flavor reference impl: v0.1 "Localhost Proxy", AAT/AID, Apache-2.0). https://github.com/openagentidentityprotocol/agentidentityprotocol · README: https://raw.githubusercontent.com/openagentidentityprotocol/agentidentityprotocol/main/README.md (fetched firsthand 2026-06-21)
- [A3] IETF Internet-Draft — *Agent Identity Protocol (AIP): Decentralized Identity and Delegation for AI Agents* (`draft-singla-agent-identity-protocol-00`), P. Singla (Independent). https://www.ietf.org/archive/id/draft-singla-agent-identity-protocol-00.html (fetched firsthand 2026-06-21)
- [A4] (project site referenced by [A1]/[A5]) https://agentidentityprotocol.io — not fetched independently; cited via the draft text [A5].
- [A5] IETF Datatracker — `draft-aip-agent-identity-protocol` doc page (status: Active Internet-Draft (individual), "no formal standing," no WG adoption; authors Cao/Montcao + Arango Gutierrez/NVIDIA; -00 16 Mar 2026). https://datatracker.ietf.org/doc/draft-aip-agent-identity-protocol/ (fetched firsthand 2026-06-21)
- [A6] IETF Datatracker — `draft-singla-agent-identity-protocol` doc page (status: Active Internet-Draft (individual), "not endorsed by the IETF," "(No stream defined)," no WG adoption; author Paras Singla/Independent; revs 00-03, -03 dated 9 Jun 2026). https://datatracker.ietf.org/doc/draft-singla-agent-identity-protocol/ (fetched firsthand 2026-06-21)
- [A7] IETF Datatracker — `draft-prakash-aip` *Agent Identity Protocol (AIP): Verifiable Delegation for AI Agent Systems* (third independent same-named draft; noted for completeness, not analyzed in depth). https://datatracker.ietf.org/doc/draft-prakash-aip/
- [A8] Related same-name efforts surfaced in search (context only): `draft-drake-agent-identity-registry` (hardware-anchored federated registry), `draft-nelson-agent-delegation-receipts` (delegation receipts). https://datatracker.ietf.org/doc/draft-drake-agent-identity-registry/ · https://datatracker.ietf.org/doc/draft-nelson-agent-delegation-receipts/

### Source-quality caveats (research-mode honesty)

- **The "AIP" name is contested across ≥3 independent IETF drafts** [A1][A3][A7] plus adjacent
  efforts [A8]. I read the Cao [A1][A5] and Singla [A3][A6] drafts firsthand and treat Singla
  as the primary PACT comparison (DID-native + delegation). The Prakash draft [A7] I did not
  fetch in depth — flagged, not analyzed. A reader should confirm *which* "AIP" any future
  reference means.
- The GitHub repo [A2] corresponds to the **Cao** flavor (registry-proxy, AAT/AID, no
  `did:aip`), **not** the Singla `did:aip` spec — verified by reading the README firsthand.
  The Cao draft's phrase "the working group's GitHub repository" [A5] is inaccurate: there is
  **no IETF working group**; it is an individual submission.
- Section numbers in quotes (e.g. "§5.5", "§4.2") are as reported by the firsthand fetch of
  the draft HTML; exact numbering may shift across revisions (Singla is now at -03 [A6], I
  quoted -00). The *substance* (no cardinality limit; principal asserted-not-rooted; no Sybil
  in the threat model) is the load-bearing claim and is corroborated across both flavors.
- All maturity/status claims are anchored to the **IETF datatracker** [A5][A6] (authoritative
  for IETF document standing), not to vendor/project self-description.
