---
name: meaningful-unit-tests
description: Use when writing, generating, extending or reviewing unit tests, especially adding tests to existing code, chasing a coverage target, or being asked to "fully test" a module. Also use when tests assert substrings of generated text, constant values, getters, type or not-null checks (instanceof, toBeDefined, assertNotNull, isinstance), mock call order, or snapshots, or when tests break on every refactor while missing real bugs.
---

# Meaningful Unit Tests

## What a unit test is

A unit test checks a small, defined part of the software under controlled
conditions. That part can be a function, a class, or a few objects that work
together. The test is deterministic, independent of other tests, and fast
enough to run on every change. It asserts **behavior**: outcomes you can see
through that part's public interface.

- **Observable behavior** means return values, state readable through the
  public API, errors that callers handle, and effects that cross the system
  boundary (an email sent, a row written, a request made).
- **Not observable:** which private helper ran, the order of internal calls,
  intermediate data, and values or wording that nobody outside relies on.

**This skill takes the classical ("sociable") stance.** Keep in-process,
deterministic collaborators real. Use test doubles to control what is slow,
nondeterministic, failing or external: network, database, filesystem, clock,
randomness, third-party services. Assert on a double's calls only when the
interaction itself is the contract. For example, the confirmation email must
be sent once, to this address, with this content.

A test is worth its maintenance cost only if it does all four:

1. **Catches regressions:** it fails when the behavior breaks.
2. **Survives refactoring:** it keeps passing when the code changes but the
   behavior doesn't. A test that fails on harmless refactors is a false alarm,
   and teams learn to ignore tests that raise them.
3. **Is fast and deterministic.**
4. **Is obvious when read:** the name states the behavior, and the expected
   value can be checked by hand.

A **slop test** fails 1 or 2. It runs code and raises coverage, but no
realistic bug makes it fail. Or it fails on every harmless change, which makes
it a change detector rather than a test.

The examples below use TypeScript with Jest-style assertions. The rules apply
to any language and test framework: map each matcher to its equivalent in
yours.

## The per-test recipe

Before writing each test, write down three things:

| Slot | Content | Becomes |
| --- | --- | --- |
| **Behavior** | "When <situation>, <outcome visible from outside>" | the test name |
| **Bug it catches** | A realistic wrong implementation that makes this test fail: an off-by-one, the wrong branch, a missing check, wrong rounding, a skipped side effect | your justification |
| **Oracle** | Where the expected value comes from. It must be independent of the code under test: a hand calculation, a documented example, a reviewed reference output, or a property that must always hold (a round-trip returns the input; output is sorted; the total never goes negative). Never re-implement the algorithm inside the test | the assertion |

Then ask: **"Would this test still pass after a behavior-preserving
refactor?"** If not, it's coupled to the implementation, so assert the
outcome instead.

If you can't fill in **Bug it catches**, don't write the test.

**Characterization tests** are a separate kind. When the task is to pin down
how existing code behaves *before changing it*, the expected values are what
the code currently outputs. Label them as characterization tests, for example
in their own group or file, or with a `characterization:` prefix in the test
names. List anything that looks wrong
under "Suspicious behavior" in the report, so it isn't mistaken for the spec.

## What deserves tests

Test the responsibility wherever it lives, not particular kinds of code.

| Test | Usually skip |
| --- | --- |
| Calculations, rules, branching logic | Constants whose only "spec" is their own declaration |
| Boundaries: 0, empty, one, limit, limit+1, negative, max, rounding | Getters, constructors and DTOs that only assign and return |
| Validation, defaults and computed values, including inside constructors or getters | Pure delegation or wiring (cover it with an integration test) |
| Error paths callers depend on; state transitions | Framework or library behavior |
| Parsing, serialization, runtime checks on untrusted input | What the type checker already guarantees for internal calls |
| What you send to external systems | Log lines, unless the log is a requirement |
| Values fixed by an outside spec (protocol version, API limit): assert against the spec | |

Pick representative inputs from each meaningful equivalence class, plus
boundaries and the important combinations between them. More values from the
same class add no protection. Parametrize cases that share a shape.

## Recognizing slop and fixing it

Judge an assertion by the behavior it protects, not by the matcher it uses.
The key question is: **"Would this assertion fail if the logic broke?"**

