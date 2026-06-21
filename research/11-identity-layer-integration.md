---
lifecycle: persistent
phase: proto-planning — identity-boundary deep-dive
created: 2026-06-21
status: recommendation
---

# Identity-Layer Integration Verdict — AIP + Enterprise IAM vs PACT

> Deep-dive on six user-supplied sources spanning the **identity-boundary tier** (PACT §1/§2 + U1).
> Question asked: *third-party solution to integrate, easier substitute, or just overlap?*
> Supporting reports: `research/prior-art/agent-identity-protocols.md` (AIP),
> `research/prior-art/enterprise-iam-agent-identity.md` (IBM/Auth0/Okta/Palo Alto + Entra + SPIFFE).

## The one-line answer

**They solve PACT's BOUNDARY (P0/P1), not its core — and every one of them RELOCATES the Sybil
throne to an unmetered issuer.** So: **lift two delegation patterns, adopt DID/VC for the identity
primitive (which the prior pass already recommended — these are overlap there), and REFUSE all of
them as the root of trust.** None closes U1; none touches the §3/§5/§6 novel core. The field's
uniform punt on the scarce-anchor is, paradoxically, the **strongest validation of PACT's thesis**
yet — the one thing nobody builds is precisely PACT's reason to exist, and the one thing it cannot
outsource.

## What the two clusters actually are

### Cluster A — open agent-identity protocols ("AIP")
- **Maturity check (do not skip):** "AIP" is **three independent IETF *individual* Internet-Drafts**
  (Cao/NVIDIA = the GitHub `openagentidentityprotocol` repo; Singla = the `did:aip`+delegation one;
  Prakash), all `-00..03`, **zero working-group adoption**, each carrying the boilerplate "no formal
  standing, not endorsed by the IETF." The Cao repo's "the working group's repository" is inaccurate
  — there is no WG. **Status: one project's proposal, not a standard.**
- **Identity primitive:** `did:aip` is a renamed `did:key` (SHA-256 of an Ed25519 pubkey); Cao's is a
  registry UUID. Where AIP is an identity primitive, it **IS DID/VC, and a weaker pick** (an unadopted
  single-author method) → the prior DID/VC recommendation stands; **do not adopt `did:aip`.**
