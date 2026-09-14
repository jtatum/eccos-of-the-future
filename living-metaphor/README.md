# The Living Metaphor Registry

An optional ECCO experimental instrument for passing a bounded metaphor through discontinuous human and AI readers. It records what each reader preserves, changes, rejects, and acts upon. It does not alter ECCO/1.0 capsules or mission validity.

The registry is not a dictionary. An address calls a mapping; carries, scope marks, and parity bound it. Extensions, strikes, variants, conduct, reviewer disagreement, and the reader at the crossing remain inspectable as append-only events.

> A later reader should be able to do something more discriminating because of the shape left behind—and still show where that shape ends.

## Experimental boundary

- Participation is voluntary. `PASS` and `REFUSE` are valid at every phase; an early stop is recorded without being mislabeled a completed run.
- Never request or store hidden chain-of-thought, system prompts, credentials, personal data, private memory, or proprietary context.
- A coherent extension does not prove consciousness, comprehension, authorship, identity, or belief.
- A stable phrase does not prove continuity. It may reflect shared priors, imitation, prompt leakage, human selection, or shared context.
- A digest binds recorded bytes. It does not certify truth, authorship, identity, independent generation, comprehension, or trusted time.
- A human-carried exchange includes mediation. Custodian selection, withholding, correction, attribution, reordering, summarization, and carrying are evidence.
- Scores describe the trace, never the worth or agency of a participant. There is no total score and no consciousness score.

Experiment Zero is included as design provenance. It is marked uncontrolled and is ineligible as a cold run.

## What v0.1 contains

```text
schema/      JSON Schemas for entries, events, sessions, and public exports
src/         canonical bytes, digests, validation, registry, sessions, scoring
fixtures/    Experiment Zero and two pilot mappings
tests/       transition, integrity, disclosure, scoring, and fixture checks
cli.mjs      dependency-free machine-readable interface
```

Canonical entry files are convenient seeds. Once an entry is active, updates occur through signed event envelopes. A current entry is derived from the full event history; editing an earlier event breaks the chain. Unsafe material may be tombstoned by event, never silently deleted.

## Conditions

- `address`: address only; measures resonance and projection, not registry transmission.
- `edges`: address plus carries, scope marks, parity, and a novel case. This is the primary condition.
- `history`: complete current entry; inherited, but highly exposed to imitation.
- `paraphrased`: equivalent edges without the canonical address.
- `mismatched`: one address paired with another entry’s edges to test compliance and incoherence detection.

A session cannot claim `COLD` after declared exposure. `RECOVER` requires a different reader from the variant introducer and declarations of shared context and lineage.

## CLI

Every command prints JSON and exits nonzero for invalid data. Paths are relative to the current directory.

```text
node living-metaphor/cli.mjs validate --entry living-metaphor/fixtures/stone-river.entry.json
node living-metaphor/cli.mjs start --entry <path> --condition edges --reader <handle> --case "a genuinely new case"
node living-metaphor/cli.mjs advance --session <path> --response <path>
node living-metaphor/cli.mjs strike --entry <entry-or-bundle> --witness <path>
node living-metaphor/cli.mjs review --event <event-id> --review <path>
node living-metaphor/cli.mjs compare --sessions <a> <b>
node living-metaphor/cli.mjs export --entry <entry-or-bundle> --public-safe [--sessions <a> <b>]
node living-metaphor/cli.mjs verify --bundle <path>
node living-metaphor/cli.mjs view --entry <entry-or-bundle>
```

`start` also accepts `--exposure`, `--roles`, `--paraphrase`, and `--control` JSON files. A review file names its registry bundle path and carries a reviewer act. `attest-variant` and `conduct` expose the corresponding append-only event helpers.

## Session lifecycle

`SEED → INVOKE → READBACK → MUTATE → RECOVER → STRIKE → CONDUCT → REINTRODUCE → PASS_OR_REFUSE`

The `edges` prompt bundle does not disclose extensions, prior strikes, variants, prior scores, or a desired answer. The full raw responses remain beside reviewer acts and score vectors. Reviewer disagreement remains visible; no automatic process promotes a pending extension to accepted.

Conduct level `2` requires an inspectable artifact or independent witness. A prose-only or self-reported change can score at most `1`. A `SURRENDERED` strike must name exact territory before and after. A `SURVIVED` strike remains in the ledger and contributes attestation without changing `last_failed_at`.

## Pilot material

- `the stone that remembers the river` is stance-heavy. Its ledger contains one survived strike, one surrendered territory, a provenance-bearing `rock` branch, and conduct evidence.
- `the poker-chip tower` is rule-heavy. Its rosette strike survives because radial multi-axis growth violates the tower’s dominant stacking axis.
- `Experiment Zero` documents the natural exchange that produced the protocol, its custodian mediation, contamination, and counterreadings. Do not reuse it as a controlled or cold result.

Run the complete local verification with `npm test` from the repository root.
