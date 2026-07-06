#!/usr/bin/env node
// PACT P-broker — identity/broker-sign.js  (plans/05 §1; thinned to a broker-core entrypoint in plans/42 W1a)
//
// The FRAME signing-broker CLI: a THIN entrypoint over identity/broker-core.js (the shared, extracted
// per-process key-LOADER — allowlisted in the minter.test.js grep forward-guard). This file owns ONLY the
// frame-specific wiring: it reads its two arm-relevant envs ONCE each (PACT_BROKER_REQUIRE_FRAME +
// PACT_BROKER_PERSONA_DID — the P5-W1 single-arming-source discipline, plans/28), resolves require-frame,
// and injects the frame WHAT-gate (authorizeRequest) + the frame key/allowlist envs + the LOUD residual
// notices into runBroker. The key vet + stdin drain + caller-auth + sign live in broker-core.js.
//
// It reads its OWN private key from PACT_BROKER_KEY_FILE, validates argv is a 64-hex record_id, signs it
// via the crypto leaf, and prints ONLY the base64 signature to stdout. Errors -> stderr (a fixed message,
// NEVER key bytes, NEVER err.stack) + non-zero exit + EMPTY stdout. It NEVER prints the key.
//
// HONEST SCOPE (plans/05 §0 + plans/11 §0 — a custody MECHANISM, world-anchorABLE; NOT custody-real here):
//   * Custody is REAL only when this process runs under a SEPARATE uid / enclave / HSM — a DEPLOYMENT
//     property, verified OUT-OF-BAND. SAME-UID this is the env-pointed file-key read P-minter removed,
//     moved one process over: the host uid can still read the key file (a test demonstrates this) and —
//     by same-uid physics — ptrace this process / read /proc/<pid>/mem (open regardless; NOT separately exercised).
//   * Access-control narrows WHO + WHAT, in two opt-in gates (both SHADOW; neither closes R2):
//       - WHO (R2-WHO, gate (0)): a COARSE uid gate (PACT_BROKER_ALLOWED_UIDS) keyed on SUDO_UID, the
//         sudo-native caller signal (NOT SO_PEERCRED: a sudo-command, not a socket). See plans/10.
//       - WHAT (R2-WHAT, gate (0.5), plans/11): require-frame mode binds the signature to a RECOMPUTABLE
//         frame -- it signs the COMPUTED content-address of a presented P-frame body, never an arbitrary
//         64-hex. This NARROWS WHAT-can-be-signed; it does NOT close R2.
//   * Residuals carried LOUD (NS-9 -- do NOT report as closed): the entitled operator can still make P
//     assert ANY payload (single-operator payload authority / payload-semantics ceiling); PACT_BROKER_PERSONA_DID
//     is a policy declaration, NOT cryptographically bound to the held key broker-side (integrity != provenance,
//     NS-2). The broker's core guarantee remains NON-EXFILTRATION (HSM-shaped).

'use strict';

const { runBroker, makeFail } = require('./broker-core');
const { authorizeRequest, resolveRequireFrame } = require('./request-auth');
const { assessEnableFlag } = require('../lib/arm-flags');

async function main() {
  // P5-W1 single-arming-source (plans/28): each arm-relevant env var is read from process.env EXACTLY ONCE,
  // here, and THREADED to every consumer. assessEnableFlag is OBSERVABILITY ONLY -- a present-but-invalid
  // REQUIRE_FRAME token (e.g. 'ture', 'false') emits an operator-side misconfig alert; the DECISION is
  // unchanged (strict '1'/'0', else the persona-presence default -- exactly resolveRequireFrame's contract).
  // assessEnableFlag never throws / never exits -- safe BEFORE the stdin drain (a pure stderr write cannot
  // EPIPE the host's input write; the EXIT-capable gates all run inside runBroker, after its drain-first read).
  const requireFrameRaw = process.env.PACT_BROKER_REQUIRE_FRAME;
  const brokerPersonaDid = process.env.PACT_BROKER_PERSONA_DID;
  assessEnableFlag('PACT_BROKER_REQUIRE_FRAME', requireFrameRaw);
  const requireFrame = resolveRequireFrame({ requireFrameRaw, brokerPersonaDid });

  await runBroker({
    progName: 'broker-sign',
    keyFileEnv: 'PACT_BROKER_KEY_FILE',
    allowlistEnv: 'PACT_BROKER_ALLOWED_UIDS',
    requireMode: requireFrame,
    // the frame WHAT-gate: map the generic requireMode -> requireFrame and thread the (already-read) persona.
    authorize: ({ requireMode, claimedRecordId, presentedBodyRaw }) =>
      authorizeRequest({ requireFrame: requireMode, claimedRecordId, presentedBodyRaw, brokerPersonaDid }),
    disabledNotice: {
      who: 'broker-sign: caller-auth DISABLED (PACT_BROKER_ALLOWED_UIDS unset) -- R2-WHO open\n',
      what: 'broker-sign: per-request-auth DISABLED (require-frame off) -- R2-WHAT open\n',
    },
  });
}

// async main (the require-frame stdin drain is async). Any unexpected throw fails CLOSED (a fixed message,
// NEVER key bytes / err.stack), preserving the empty-stdout + non-zero-exit contract.
main().catch(() => makeFail('broker-sign')('internal error'));