- **The genuine feature:** a **verifiable, attenuation-only, depth-bounded delegation chain** —
  "every delegation chain MUST have a verifiable principal at its root (W3C DIDs, NOT `did:aip`)",
  `aip_chain` JWTs, rules D-1..D-5 (a child may only *narrow* its parent's authority). Richer than
  PACT's single `Persona.parent = human_uid` pointer.

### Cluster B — enterprise IAM/CIAM (Okta, Auth0, Microsoft Entra Agent ID, IBM Verify, Palo Alto Idira, SPIFFE/SPIRE)
- Underneath the marketing, all are the same thing: **non-human-identity (NHI) lifecycle + access
  management inside ONE enterprise trust domain** — issuance, rotate/revoke, authn, least-privilege
  authz, secrets/token vaulting, audit. Genuinely good at the intra-domain plumbing.
- **Principal binding:** the serious ones tie an agent to an accountable human "sponsor/owner" via a
  standardized **on-behalf-of delegation** built on **OAuth 2.0 Token Exchange (RFC 8693)** —
  Auth0 Token Vault, Okta ID-JAG / Cross-App-Access (RFC 8693 + RFC 7523).
  *(IBM's pages 403'd → flagged directional; Okta/Auth0/Entra docs were fetched firsthand + technical.)*

## The throne verdict (L6/L7) — the crux

**Every source roots in a central issuer that can mint UNLIMITED agent identities, and NONE addresses
one-principal-one-identity / Sybil.** Quoting the sources:
- AIP: "A principal may mint unlimited agents… No quota, no 'one principal per identity' anchor…
  does not address Sybil attacks, identity proliferation."
- Enterprise: Okta names its IdP "the authorization broker and **root of trust**"; SPIFFE's spec
  literally names the trust domain "the root of trust… no external Sybil resistance mechanism";
  Entra treats bulk-minting as a feature; Palo Alto's NHI page omits Sybil entirely.

So **Sybil cost inside any of these domains is zero** — the exact quantity PACT's §1 exists to make
*budgeted, bounded, auditable*. **Adopting any of them as PACT's root reintroduces the throne PACT
exists to refuse, wearing the L7 costume** ("enterprise-grade agent security"). Their human-sponsor
binding is **attribution within an already-trusted domain**, which is *not* PACT's **cross-domain
scarcity anchor**: attribution ≠ scarcity ≠ cross-org trust.

## Decision table

| Source | Identity primitive | Verdict | Why |
|---|---|---|---|
| AIP (IETF drafts + GitHub) | `did:aip` (renamed `did:key`) | **PARTIAL** — overlap on identity (DID/VC stands), **borrow the delegation chain** | unadopted; relocates throne (unlimited agents/principal); but the attenuation-only chain is a real pattern |
| Okta / Auth0 | OAuth2/OIDC + RFC 8693 OBO | **INTEGRATE (intra-node plumbing only) / OVERLAP** | best reusable mechanism (Token Vault, ID-JAG); not a root |
| Microsoft Entra Agent ID | Entra-issued agent identity | **OUT-OF-SCOPE as root / OVERLAP on patterns** | best-documented mirror of the gap; bulk-mint by design |
| IBM Verify (agentic AI IAM) | IBM-issued | **OUT-OF-SCOPE product / OVERLAP discipline** | centralized NHI mgmt; pages 403'd (directional) |
| Palo Alto Idira | discovery/posture (SOC) | **OUT-OF-SCOPE** | identity *security posture* layer, not an identity root |
| SPIFFE/SPIRE | attested SVID (x509/JWT) | **INTEGRATE (best technical borrow)** | attested rotating *workload* credentials for intra-node; explicitly no Sybil resistance |

## What PACT should actually take (two patterns, one primitive, zero roots)

1. **Identity primitive → DID/VC** (overlap; the prior recommendation is unchanged — do **not** adopt `did:aip`).
2. **BORROW pattern #1 — the attenuation-only, depth-bounded delegation chain** (from AIP). This is
   the deployed shape of PACT's "user authors the abstraction STRUCTURE beneath the root" (§1, INV-12)
   — *but the chain root MUST bind to PACT's scarce-human cap*, which is the exact thing AIP omits.
   Adopt the chain *form*; supply the scarce root *yourself*.
3. **BORROW pattern #2 — the sponsor-bound on-behalf-of delegation token (RFC 8693 + RFC 7523, e.g.
   Okta ID-JAG)** — a deployed wire format that expresses PACT's §6.1 `premise.creator` human-
   accountability coupling and the `Persona.parent = human_uid` link. Lift the token pattern; refuse the IdP root.
4. **(intra-node only) consider SPIFFE/SPIRE** for attested, rotating *workload* credentials between
   processes inside one PACT node — never as the inter-node trust root.

## What none of them solves (still entirely PACT's burden)
- **U1 — one-human-one-root / Sybil resistance.** Uniformly punted by the *entire* field, open and
  enterprise alike. This is unchanged from the prior synthesis: U1 is PACT's to contain (localize to
  one pluggable seam + one chosen default; Personhood Credentials remains the strongest default).
- **The §3 grounding / §5 trust / §6 reach core** — no source touches it.
- **`effective_presence()` + binding the cap throne** — the delegation chains give PACT the *structure*
  to count, but not the *cap* or the *bound throne* (amendment #2 stands).

## How this updates the build plan

The P0 Boundary phase in `10-synthesis-and-recommendation.md` §8 gets **more concrete and more
confident**, not changed in direction: adopt **DID/VC + RFC 8693/7523 OBO delegation tokens shaped as
an attenuation-only, depth-bounded chain (the AIP form)**, with the chain root bound to PACT's scarce-
human cap. The single sharpened conclusion: **the identity boundary is now a buy-the-pattern, build-
the-root problem** — the wire formats and delegation shapes are mature and borrowable; the scarce
anchor at the root is the irreducible thing PACT must build and can never outsource. Open-decision #2
(the U1 default) is *unaffected* — no source closes U1.
