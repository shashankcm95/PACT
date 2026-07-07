#!/usr/bin/env node
// PACT sigma-root broker — identity/sigma-root-broker.js  (plans/42 W1b)
//
// The SIGMA-ROOT signing-broker CLI: a THIN entrypoint over identity/broker-core.js (the shared, extracted
// per-process key-LOADER). A SIBLING to broker-sign.js, deliberately a SEPARATE executable (architect F1 +
// hacker HIGH-1): K_root is the trust root, strictly more sensitive than the frame broker's K_broker; a
// single process holding BOTH keys = one compromise leaks both. So this entrypoint reads its OWN key-file env
// (PACT_ROOT_KEY_FILE), its OWN WHO-allowlist (PACT_ROOT_ALLOWED_UIDS -- NEVER the frame broker's), its OWN
// controller policy (PACT_ROOT_CONTROLLER), under its OWN root-owned wrapper / uid. It signs sigma-root
// BINDINGS (persona<->key authorizations), NOT frame record_ids.
//
// KEY SEPARATION is the load-bearing invariant (hacker HIGH-1, proven live at VERIFY -- plans/42):
// computeRecordId is field-AGNOSTIC, so under a SINGLE key a sigma-root sig verifies as a frame sig. The
// same-inode refusal (distinctFromKeyFileEnv:'PACT_BROKER_KEY_FILE', checked in broker-core's vet) fails
// CLOSED if K_root ever resolves to the SAME INODE as K_broker (a same-file / symlink / hardlink mis-deploy).
// The _type tag + disjoint required-field set are defense-in-depth ON TOP of that.
//
// It reads its root private key from PACT_ROOT_KEY_FILE, drains the presented binding preimage on stdin,
// recompute-binds (computeBindingId) + controller-binds (PACT_ROOT_CONTROLLER) via authorizeBindingRequest,
// and prints ONLY the base64 sigma-root sig. Errors -> stderr (a fixed message, NEVER key bytes, NEVER
// err.stack) + non-zero exit + EMPTY stdout. It NEVER prints the key.
//
// HONEST SCOPE (NS-9 -- do NOT report as closed):
//   * RAISED-STAKES #273: a same-uid caller who reaches the root broker can mint "K_root authorized MY key
//     as persona P" within the controller (see the binding-request-auth.js header) -- OPEN until a deployed
//     + attested cross-uid signer.
//   * SAME-INODE ONLY: the same-inode refusal catches an inode ALIAS (same file / symlink / hardlink), NOT a
//     distinct-inode byte-identical COPY of the root key -- a copy at a different inode is a single logical
//     key the guard misses (verified by the VALIDATE hacker). Key-material distinctness is an OPERATOR-custody
//     property; the LOAD-BEARING separation is the uid / process boundary, not this in-process inode check.
// All SHADOW.

'use strict';

const { runBroker, makeFail } = require('./broker-core');
const { authorizeBindingRequest, resolveRequireBinding } = require('./binding-request-auth');
const { assessEnableFlag } = require('../lib/arm-flags');

async function main() {
  // single-arming-source (plans/28): each arm-relevant env var is read from process.env EXACTLY ONCE, here,
  // and THREADED to every consumer. The flag is PACT_ROOT_REQUIRE_BINDING (uniform with the broker's other
  // PACT_ROOT_* envs -- NOT the frame broker's PACT_BROKER_ prefix; the VALIDATE hacker flagged the mixed
  // prefix as an operator footgun). assessEnableFlag is OBSERVABILITY ONLY -- a present-but-invalid token
  // (e.g. 'ture') emits an operator-side misconfig alert; the DECISION comes from resolveRequireBinding
  // (mandatory default-ON; a typo fails CLOSED -- never the blind K_root oracle).
  const requireBindingRaw = process.env.PACT_ROOT_REQUIRE_BINDING;
  const rootController = process.env.PACT_ROOT_CONTROLLER;
  assessEnableFlag('PACT_ROOT_REQUIRE_BINDING', requireBindingRaw);
  const requireBinding = resolveRequireBinding({ requireBindingRaw, rootController });

  await runBroker({
    progName: 'sigma-root-broker',
    keyFileEnv: 'PACT_ROOT_KEY_FILE',
    allowlistEnv: 'PACT_ROOT_ALLOWED_UIDS',
    distinctFromKeyFileEnv: 'PACT_BROKER_KEY_FILE', // HIGH-1: K_root MUST be a DISTINCT key from K_broker
    requireMode: requireBinding,
    // the binding WHAT-gate: map the generic requireMode -> requireBinding + thread the (already-read) controller.
    authorize: ({ requireMode, claimedRecordId, presentedBodyRaw }) =>
      authorizeBindingRequest({ requireBinding: requireMode, claimedRecordId, presentedBodyRaw, brokerController: rootController }),
    disabledNotice: {
      who: 'sigma-root-broker: caller-auth DISABLED (PACT_ROOT_ALLOWED_UIDS unset) -- R2-WHO open\n',
      what: 'sigma-root-broker: per-request-auth DISABLED (require-binding off) -- BLIND K_root ORACLE open\n',
    },
  });
}

// async main (the require-binding stdin drain is async). Any unexpected throw fails CLOSED (a fixed message,
// NEVER key bytes / err.stack), preserving the empty-stdout + non-zero-exit contract.
main().catch(() => makeFail('sigma-root-broker')('internal error'));