| Slop | Risk | Instead |
| --- | --- | --- |
| **Substring of static text:** `expect(body).toContain('Thanks for your order')` | That text is there whatever the logic does | Assert the parts the logic produces (`'Total: $18.00'` for a discounted order), or the full output where the text itself is the contract |
| **Negative substring to show a branch wasn't taken:** `not.toContain('more items')` | Passes trivially once the wording changes | Assert positively what should be there, e.g. the exact list of lines. Negative assertions are right when absence *is* the requirement, e.g. a password never appears in a log |
| **Logic tested only through formatting** | A formatting change breaks the logic test, and vice versa | Test the calculation directly, and check separately that the public output uses its result |
| **Constant echo:** `expect(MAX_ITEMS).toBe(3)` | Restates the source; fails only on intentional changes | Test the behavior the constant controls: "the 4th item is summarized as 'and 1 more item'" |
| **Accessor echo as the only assertion:** set then read; `toBeInstanceOf`, `toBeDefined` | The language and type checker already guarantee it | Assert the first outcome that *uses* the value |
| **Mirror assertion:** the expected value is computed by the very unit under test | Always agrees with itself | Write the expected value by hand. In a composition test, building the expected value with a *separately tested* collaborator is fine: it checks the inputs passed on and the call made |
| **Mocking in-process collaborators**, or asserting the order of internal calls | Tests wiring, not results; breaks on every refactor | Keep them real. Assert calls only on boundary dependencies, with exact arguments |
| **Large snapshot nobody reviews** | Gets re-recorded on every change | Assert the specific properties that matter, or keep a small snapshot that is reviewed like code |
| **Pinning incidental behavior:** a `KeyError` from a dict lookup, which validation runs first | Locks in accidents nobody decided on | Assert what callers rely on |
| **Bare rejection check:** `rejects.toThrow()` or `pytest.raises(Exception)` with nothing else | An unrelated crash passes too | See "Errors and side effects" |
| **Current output used as the spec in a correctness test** | Turns bugs into requirements. Example: `days // 365` drifts on leap years, and a test calling that "correct" protects the bug | Derive expected values from intent and report the disagreement, or label the test as characterization |
| **A value re-asserted in tests that are about something else:** the full email body pinned again in the "service sends email" test | One intentional wording change breaks many tests | Each test asserts what it is about. The "sends email" test checks the recipient and the subject that identifies the order. Distinct contracts or variants still get their own tests |
| **Coverage padding:** calling a function without a meaningful assertion | Coverage goes up while protection stays the same | Leave it out and name it in the report |
| **Testing private methods** by reaching into internals | Couples the test to the structure | Test through the public API; if that's impossible, the design is telling you something |

## Errors and side effects

- Identify the specific rejection: its error class, an error code, the field
  it names, or the message when the message is part of the contract. Check
  more than "something threw".
- For validation failures, check that the forbidden side effects didn't
  happen: nothing saved, nothing sent.
- For failures after work has started (for example, the save succeeded but
  the email failed), assert what is required: what stays persisted, rolled
  back, retried or reported. If nobody has defined that, write a
  characterization test and ask in the report.

## Reliable tests

- Await asynchronous work and the assertions on it.
- Control time, randomness and timers by injecting a clock or seed, or by using
  fake timers. Don't use sleeps or live network calls.
- Restore anything patched, and clean up the resources you created.
- A flaky test points to a bug in the test or the code. Find the cause; don't
  add retries.

## Coverage targets

Coverage shows which code **no test runs**. It says nothing about whether the
code that does run is actually tested. Reach the target with behavior tests.
If the target is still missed and the remaining lines are trivial (accessors,
constants, glue), say so in the report. Don't write a test whose only purpose
is to execute a line.

## Adding tests to existing code

1. **List behaviors first, from outside:** the names, docstrings, types,
   callers and requirements. Write the expected outcomes *before* studying the
   implementation, so you don't copy what it does.
2. **Partition** each behavior's inputs into equivalence classes and boundaries.
3. **Derive** the expected values from an independent oracle. Show the
   arithmetic in a short comment.
