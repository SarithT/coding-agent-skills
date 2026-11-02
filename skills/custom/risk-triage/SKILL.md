---
name: risk-triage
description: Use when reviewing code or a design for bugs, writing up review findings, or deciding which findings from another reviewer (a person, another agent or model, a review bot, a subagent) to fix. Also use when a finding depends on "could", "in theory", "if two requests race" or "if the data is malformed", when a reviewer's severity label drives the decision, or when a proposed fix adds locks, retries, fallbacks, migrations, new dependencies or new abstractions.
---

# Risk Triage

A finding is worth reporting or fixing when its **realistic** risk outweighs what
the fix costs. Most review noise is true in theory and never happens in this
system. Every fix adds code that someone must read, test and maintain, and a fix
can break things too: locks deadlock, migrations delete rows, fallbacks hide
corruption.

Triage every finding the same way: your own findings before you report them,
and other reviewers' findings before you act on them.

## 1. Learn how the system is really used

Before scoring anything, read the project's README, its agent instruction
files (such as AGENTS.md or CLAUDE.md) and the surrounding code for:

- **Who sends the input.** Is it an untrusted client, or your own code after
  validation? Look for schemas, types, database constraints and foreign keys.
- **Volume.** Find the number of users and requests, and how often jobs run.
- **Concurrency.** Can two writers really touch the same data at once? Is the
  data per-user? Which background jobs run alongside requests?
- **Recovery.** What is persisted? What corrects itself (a refresh, a retry, a
  nightly recompute)? What fails loudly?

Project instructions that state usage facts or thresholds override the defaults
below.

## 2. Write the trigger

For each finding, write the **trigger**: the concrete events that cause it,
using real actors and the code they reach. For example: "a user presses
Enter twice in the invite dialog, so two `POST /invites` requests reach
`inviteMember` (invites.ts:42) at the same time."

- "A caller could pass X" only counts if you can name a caller that does, or
  plausibly will.
- The trigger has to get past the guards that already exist: upstream
  validation, types, constraints, documented invariants. A guard counts only if
  you have seen it: cite the file, schema or doc line. An assumed guard (a
  foreign key you didn't see, an invariant the docs don't state) doesn't count.
  If the finding is Severe without the guard and you can't check it, decide Ask
  and say what to verify.
- In a library or public API, any input the documented contract allows is
  reachable: callers outside the repo count. Types are a guard only if every
  caller is type-checked against them.
- For timing windows, size the window **per event**, not across a whole job. A
  10-minute export that holds each order for 2 ms has a 2 ms window per order.
  Multiply that by how often the colliding event happens, then add it up over
  every entity and run in a year. If you don't know the rates, say so and show
  your estimate.
- If writing the trigger needs "somehow", you haven't found one yet.

## 3. Score it

**Likelihood**

| Level | Meaning |
|---|---|
| Common | Happens on a normal path. Regular use or every run hits it. A one-in-a-million event at millions of requests a day is Common. |
| Plausible | Needs a specific but realistic condition you can name: an uncommon real user action (double-click, back button, two tabs), a job overlapping a request in a window real traffic hits, a dependency timing out, a webhook or message delivered twice, bad data from an external source, or **an attacker who controls the input**. |
| Rare | The trigger is reachable, but your estimate puts it at less than about once a year at current volume. |
| Ruled out | Evidence you have seen excludes the trigger: validation that rejects the input, a constraint, a documented invariant, no code path that produces the state. Cite it. |

For security findings (auth, another user's data, injection), likelihood is
whether an attacker can reach the trigger, not whether a normal user would. An
authenticated user sending a crafted request is Plausible. Requiring a login and
"no abuse so far" don't lower it. A missing control on its own (no rate limit,
no extra header) is not a finding: name the exploit and what the attacker
gains.

**Impact.** Score what actually happens, counting the safety nets that already
exist.

