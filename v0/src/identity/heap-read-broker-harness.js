#!/usr/bin/env node
'use strict';

// PACT R-heap — the paused-broker harness (plans/26 L1). Loads the signing key via broker-sign's EXACT path
// (readFileSync -> createPrivateKey, so the heap holds the PRODUCTION representation: the PEM string AND the
// OpenSSL EVP_PKEY), prints {ready,pid}, then BLOCKS holding the key — a window LARGER than the production
// load-sign-exit broker (attacker-favorable; a denial here is a fortiori a denial of production's ms window).
//
// Run AS THE BROKER UID on the deployed Linux box. NOT for production (production is load-sign-exit,
// broker-sign.js). Lock the operator-runtime surfaces BEFORE launch (the r-heap runbook): `ulimit -c 0`
// (no core dump), core_pattern non-host-readable, swap off/encrypted. SIGTERM/SIGINT -> clean exit (the
// operator tears down after the attack battery). The module-level `pem`/`key` consts are GC roots for the
// module's lifetime, so the key stays heap-resident for the whole window (L1's non-vacuity precondition).

const fs = require('fs');
const crypto = require('crypto');

const keyFile = process.env.PACT_BROKER_KEY_FILE;
if (!keyFile) { process.stderr.write('paused-broker: PACT_BROKER_KEY_FILE unset\n'); process.exit(2); }

// the same EFFECTIVE load path as broker-sign.js (readFileSync -> createPrivateKey via signRecordId): the heap
// holds the `pem` string AND the materialized EVP_PKEY identically to a production sign (architect R-A2-a /
// honesty VT-7). (broker-sign.js reads from an already-open fd with O_NOFOLLOW guards — input validation, not
// heap content; the resident bytes are the same.)
const pem = fs.readFileSync(keyFile, 'utf8');
const key = crypto.createPrivateKey(pem);

// the harness's own non-vacuity: a real, usable key produces a real signature (a broken/empty key would throw
// here and the harness would never report ready — so L3's "found the key" cannot be of a non-key).
let sigLen = 0;
try { sigLen = crypto.sign(null, Buffer.from('r-heap-harness-probe'), key).length; }
catch (e) { process.stderr.write('paused-broker: key is not a usable signer (' + (e && e.message) + ')\n'); process.exit(2); }

process.stdout.write(JSON.stringify({ ready: true, pid: process.pid, sigLen }) + '\n');

// BLOCK holding the key resident. The interval keeps the event loop alive; the consts keep the key reachable.
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
setInterval(() => { void key; void pem; }, 1 << 30); // the closure reference pins pem+key as GC roots through the window