4. **Mutation check.** For each test, name the code change that would make it
   fail, e.g. `>=` changed to `>`, a dropped `round`, a removed branch, or a
   result computed but never used. If you can run the tests, actually make one
   or two of these mutations and confirm that a test fails. If a mutation
   survives, decide whether it changes required behavior (some mutations
   don't). If it does, add a test.
5. **Report** (below).

## Reviewing an existing test suite

For each test, decide **keep / rewrite / delete** using the slop table, then
apply the per-test recipe to whatever you rewrite. Deleting slop is a valid
outcome, so say what you deleted and why.

## Report

End every test-writing task with:

```
Tests run: <command and result, or "not run: <reason>">

Behaviors covered:
- <one line per behavior>

Deliberately not tested:
- <thing>: <reason: trivial / covered by integration test / framework behavior>

Suspicious behavior found:
- <what the code does> vs <what it looks like it should do>: <test written for intended behavior and currently failing, or a question for the author>

Remaining gaps or uncertainty:
- <what is still unprotected or unverified>
```

## Example

```typescript
// Code under test: buildConfirmationEmail(order, coupons) -> { subject, body }
// Lists the first 3 items, then "and N more item(s)"; shows the discounted total.
// Test helpers: order(overrides) builds a valid Order, line(qty, price, name?) a LineItem,
// items(n) n distinct items, summaryLines(body) the item lines of the email body.

// ❌ Slop: true for almost any implementation, or restates the source
expect(MAX_ITEMS_IN_SUMMARY).toBe(3);
expect(email.body).toContain('Hi');
expect(email.body).not.toContain('more item');
expect(email).toBeDefined();
await expect(service.place(order({ items: [] }), to)).rejects.toThrow();

// ✅ Behavior: each test fails on a realistic bug

it('applies the coupon percentage to the order total', () => {
  // 2 × 10 = 20, minus 10% = 18
  expect(orderTotal(order({ items: [line(2, 10)], couponCode: 'TEN' }), { TEN: 10 })).toBe(18);
});

it('shows the discounted total in the confirmation email', () => {
  // Catches the email computing its own total and ignoring the coupon
  const { body } = buildConfirmationEmail(order({ items: [line(2, 10)], couponCode: 'TEN' }), { TEN: 10 });
  expect(body).toContain('\nTotal: $18.00\n'); // a value the logic produced, not static text
});

it('summarizes items beyond the third as "and N more"', () => {
  const lines = (n: number) =>
    summaryLines(buildConfirmationEmail(order({ items: items(n) }), {}).body);
  expect(lines(3)).toEqual(['1 × i1', '1 × i2', '1 × i3']); // at the limit: nothing hidden
  expect(lines(4)).toEqual(['1 × i1', '1 × i2', '1 × i3', 'and 1 more item']);
  expect(lines(5)).toEqual(['1 × i1', '1 × i2', '1 × i3', 'and 2 more items']);
});

it('renders the full confirmation email', () => {
  // Pins the wording once: the email text is the contract with the customer
  expect(buildConfirmationEmail(order({ id: 'o-1', customerName: 'Ada', items: [line(2, 10, 'Widget')] }), {}))
    .toEqual({
      subject: 'Order o-1 confirmed',
      body: 'Hi Ada,\n\nThanks for your order:\n2 × Widget\n\nTotal: $20.00\n\nQuestions? support@acme.test',
    });
});

it('rejects an order without items and neither saves nor emails it', async () => {
  await expect(service.place(order({ items: [] }), to)).rejects.toThrow('no items');
  expect(repo.save).not.toHaveBeenCalled();
  expect(mailer.send).not.toHaveBeenCalled(); // the mailer is a boundary, so its calls are behavior
});

it('does not email the customer when saving fails', async () => {
  repo.save.mockRejectedValue(new Error('db down'));
  await expect(service.place(validOrder, to)).rejects.toThrow('db down');
  expect(mailer.send).not.toHaveBeenCalled();
});
```

## Red flags: stop and apply the recipe

- You're writing a test because a line is uncovered, not because a behavior is unprotected
- The expected value was copied from running the code, outside a labeled characterization test
- The assertion would still pass if the function returned something wrong
- The test fails when you reword an internal message, rename a private method or reorder internal steps
- The code looks wrong and you're about to write a test confirming it as correct
