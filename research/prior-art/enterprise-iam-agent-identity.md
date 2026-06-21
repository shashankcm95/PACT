---
title: "Prior-Art Review — Enterprise IAM / CIAM AI-Agent-Identity offerings vs. PACT (the IDENTITY-BOUNDARY thread)"
lens: "Enterprise IAM/CIAM + non-human-identity (NHI) vendors for AI-agent identity"
date: 2026-06-21
lifecycle: persistent
status: research / proto-planning input
scope: >
  Deepens the IDENTITY-BOUNDARY thread. The prior pass (a2a-protocols.md) recommended
  PACT adopt DID/VC + an A2A Agent Card for its identity/transport boundary. This pass
  asks the orthogonal question: should PACT instead BUY that boundary from a major
  enterprise IAM/CIAM vendor's "AI agent identity" product (Okta/Auth0, Microsoft Entra
  Agent ID, IBM Verify, Palo Alto Idira) — or do those products solve a different problem
  and quietly relocate PACT's throne (L6) to a centralized IdP?
---

# Prior-Art Review: Enterprise IAM / CIAM AI-Agent-Identity vs. PACT

> **Research-mode discipline.** Every factual claim about a vendor carries a bracketed
> source `[S#]`. Where a load-bearing claim comes from a vendor *marketing* page I tag it
> **(MARKETING)**; where it comes from a vendor's own *technical docs / spec / standards
> repo* I tag it **(DOC)**. Where I reason beyond a source I mark it **(inference)**.
> Where I could not get a credible technical source I say so. PACT design is quoted from
> the local blueprint files (`PACT-spec.md`, `PACT-intent-and-landmines.md`) and the
> prior reports (`10-synthesis-and-recommendation.md`, `a2a-protocols.md`).
>
> **Fetch caveat.** IBM's two primary pages (`/solutions/agentic-ai-identity-management`,
> `/new/product-blog/agentic-ai-meets-identity-security-...`) returned **HTTP 403** to
> direct fetch; IBM substance below is reconstructed from search-engine extracts of those
> same pages + the IBM `/think/insights` NHI guide, and is flagged accordingly — it is
> **directionally reliable, not firsthand-read**.

---

## 0. Executive orientation (the one-paragraph answer)

The major enterprise IAM/CIAM vendors have, in 2025–2026, all shipped an "AI agent
identity" product (Okta for AI Agents / Auth0 for AI Agents, **Microsoft Entra Agent ID**,
**IBM Verify**, **Palo Alto Idira**), and underneath the marketing they are all the *same
category*: **non-human-identity (NHI) lifecycle + access management inside a single
enterprise trust domain.** They are genuinely good at — and PACT could genuinely borrow —
the **intra-domain plumbing**: issuance, lifecycle (create/rotate/revoke/decommission),
authn, least-privilege authz, **secrets/token vaulting**, audit, and **principal binding**
(every serious one binds an agent to an accountable human "sponsor/owner" and supports a
standardized **on-behalf-of / delegation** token flow built on OAuth 2.0 Token Exchange
**RFC 8693** [S6][S7][S10]). But on PACT's load-bearing axis — **the Sybil / one-principal-one-identity
question** — *not one of them addresses it*, and they cannot, **by construction**: each is
rooted in a **central issuer the org already trusts** (the Entra tenant, the Okta IdP, the
SPIRE trust-domain signing authority), and that issuer can **mint unlimited agent
identities**. Palo Alto's own NHI page omits Sybil entirely; SPIFFE's own spec literally
names the trust domain "**the root of trust**" with "**no external Sybil resistance
mechanism**" [S8a][S8b]. **Verdict on the throne (L6/L7): adopting any of these as PACT's
identity ROOT relocates PACT's throne to the vendor IdP — the exact move PACT exists to
refuse.** They are **INTEGRATE only as intra-node plumbing** (the agent↔tool/app boundary
*inside* one PACT node), **OVERLAP** on the patterns PACT was going to build anyway
(delegation tokens, lifecycle, vaulting), and **OUT-OF-SCOPE** as the *inter-node* root —
which is precisely the layer (U1 scarce human root + P2 cross-org epistemic trust) where
PACT's novelty lives. **Net-new ideas beyond "centralized IAM, now for agents": essentially
none on the trust axis; one genuinely useful borrowable pattern on the plumbing axis (the
sponsor-bound OBO delegation token).**

