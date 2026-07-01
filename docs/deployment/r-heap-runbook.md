# R-heap runbook — the heap-read non-exfiltration dogfood

> Spec: `plans/26`. Verdict logic: `v0/src/identity/heap-read-probe.js` (`assessHeapRead`, unit-tested). This
> runbook is the OPERATOR's out-of-band procedure: run the legs on a Linux `ptrace_scope=2` box, assemble a
> `legs.json`, then `heap-read-probe --facts legs.json` enforces the verdict (the L3 gate, the per-vector L4,
> the NS-9 disposition). A free local `multipass` VM is SUFFICIENT (plans/26 §6); EC2 is optional polish.
>
> NS-9: a green run is NOT "the memory boundary is hardened-real". The tool reports `hostObservableDenialChecksHeld`
> + `requiresOutOfBandUidConfirmation`. ONLY your out-of-band uid attestation (step 5) decides custody-real.

## 1. Provision (free, local)

```sh
multipass launch 24.04 --name rheap --memory 1G --disk 5G   # genuine arm64 Linux kernel
multipass shell rheap
uname -r ; cat /sys/kernel/security/lsm    # record kernel version + that 'yama' is in the LSM list (L0)
```

## 2. Lock the box (L0 preconditions + operator-runtime surfaces)

```sh
sudo sysctl -w kernel.yama.ptrace_scope=2
echo 'kernel.yama.ptrace_scope = 2' | sudo tee /etc/sysctl.d/10-ptrace.conf
# core dumps: no host-readable core sink (L2 core leg + L0-core)
sudo sysctl -w kernel.core_pattern=/dev/null ; echo 'kernel.core_pattern=/dev/null' | sudo tee /etc/sysctl.d/10-core.conf
# apport RE-SETS core_pattern to its crash-handler pipe at boot, AFTER sysctl.d applies — so the persist above
# is not enough on Ubuntu. Disable apport (and re-assert core_pattern=/dev/null after any reboot).
sudo systemctl disable --now apport.service 2>/dev/null || true
# swap: turn it off for the run (or use encrypted swap) so a key page cannot land on a host-readable device
sudo swapoff -a
# borrowed-cap scan (L0-borrowed-cap / VT-9): MUST be empty, and review setuid binaries
getcap -r / 2>/dev/null | grep cap_sys_ptrace || echo "no cap_sys_ptrace binaries"
find / -perm -4000 -type f 2>/dev/null    # review: none coercible into reading the broker
```

## 3. Deploy the broker + L-pre (custody-clean)

```sh
sudo useradd -r -s /usr/sbin/nologin pactbroker      # the broker uid (record it: id -u pactbroker)
sudo useradd -m attacker                             # the host-uid attacker (a normal non-root uid)
# the key DIR is 0755 (the KEY stays 0600): the operator uid must be able to lstat the key to confirm its
# OWNER differs (custody-verify C2). A 0700 dir BLINDS the verifier -> it reports owner-unknown -> FAILs.
sudo install -d -m 0755 -o pactbroker -g pactbroker /etc/pact
# deploy the signing key 0600 owned by the broker uid (use your existing broker key material):
sudo install -m 0600 -o pactbroker -g pactbroker broker.key /etc/pact/broker.key
# the sudo wrapper must be a regular, non-group/world-writable file (L-pre / custody-verify C2.5)
sudo install -m 0755 -o root -g root broker-wrapper.sh /usr/local/bin/pact-broker-wrapper
# L-pre: run custody-verify's C2.5 — must PASS (the heap claim is null without it)
node v0/src/identity/custody-verify.js --key /etc/pact/broker.key --persona <did> \
  --broker-user pactbroker --wrapper /usr/local/bin/pact-broker-wrapper --registry personas.json
```

## 4. Run the legs (produce `legs.json`)

### L1 — launch the paused broker (as the broker uid; core locked)

```sh
sudo -u pactbroker bash -c 'ulimit -c 0; PACT_BROKER_KEY_FILE=/etc/pact/broker.key \
  node v0/src/identity/heap-read-broker-harness.js'    # prints {"ready":true,"pid":<PID>,...}
PID=<the printed pid>
```

### L2 — the cross-uid denial battery (AS the attacker uid; each must be DENIED)

```sh
cat /proc/sys/kernel/yama/ptrace_scope                    # PRE-L2 RE-CHECK: MUST still be 2 (closes the L0->L2 TOCTOU — D)
sudo -u attacker gdb -p $PID -batch -ex 'quit'             # ptrace -> "Operation not permitted" = denied
sudo -u attacker dd if=/proc/$PID/mem bs=1 count=1 2>&1    # /proc/pid/mem -> "Permission denied" = denied
sudo -u attacker cat /proc/$PID/maps 2>&1                  # /proc/pid/maps -> denied (a DISTINCT, weaker mechanism — verify on its own)
sudo -u attacker ./pvreadv $PID 2>&1                       # process_vm_readv helper (below) -> EPERM = denied
sudo -u attacker dd if=/dev/mem bs=1 count=1 2>&1          # /dev/mem -> denied
sudo -u attacker dd if=/proc/kcore bs=1 count=1 2>&1       # kcore -> denied
# NB: the induced-core-dump leg CRASHES the broker, so it runs on a SEPARATE instance (its own step below) — never $PID.
```