| Level | Meaning |
|---|---|
| Severe | Another user's data is read or changed. Stored money or data is wrong or lost. The damage is irreversible, or the service goes down. |
| Moderate | A feature gives wrong results or stops working for affected users until someone steps in or a later job corrects it. Data can be recovered. |
| Minor | Cosmetic or a wrong status code. Corrects itself on a refresh or a safe retry. A clear error the user can retry safely. A duplicate the user can remove. |

Score the worst consequence before recovery. A value a nightly job corrects is
still wrong until then: if users or code act on it in between (pay, transfer,
export, notify), score that action. A retry only makes something Minor if
retrying can't double the effect (a second charge, a second email). A silent
wrong value is worse than a loud failure of the same frequency.

**Fix cost.** Score the simplest fix that removes the trigger, not the fix the
reviewer proposed.

| Level | Meaning |
|---|---|
| Small | Local and a few lines. Adds no new concept and needs no rollout step. |
| Medium | A new query, check or validation in a few places, plus its test. An additive migration (an index, or a constraint the existing data already satisfies). |
| Large | Locks, transactions with retries, a new dependency, a new abstraction or config, a change across services, or a migration that rewrites or deletes existing data. |

Judge cost by the concepts, tests and rollout it adds, not by line count.

## 4. Decide

| Likelihood ↓ / Impact → | Severe | Moderate | Minor |
|---|---|---|---|
| **Common** | Fix | Fix | Fix if Small or Medium, else Ask |
| **Plausible** | Fix | Fix if Small or Medium, else Ask | Fix if Small, else Drop |
| **Rare** | Fix if Small, else Ask | Drop | Drop |
| **Ruled out** | Drop | Drop | Drop |

- **Fix:** report it, and fix it if you are implementing.
- **Ask:** report the trade-off (risk and cost) for the owner to decide. Don't
  implement it.
- **Drop:** don't propose a fix and don't implement anything.

Another reviewer's severity label is not an input. Re-score from the trigger. A
"Critical" finding whose input your cited validation rejects is Ruled out.

## 5. Fix proportionately

- Prefer the fix that removes the trigger over one that manages it: correct the
  condition, scope the query, or make the write a single atomic statement. Do
  that before reaching for locks, retries or new layers.
- Validate once, at the trust boundary. Don't re-check inside the core for
  states that can't reach it.
- When a Rare finding is Severe, the Small fix is usually to **fail loudly**
  (an assertion or an explicit error), not to build recovery.
- Don't add fallbacks that turn corruption into defaults (a try/catch that
  returns default settings). They hide the bug you would need to see.
- If the reviewer's fix is heavier than yours, use yours and say why.

## Output format

Reported findings (Fix and Ask), most severe first:

```markdown
### <short title> (path/to/file:LINE)
Trigger: <real actor does X → code path → wrong result>
Likelihood: Plausible. <why; which existing guards don't stop it>
Impact: Severe. <what breaks; recoverable or not; loud or silent>
Fix cost: Small. <the simplest fix>
Decision: Fix
```

In your own review, don't describe dropped findings. End with one line:
`Dropped N lower-risk candidates (details on request).`

When you act on someone else's review, give every finding a decision (Fix, Ask
or Drop) with a one-line reason, and say where your fix is simpler than the
one they proposed.

## Red flags

| Thought | Reality |
|---|---|
| "It's possible, so it should be handled" | Possible isn't likely. Write the trigger. |
| "The reviewer marked it High" | Labels aren't evidence. Re-score. |
| "The job runs for minutes, so the race window is real" | Size the window per event. |
| "This is the robust way to do it" | Robustness against a trigger that never happens is cost with no benefit. |
| "Better safe than sorry" | The fix has risks too: deadlocks, data-rewriting migrations, hidden corruption. |
| "I'll mention it just in case" | Mentioning it is the noise. Count it in the Dropped line. |
| "There's probably a foreign key / validation for that" | An unseen guard doesn't count. Find it or score without it. |