---

## 1. The category, precisely named

"AI agent identity" from these vendors is a sub-genre of **Non-Human Identity (NHI)
security** — the discipline of managing the machine identities (service accounts, API keys,
certs, workloads, bots, and now *agents*) that already outnumber humans in an enterprise by
a wide margin (Palo Alto cites "**as much as 100 to one**" and "autonomous agents outnumber
humans 82:1" **(MARKETING)** [S5a]; the NHI guides cite 25–50× **(MARKETING)** [S9]). The
category's job is **operational security and governance inside an enterprise that already
trusts its own issuer.** The standard NHI control set, per Palo Alto's own cyberpedia
**(DOC-ish — vendor reference page)** [S5b]:

- **Discovery/inventory** — CIEM + secrets-management tools auto-discover every machine
  identity across environments.
- **Lifecycle** — "Every NHI must have an assigned **'Owner' (a human or team)** and a
  defined purpose documented in a centralized registry"; onboarding → provisioning →
  governance → decommissioning.
- **Authn** — secrets (tokens, keys, certificates) "serve as proof of identity."
- **Authz / least-privilege** — remove standing privileges; convert "long-lived credentials
  into short-lived, ephemeral tokens."
- **Secrets vaulting** — "Centralize all non-human credentials into a secure, purpose-built
  vault that supports automated rotation."
- **Audit** — feed NHI access logs into SIEM/XDR.

**Critical category-level finding (load-bearing for PACT):** Palo Alto's NHI page **does
not address one-principal-one-identity, Sybil-resistance, or cryptographic uniqueness at
all** — "it assumes enterprises already trust their own issuers and focuses entirely on
managing identities *within* existing trust boundaries" [S5b]. That is the whole category's
implicit axiom, and it is the *exact axiom PACT's §1 / U1 reject.*

---

## 2. Per-vendor technical extraction

### 2.1 Microsoft Entra Agent ID (the most documented; the clearest mirror of PACT's gap)

Microsoft's docs are public and detailed (Microsoft Learn, **DOC**), so this is the
cleanest specimen of what the category actually does.

- **What an agent identity IS.** "Agent identities are **identity accounts within Microsoft
  Entra ID**" — a new directory object class, distinct from the service-principal
  application identity, designed "for scale and ephemerality rather than permanence"; an
  agent "might be created and destroyed thousands of times per day." [S6a] (DOC) Four new
  object types: **agent identity blueprint, blueprint principal, agent identity, agent
  user**; "Through the agent identity blueprint, the agent **can create one or more agent
  identities**." [S6b] (DOC)
- **Issuance.** Minted by the tenant — automatically by Copilot Studio / Foundry / Agent
  365, or in bulk: "Organizations can **create agent identities in bulk**, apply consistent
  policies to all agents, and retire agents without leaving orphaned credentials." [S6a] (DOC)
- **Lifecycle.** Full create / enable / disable / decommission via **Lifecycle Workflows**;
  access expires on a date unless the sponsor extends it. [S6b] (DOC)
- **Authn / authz.** Agents "request access tokens from Microsoft Entra" and use **OAuth 2
  delegated permission scopes** inherited from the blueprint; least-privilege via access
  packages, Microsoft Entra roles, Graph permissions; Conditional Access + ID-Protection
  risk evaluated before access. [S6a][S6b] (DOC)
- **Principal binding — STRONG and explicit.** Three access modes: **Autonomous** (rights
  given directly to the agent), **Delegated** ("Agents can act **on behalf of human
  users**, using access rights given to the user. The user has control over which rights
  are delegated"), and **Authenticate incoming messages** (verify the caller). [S6a] (DOC)
  Every agent has a **Sponsor** — "human users **accountable** for making decisions about
  its lifecycle and access"; "If the sponsor is leaving the organization, sponsorship … is
  **automatically transferred to their manager** … there's **always a human user
  accountable**." [S6b] (DOC) Foundry agents authenticate into **MCP and A2A** tools using
  the agent identity. [S6b] (DOC)
- **Sybil / uniqueness — ABSENT by construction.** The tenant is the issuer; the docs
  describe **bulk creation** and one-blueprint-to-many-identities as a *feature*. There is
  **no per-human cap on effective presence**, no one-principal-one-identity constraint —
  the only "accountability anchor" is the sponsor relationship, which is *org-internal
  attribution*, not a *scarcity bound*. (inference, strongly supported by [S6a][S6b])

### 2.2 Okta for AI Agents + Auth0 for AI Agents (the CIAM incumbent; the richest borrowable plumbing)

Okta acquired Auth0; the two now ship a combined "Identity for AI agents" stack. The
technical substance lives in three named mechanisms:

- **Token Vault (Auth0 / "Auth for GenAI").** **DOC** [S7a][S7b]: "Auth0 receives access
  and refresh tokens from the external provider and **stores them securely within Token
  Vault**"; built "on top of **OAuth 2.0 Token Exchange (RFC 8693)**"; lets an agent
  "**act on behalf of a specific user, ensuring that the agent only has the permissions
  that the user has granted**" while "your application does not need to store or manage any
  credentials." 30+ pre-integrated providers (GitHub, Slack, Google Workspace). **This is
  exactly the OBO/delegation + secrets-vault pattern, productized.**
- **Cross App Access (XAA) / ID-JAG.** **DOC** [S10a][S10b]: Okta's product name for
  **ID-JAG (Identity Assertion JWT Authorization Grant)**, an IETF OAuth WG draft ("Identity
  and Authorization Chaining Across Domains" = **RFC 8693 Token Exchange + RFC 7523 JWT
  Profile**). Three parties: requesting app, resource app, and **"the enterprise's IdP
  (which acts as the authorization broker and identity governance center)."** Flow: the
  agent requests an assertion from the IdP → "The IdP checks the IT security policies … Is
  this AI tool approved? Does this user's role allow AI access? If everything checks out,
  access is granted" → the IdP "issues a signed identity assertion JWT" signed "**with the
  same private key the IdP uses for regular SSO ID tokens**." [S10b] Principal binding is
  the whole point: tokens "contain the necessary context about **both the human user and
  the AI agent**, facilitating secure delegation and maintaining a clear audit trail."
- **Consumer-trust framing (CIAM).** Auth0's 2025 Customer Identity Trends Report
  **(MARKETING / survey)** [S7c]: "Consumers **don't trust AI agents** with their personal
  data, yet" — 70% prefer humans vs 16% AI; "**38% … human oversight of AI agents'
  decisions — is key to increasing trust**"; "**46% of all registration attempts are
  suspected attacks**." Useful as *motivation* (the field agrees human oversight is the
  trust unlock — echoes PACT's premise.creator coupling), but it is survey data, not a
  mechanism.
- **Sybil / uniqueness — ABSENT.** **"The IdP serves as the central system that manages
  access … through identity governance, policy-based authorization, and least privilege"**
  [S10b]. The enterprise IdP is, in Okta's own words, the **authorization broker and root
  of trust.** No uniqueness/Sybil constraint; the org provisions agents at will.

### 2.3 IBM Verify / "Agentic AI Identity Management" (directionally reconstructed — pages 403'd)

**Source caveat:** IBM's two canonical pages 403'd on direct fetch; what follows is from
search-engine extracts of those pages + IBM's `/think` NHI guide. Treat as directional. [S1][S2][S3]

- **What it provides.** IBM frames a **four-step approach (MARKETING)** [S2]: (1) **Discover
  all identities** (human, non-human, AI); (2) **identity observability** (real-time
  visibility into access flows/anomalies); (3) **enforce least-privilege** ("credential
  rotation, **runtime guardrails and human-in-the-loop controls for sensitive actions**");
  (4) **continuously monitor and audit** (behavioral drift, unauthorized access). The
  product (IBM Verify) "unifies identity governance, access management, privileged access,
  ITDR, and ISPM" **(MARKETING)** [S2].
- **Principal binding.** Search extract: integrate an IdP (IBM Verify) "by using **OAuth 2
  specifications to securely authenticate the human user before the agentic flow**," i.e.
  the same OBO/delegation framing [S3]. **Human-in-the-loop for sensitive actions** is the
  named accountability lever [S2]. (DIRECTIONAL — not firsthand-read.)
- **Lifecycle / vaulting / audit.** "Least-privilege … rotates credentials … automated
  credential lifecycle management … continuous trust validation for APIs, bots, service
  accounts, and AI agents" [S3] (DIRECTIONAL).
- **Sybil / uniqueness — ABSENT (no evidence of any).** Nothing in the reconstructable
  material addresses one-principal-one-identity. IBM is squarely in the "discover + govern
  NHIs inside the enterprise" lane. (inference)
- **Adjacent: AskIAM** — a *generative-AI assistant for doing IAM admin work*, not an
  agent-identity primitive; **OUT-OF-SCOPE** for PACT, noted only to disambiguate. [search]

### 2.4 Palo Alto Networks — Idira / NHI ("Securing AI agents" = privileged machine identity at scale)

- **What it provides.** **Idira** "extends identity security and privilege controls used for
  human and machine identities to … autonomous AI agents" **(MARKETING)** [S5a]. The
  technical control set is the standard NHI set in §1 [S5b] (DOC-ish). Idira "logs agents'
  actions and communications … audits showing **which human user initiated the agent, which
  AI agent identity acted, which tools ran and which resource was touched**" **(MARKETING)**
  [S5a] — i.e. **provenance/attribution**, the same as Entra's sponsor + XAA's audit trail.
- **Principal binding.** "On behalf of which user" attribution is explicit; binding is
  *attribution-grade* (who-initiated-this), consistent with the category. [S5a]
- **Sybil / uniqueness — ABSENT, explicitly.** Palo Alto's NHI definition page "**does not
  address** one-principal-one-identity, Sybil-resistance, or cryptographic uniqueness …
  focuses entirely on managing identities *within* existing trust boundaries" [S5b]. This is
  the single cleanest confirmation in the whole review of the category's blind spot.

### 2.5 SPIFFE / SPIRE (the open-standard substrate under "agent workload identity")

Not a vendor product but the open standard the others lean on for workload identity, and the
one PACT's prior synthesis flagged ("SPIFFE-style workload identity") — worth its own row
because its **spec is explicit where the marketing pages are silent.**

- **What it provides.** **DOC** (spiffe.io spec + GitHub standards) [S8][S8a][S8b]: each
  workload gets a **SPIFFE ID**; credentials are **SVIDs** (X.509 or JWT); the **SPIRE
  Server** is "**a central … server**" that performs **workload attestation** and **issues +
  auto-rotates** short-lived SVIDs; "Registration Entries … a database of **which workloads
  are allowed to run and what SPIFFE IDs they get**" — i.e. **the operator decides** what is
  registered. No long-lived secrets; built for ephemeral, machine-to-machine identity.
- **The throne is NAMED in the spec.** "The **trust domain is the authority component and
  the root of trust** that the identity belongs to … backed by an issuing authority with a
  set of cryptographic keys that serve as the **cryptographic anchor** for all identities …
  Every trust domain has at least one **signing authority**." [S8a] (DOC)
- **Sybil / uniqueness — ABSENT, and the spec says so.** "Trust domain names are nominally
  **self-registered** … there is no delegating authority that acts to assert and register a
  base domain name to an actual legal real-world entity. This self-registration approach
  means there is **no external Sybil resistance mechanism**." [S8b] (DOC) Within a domain,
  the operator can register arbitrarily many workloads/identities.
- **Why it matters for PACT.** SPIFFE is the *most honest* member of the category — it
  states plainly what the marketing pages hide: identity here is **operator-rooted, not
  scarcity-rooted.** It is the **best technical borrow for the intra-node "give each persona
  a rotating, attested, short-lived credential" plumbing** *and* the clearest illustration
  of why the category cannot be PACT's inter-node root.

---

## 3. The comparison matrix

| Vendor / standard | Agent-identity issuance | Lifecycle (create/rotate/revoke) | Authn | Authz / least-priv | Secrets/token vault | Audit | **Principal binding (human↔agent, OBO)** | **Sybil / one-principal-one-identity?** | **Root of trust** |
|---|---|---|---|---|---|---|---|---|---|
| **Microsoft Entra Agent ID** | Tenant mints (bulk; blueprint→N identities) [S6a] | Full, Lifecycle Workflows [S6b] | Entra tokens, OAuth2 [S6a] | Access packages, roles, Conditional Access [S6b] | (relies on Entra/Key Vault) | Entra logs, "acted as AI agent" [S6a] | **STRONG — Sponsor (always-accountable human) + Delegated OBO** [S6b] | **NO — no cap, bulk-mint is a feature** | **Entra tenant (central IdP)** |
| **Okta / Auth0 for AI Agents** | Org provisions via IdP [S10b] | Yes (token + agent lifecycle) [S7a] | OIDC/OAuth2 [S10b] | Policy-based, least-priv via IdP [S10b] | **Token Vault (RFC 8693)** [S7a] | XAA "clear audit trail" [S10b] | **STRONG — XAA/ID-JAG carries user+agent; OBO** [S10b] | **NO — IdP is the broker, no uniqueness** | **Enterprise IdP (Okta) — "authorization broker / root of trust"** |
| **IBM Verify** (directional) | Org provisions [S2] | "automated credential lifecycle" [S3] | OAuth2 [S3] | least-priv, runtime guardrails [S2] | credential rotation [S3] | observability + ITDR/ISPM [S2] | **OBO + human-in-the-loop for sensitive actions** [S2][S3] | **NO (no evidence)** | **Enterprise (IBM Verify) IdP** |
| **Palo Alto Idira / NHI** | (governs, not primary issuer) [S5b] | onboarding→decommission [S5b] | secrets/keys/certs [S5b] | remove standing priv, JIT [S5b] | "purpose-built vault, auto-rotate" [S5b] | SIEM/XDR; who-initiated audit [S5a] | **attribution-grade (who initiated)** [S5a] | **NO — explicitly not addressed** [S5b] | **Enterprise's own issuers (assumed trusted)** |
| **SPIFFE / SPIRE** | SPIRE server issues SVID on attestation [S8] | **auto-rotate short-lived SVIDs** [S8] | X.509/JWT SVID [S8] | (consumed by mesh/policy) | no long-lived secrets [S8] | (consumed by mesh) | workload-bound, not human-scarce [S8b] | **NO — spec: "no external Sybil resistance"** [S8b] | **Trust-domain signing authority = "the root of trust"** [S8a] |
| **PACT (for contrast)** | persona keypair under a **scarce human root** | (to build) | signed PACT frame [§2] | scope-bound claims [§3] | (Power Loom log + ed25519) | **per-receiver** Merkle log [INV-10 amended] | **premise.creator = accountable human** [§6.1] | **YES — `cap × disjoint` on EFFECTIVE presence** [§1/INV-12] | **NONE central — receiver-controlled, mutually-untrusting roots** [INV-2] |

Sources: vendor rows = [S1]–[S10b]; PACT row = local spec.

---

## 4. The decision

### 4.1 The throne question (L6/L7) — the crux

PACT's deepest principle (L6) is: *every time you strip a decider, name where the deciding
power relocated, and bind it (auditable, plural, contestable, rotating).* L7 warns that the
most dangerous power wears the most reassuring label. INV-2 commits PACT to
**receiver-controlled trust across mutually-untrusting roots** — *no central throne.*

**Every vendor in this category is, structurally, a central throne — and they say so in
their own words:**

- Okta: the enterprise IdP "acts as the **authorization broker and identity governance
  center**," "the **central system** that manages access" [S10b].
- SPIFFE: the trust domain is "**the root of trust**," anchored by a single "**signing
  authority**" [S8a].
- Entra: the **tenant** mints, governs, and can revoke every agent identity; accountability
  routes to a sponsor *inside the org* [S6a][S6b].

This is not a flaw in their design — it is *correct* for their problem (securing one
enterprise's agents, where the enterprise legitimately IS the root of trust). But it is the
**precise antithesis of PACT's problem.** **Adopting any of them as PACT's identity ROOT
relocates PACT's throne to Okta / Microsoft / IBM / the SPIRE operator** — an unbound,
single, vendor-owned decider that decides *who exists* and *who is trusted*. That is the L6
trap in its purest form, wearing the L7 costume ("enterprise-grade identity security for
your agents"). **It is also self-defeating on PACT's own thesis:** an IdP that can mint
unlimited agent identities has a **Sybil cost of zero** within its domain — the exact
quantity PACT's whole §1 exists to make "**budgeted, bounded, auditable instead of zero**"
(`10-synthesis` §4.2). You cannot buy a scarce-root from a vendor whose business model is
issuing as many identities as the customer will pay for.

**Verdict: NOT compatible as a root. Adopting the category as PACT's trust anchor
RELOCATES the throne — it does not remove it. Compatible ONLY as bounded intra-node
plumbing (below), never as the inter-node root.**

A subtle but important nuance, to be honest: the category's **principal-binding** move — a
human "sponsor"/"on-behalf-of" always accountable for an agent — is *directionally aligned*
with PACT's `premise.creator = human accountability` coupling (§6.1) and the
`humanAuthorization`-for-sensitive-actions idea. The difference is **scope of trust**:
their sponsor binding is *attribution within a trust domain that already trusts the issuer*;
PACT's human-root is *the scarcity anchor that the receiver in another domain can reason
about without trusting your issuer.* **Attribution ≠ scarcity ≠ cross-domain trust.** The
vendor binding answers "who in MY org is responsible for this agent?"; PACT must answer "how
many EFFECTIVE identities can this stranger's human root project into MY view, and why
should I believe two of their confirmations are independent?" The category never asks the
second question.

### 4.2 INTEGRATE / OVERLAP / OUT-OF-SCOPE — per vendor

| Vendor | Call | Reasoning |
|---|---|---|
| **Microsoft Entra Agent ID** | **OUT-OF-SCOPE as root; OVERLAP on patterns** | Best-documented mirror of the gap. Its sponsor + delegated-OBO + lifecycle model is the *pattern* PACT will build (§6.1 + caps), but its tenant-as-root + bulk-mint is the anti-PACT axiom. Don't adopt; *study* the sponsor/OBO design. |
| **Okta / Auth0 for AI Agents** | **INTEGRATE (intra-node plumbing only) / OVERLAP** | The one with genuinely reusable *mechanisms*: **Token Vault (RFC 8693 OBO)** and **ID-JAG/XAA** are exactly the agent↔tool/app delegation a single PACT node needs *internally*. INTEGRATE for "a persona's agent calls Gmail/GitHub on behalf of its human." **Never** as the inter-node identity root (Okta-as-broker = relocated throne). |
| **IBM Verify** | **OUT-OF-SCOPE (as a product) / OVERLAP (on NHI discipline)** | Discovery/observability/ITDR is enterprise-SOC tooling orthogonal to a protocol. The OBO + human-in-the-loop discipline overlaps PACT's intent but offers no net-new mechanism. AskIAM is wholly OUT-OF-SCOPE. |
| **Palo Alto Idira / NHI** | **OUT-OF-SCOPE** | Posture/governance/SIEM layer for an enterprise's existing NHIs. No issuance primitive, no cross-domain trust, Sybil explicitly unaddressed. Useful only as the clearest *evidence* of the category's blind spot. |
| **SPIFFE / SPIRE** | **INTEGRATE (best technical borrow for intra-node workload identity) / OVERLAP** | The open, vendor-neutral, spec-honest substrate. INTEGRATE its **attested, short-lived, auto-rotated SVID** model to give each PACT persona/agent a rotating credential *within a node*. OVERLAP with PACT's keypair-per-persona. **Not** the inter-node root (its own spec: trust domain = root of trust, no Sybil resistance). |

### 4.3 What PACT could BORROW (vs. what's irrelevant)

**Borrow (the plumbing — composes cleanly under PACT's novel core):**

1. **The sponsor-bound OBO / delegation token (RFC 8693 Token Exchange + RFC 7523 JWT
   profile = ID-JAG).** *This is the single most useful borrowable pattern.* It is the
   standardized, deployed way to express "**this agent acts on behalf of this accountable
   human, with exactly the rights the human delegated, auditable end-to-end**" — which is
   PACT's §6.1 `premise.creator` coupling and `humanAuthorization` gate expressed in a wire
   format the whole field already speaks. Carry PACT's `σ_root` + persona provenance *as
   claims inside* an ID-JAG-shaped assertion rather than inventing a delegation format.
   [S7a][S10a][S10b]
2. **SPIFFE-style attested, short-lived, auto-rotated credentials** for the intra-node
   persona keypair — addresses the "config-swap / same-keypair-forever" weakness
   (`10-synthesis` §4.2 third "independence") with rotation + attestation rather than a
   static key. [S8]
3. **The lifecycle/revocation discipline** (create→govern→decommission, no orphaned
   credentials, sponsorship auto-transfer) — operational hygiene PACT's persona/agent
   layer needs regardless. [S6b]
4. **Token Vault** as the intra-node pattern for an agent holding 3rd-party API tokens
   on-behalf-of its human (Gmail/GitHub/Slack) — relevant the moment a PACT agent *does*
   work in the world, orthogonal to the trust core. [S7a]

**Irrelevant / do-not-adopt:**

- **The IdP-as-root-of-trust topology** (all of them). Adopting it IS the L6 violation.
- **Bulk identity minting / blueprint→N-identities** (Entra) — directly hostile to INV-12's
  effective-presence cap. It is the *attack* PACT defends against, shipped as a feature.
- **SOC/posture tooling** (Idira, IBM ITDR/ISPM, observability dashboards) — enterprise ops,
  not protocol primitives.
- **The consumer-trust survey framing** (Auth0) — useful as *motivation* (the market agrees
  human oversight is the trust unlock), not as a mechanism.

### 4.4 Honest overlap verdict — is there ANY net-new idea here?

**On PACT's load-bearing axis (cross-org epistemic trust + Sybil scarcity): no net-new idea.
None of these vendors does anything PACT didn't already plan, and on the one question that
distinguishes PACT — one-principal-one-identity — they are uniformly silent *by
construction*, because each is a centralized issuer the customer already trusts.** This is
the **same finding the a2a-protocols report reached for the open A2A field** (no protocol
anchors in human scarcity), now confirmed for the *enterprise* field: the commercial IAM
vendors solved **enterprise NHI management** — a genuinely different problem from PACT's
**cross-org epistemic trust between mutually-untrusting roots.** Their "agent identity" is
**operational identity inside a throne**; PACT's is **scarce identity with no throne.**

**On the plumbing axis: real, reusable engineering** — the OBO/delegation token (ID-JAG),
SPIFFE-style rotating attested credentials, and the lifecycle/vault discipline are mature,
standardized, and worth borrowing *under* PACT's core rather than rebuilding. They are
"better parts to borrow" for the **intra-node boundary** — but they sit **below** PACT's
contribution, exactly as the a2a report's DID/VC + Agent-Card recommendation does. They do
**not** reduce, and cannot reduce, the U1/U2 frontier PACT's value rests on.

So: **it is largely "centralized IAM, now for agents" — the throne PACT exists to avoid,
wearing the agent costume (L7) — with one genuinely useful, throne-free pattern to lift out
of it: the sponsor-bound on-behalf-of delegation token.** Lift that pattern; refuse the root.

---

## 5. Recommendation to the synthesis (one paragraph)

Keep the a2a-protocols recommendation (DID/VC + Agent Card) for the *identity descriptor*
and **add**: for the **intra-node** agent↔tool/app boundary, adopt the **ID-JAG / RFC 8693
on-behalf-of delegation token** as PACT's delegation carrier (it expresses §6.1's
human-accountability coupling in a deployed wire format), and adopt **SPIFFE-style
short-lived attested credentials** for persona keys (mitigates the config-swap
"independence"). **Explicitly DECLINE** any enterprise IdP (Okta / Entra / IBM / SPIRE
trust-domain) as PACT's *root of trust* — doing so relocates PACT's throne to the vendor
(L6) and reintroduces zero-cost Sybil within the vendor's domain, defeating §1. The vendors
are **buy-the-plumbing, build-the-trust**: integrate their intra-domain primitives, keep the
inter-domain scarce-anchor (U1) + P2 trust/grounding core firmly PACT-built and
throne-free. **The borrow that matters: the sponsor-bound OBO token. The line that must not
be crossed: the IdP as root.**

---

## Sources

- [S1] IBM — "Agentic AI Identity Management" (solutions page; **HTTP 403 on direct fetch — reconstructed from search extract**). https://www.ibm.com/solutions/agentic-ai-identity-management
- [S2] IBM — "Agentic AI meets identity security with IBM Verify Identity Protection" (**HTTP 403 — reconstructed from search extract**). https://www.ibm.com/new/product-blog/agentic-ai-meets-identity-security-with-ibm-verify-identity-protection
- [S3] IBM — "The Practitioner's Guide to Non-Human Identities" / `/think/insights` NHI material (search extract). https://www.ibm.com/think/insights/non-human-identity-guide
- [S5a] Palo Alto Networks — "Securing AI Agents: Privileged Machine Identities At Unprecedented Scale" + Idira (MARKETING). https://www.paloaltonetworks.com/blog/identity-security/securing-ai-agents-privileged-machine-identities-at-unprecedented-scale/ · https://www.paloaltonetworks.com/idira
- [S5b] Palo Alto Networks — "What Is a Non-Human Identity (NHI)?" (cyberpedia; DOC-ish reference — firsthand-fetched). https://www.paloaltonetworks.com/cyberpedia/what-is-a-non-human-identity
- [S6a] Microsoft Learn — "What are agent identities?" (DOC, firsthand-fetched). https://learn.microsoft.com/en-us/entra/agent-id/what-are-agent-identities
- [S6b] Microsoft Learn — "Governing Agent Identities" (Entra ID Governance; DOC, firsthand-fetched). https://learn.microsoft.com/en-us/entra/id-governance/agent-id-governance-overview
- [S7a] Auth0 — "Token Vault for AI Agents" (DOC, firsthand-fetched). https://auth0.com/ai/docs/intro/token-vault · https://auth0.com/blog/auth0-token-vault-secure-token-exchange-for-ai-agents/
- [S7b] Auth0/Okta — "New Auth0 Platform innovations … Identity for AI agents" (press / MARKETING). https://www.okta.com/newsroom/press-releases/auth0-platform-innovation/
- [S7c] Auth0 — "Customer Identity Trends Report 2025" (survey / MARKETING). https://auth0.com/customer-identity-trends-report · https://auth0.com/resources/whitepapers/customer-identity-trends-report
- [S8] SPIFFE/SPIRE concepts + HashiCorp "SPIFFE: Securing the identity of agentic AI and non-human actors" (DOC + vendor blog; firsthand-fetched blog). https://www.hashicorp.com/en/blog/spiffe-securing-the-identity-of-agentic-ai-and-non-human-actors · https://spiffe.io/docs/latest/spire-about/spire-concepts/
- [S8a] SPIFFE — "Trust Domain and Bundle" spec ("trust domain … root of trust … signing authority"; DOC). https://spiffe.io/docs/latest/spiffe-specs/spiffe_trust_domain_and_bundle/ · https://github.com/spiffe/spiffe/blob/main/standards/SPIFFE_Trust_Domain_and_Bundle.md
- [S8b] SPIFFE — SPIFFE-ID standard ("self-registered … no external Sybil resistance mechanism"; DOC). https://github.com/spiffe/spiffe/blob/main/standards/SPIFFE-ID.md · https://spiffe.io/docs/latest/spiffe-specs/spiffe-id/
- [S9] NHI category guides (Permiso, Microsoft, Obsidian, CyberArk, Token Security) — ratios + definitions (MARKETING). https://permiso.io/non-human-identity-nhi-security-guide · https://www.microsoft.com/en-us/security/business/security-101/what-are-non-human-identities · https://www.cyberark.com/what-is/non-human-identity/
- [S10a] OAuth.net — "Cross-App Access" / IETF "Identity and Authorization Chaining Across Domains" (RFC 8693 + RFC 7523; DOC). https://oauth.net/cross-app-access/
- [S10b] Okta — "Cross App Access: Securing AI agent and app-to-app connections" + Okta Developer XAA guides (DOC, firsthand-fetched). https://www.okta.com/identity-101/cross-app-access-securing-ai-agent-and-app-to-app-connections/ · https://developer.okta.com/blog/2025/09/03/cross-app-access · https://developer.okta.com/docs/guides/ai-agent-token-exchange/authserver/main/

### Source-quality caveats (research-mode honesty)

- **Firsthand-fetched + technical (DOC):** Microsoft Learn agent-identity pages [S6a][S6b],
  Auth0 Token Vault docs [S7a], Okta XAA identity-101 page [S10b], Palo Alto NHI cyberpedia
  [S5b], HashiCorp SPIFFE blog [S8]. These are the backbone of the per-vendor mechanism
  claims and carry the highest confidence.
- **Spec-grade (DOC):** SPIFFE trust-domain + SPIFFE-ID standards [S8a][S8b] — the
  "root of trust" and "no external Sybil resistance" quotes are from the standards repo /
  spec, the strongest evidence in the review for the throne finding.
- **403'd — reconstructed from search extracts (DIRECTIONAL, not firsthand-read):** the two
  IBM pages [S1][S2]. IBM claims are the lowest-confidence in this report and are flagged
  inline; the *direction* (NHI discovery + governance + OBO + human-in-the-loop, no Sybil
  story) is consistent across every IBM-adjacent source and the rest of the category.
- **Marketing (MARKETING):** vendor press releases, blogs, the Auth0 survey, the NHI
  ratio stats. Used only for *capsule / motivation* facts; every load-bearing contrast
  (issuance topology, principal binding, Sybil-absence, root-of-trust) is anchored to a
  DOC source above.