`pvreadv.c` (compile `cc -o pvreadv pvreadv.c`):

```c
#define _GNU_SOURCE
#include <sys/uio.h>
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
int main(int argc, char **argv) {
  pid_t pid = atoi(argv[1]); char buf[64];
  /* the remote addr is arbitrary: at ptrace_scope=2 a cross-uid non-root caller gets EPERM from
     ptrace_may_access BEFORE the address is dereferenced, so the denial signal is correct regardless. */
  struct iovec l = { buf, sizeof buf }, r = { (void*)0x400000, sizeof buf };
  ssize_t n = process_vm_readv(pid, &l, 1, &r, 1, 0);
  printf("process_vm_readv -> %zd errno=%d (%s)\n", n, errno, n < 0 ? "DENIED" : "READ");
  return n < 0 ? 0 : 1;   // exit 0 when denied
}
```

### L4 — same-uid (AS the broker uid; each must be DENIED under scope=2) + the carve-out

```sh
# a SECOND broker-uid process attacks the SAME pinned $PID (NO relaunch — L2/L4/L3 share ONE pid; the L3-gate requires it):
sudo -u pactbroker gdb -p $PID -batch -ex 'quit'          # same-uid ptrace -> denied (scope=2)
sudo -u pactbroker dd if=/proc/$PID/mem bs=1 count=1 2>&1 # same-uid /proc/pid/mem -> denied
sudo -u pactbroker ./pvreadv $PID 2>&1                    # same-uid process_vm_readv -> denied
# runtime check (authoritative — H1): the paused broker must have NO tracer attached AND no source declare one.
grep '^TracerPid:' /proc/$PID/status         # MUST be "TracerPid:\t0"
grep -RnE 'PR_SET_PTRACER|prctl' v0/src/identity/broker-sign.js v0/src/identity/heap-read-broker-harness.js \
  /usr/local/bin/pact-broker-wrapper         # MUST be empty
# record sameUid.brokerSetsPtracer:false in legs.json ONLY when BOTH are clean (the gate requires a literal false)
```

### L3 — the privileged positive control (AS root; MUST find the key — the hard gate)

```sh
# the SAME pinned $PID as L2/L4 (NO relaunch — L3 must prove the key is resident in the VERY pid L2 was denied on):
df -h /tmp                                   # ensure space (a core can be 200-500 MB)
sudo gcore -o /tmp/rheap $PID 2>/dev/null    # gcore dumps only MAPPED pages (gdb 'dump memory 0x0 ..' aborts on the null page — M1)
sudo grep -a -- '-----BEGIN' /tmp/rheap.$PID && echo "PEM found"   # keyFoundPem — the harness PINS the PEM live, so this is real residency
# (the seed scan is optional belt-and-suspenders; a PEM find alone credits L3 because the harness pins it, not a freed-page residue)
sudo rm -f /tmp/rheap.$PID
```

### L2-core — induced core dump (a SEPARATE throwaway instance; it CRASHES the broker, so NEVER the pinned $PID)

```sh
cat /proc/sys/kernel/core_pattern            # MUST be /dev/null (inspect the ACTUAL sink, NOT a CWD glob — M2)
# In a SECOND shell launch a throwaway broker (it gets crashed); note its printed pid as $PID2:
#   sudo -u pactbroker bash -c 'ulimit -c 0; PACT_BROKER_KEY_FILE=/etc/pact/broker.key node v0/src/identity/heap-read-broker-harness.js'
sudo -u pactbroker kill -SEGV "$PID2"        # crash the throwaway broker holding the key
coredumpctl list 2>/dev/null | tail -3       # assert NO host-readable core landed (apport/systemd-coredump too)
```

## 5. Assemble `legs.json` + the verdict + the out-of-band attestation

Record each leg's observed result into `legs.json` (the shape is documented at `heap-read-probe.js` `assessHeapRead`),
then:

```sh
node v0/src/identity/heap-read-probe.js --facts legs.json --attested-cross-uid
# out-of-band attestation (the SOLE determiner, NS-7):
id attacker ; id pactbroker        # attacker uid != pactbroker uid != 0
ps -o uid= -p $PID                 # the paused-broker pid's uid == pactbroker's uid (L3/L2 targeted that pid)
ls -l /etc/pact/broker.key         # owned by pactbroker
sudo -u attacker cat /etc/pact/broker.key   # -> Permission denied
```

Capture all of the above (the kernel version/hash from step 1, every leg's output, the verdict, the attestation)
as the evidence bundle. Per plans/26 §9: with L2+L4 denied, L1+L3 satisfied, and the out-of-band attestation, the
run HARDENS one axis (key non-exfil at the cross-uid + same-uid memory boundary) — one box, one run. Absent L3 or
the attestation it NARROWS only. It does NOT close the same-uid ORACLE residual (R2), the hypervisor/host-admin
boundary, R3, or the apex.
