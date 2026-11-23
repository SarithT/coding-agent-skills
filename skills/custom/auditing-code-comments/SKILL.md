---
name: auditing-code-comments
description: Use when auditing, cleaning up, or cutting down the comments in a codebase, a directory, a set of files, or a branch's diff. That means deleting comments that restate the code, removing stale ones and commented-out code, turning TODO/FIXME/HACK notes into issues, moving design rationale into ADRs, encoding "do not remove" constraints as checks, and finding lint or type suppressions that hide real bugs. Also use when asked to "check the comments", "remove useless comments", "kill comments", "clean up TODOs", count or list the comments in a repo, or verify that a change or PR adds no new prose comments. Not for writing new comments or docstrings.
---

# Auditing code comments

A prose comment is a claim about the code that nothing checks. Compilers, type
checkers and tests check the code. Nothing checks the comment, so it drifts
until it misleads. The default is therefore to **delete**. A comment stays only
when it fits the keep list below and you can show that it does. Before you
delete, anything a comment knows that the code doesn't say moves to a better
home:

| What the comment knows | Better home |
| --- | --- |
| A shortcut or known defect | An issue in the tracker |
| A trade-off or design decision | An architecture decision record (ADR) |
| A surprise in our own code ("must call init first", "id is in cents here") | Code that makes it obvious: a rename, an extracted function, a type |
| A rule that must hold ("do not remove", "keep in sync with X") | A check that fails: a type, an assertion, a test, a CI lint |

Your report is not a home: it is gone when the session ends. Sometimes the
better home can't be written yet: there is no tracker or ADR folder, or the
reshape or check hasn't been approved. Then the comment stays until it can be,
unless a reader could work out the same fact from the code.

## Scope

Use the files, directories, or diff the user names. "My changes", "this PR" or
"this branch" means the diff against the base branch, including uncommitted
work. With no scope given, audit the whole repository, a directory at a time.
Find the base branch from `origin/HEAD`, falling back to `main` or `master`.

The scope limits which comments you audit and edit. Don't touch other comments
or code outside it; when you find a problem there, report it instead. An ADR or
issue that records a comment from inside the scope goes wherever the project
keeps them, even when that is outside the scope.

Do only what was asked. If the user wants comments counted, listed or checked,
report the result and stop. Edit only when they ask for a cleanup.

## 1. Read the project's rules

Read the agent instruction files (AGENTS.md, CLAUDE.md and the like),
CONTRIBUTING, and the linter configs. Where they disagree with this skill, the
project wins. For example, a linter that requires doc comments on exported
symbols means those comments stay. Also note:

- **The ADR home**, such as `docs/adr`, `docs/decisions` or `adr`, and its
  numbering and template.
- **The issue tracker**, such as GitHub (`gh repo view`), GitLab or Jira.
- **The tools that read directives**: which linters, type checkers and
  formatters run, and whether you can run them here.

## 2. Inventory

If the project ships its own comment tooling, such as a comment ratchet script
or a lint rule, use it. Its baseline is what CI enforces. Otherwise, search the
scope with `git grep`. Adjust the markers to the languages present (`--` for
SQL and Lua, `<!--` for HTML and Markdown, `{/*` for JSX):

```sh
N=':!*.md'   # Markdown headings start with '#'; leave this out when auditing docs
git grep -nE '^[[:space:]]*(//|#|/\*|\*|--|<!--)' -- <scope> "$N"                  # line comments and block-comment lines
git grep -nE '[^[:space:]][[:space:]]+(//|#)[[:space:]]' -- <scope> "$N"           # trailing comments (noisy)
git grep -nE "^[[:space:]]*[rRuU]?(\"\"\"|''')" -- '*.py'                          # Python docstrings
git grep -nwE 'TODO|FIXME|HACK|XXX' -- <scope>                                     # debts
git grep -nE 'eslint-disable|@ts-(ignore|expect-error|nocheck)|type: ignore|noqa|nolint|NOLINT|shellcheck disable|biome-ignore' -- <scope>   # suppressions
git grep -cE '^[[:space:]]*(//|#|/\*|\*|--)' -- <scope> "$N" | sort -t: -k2 -nr | head   # densest files first
```

Grep can't tell a comment from the same characters inside a string, a URL, a
heredoc or a shebang. Treat its counts as approximate, and confirm each hit
when you read it. Skip:
- generated files, which have a header such as `Code generated … DO NOT EDIT`
  or `@generated`
- vendored directories (`vendor/`, `node_modules/`, `dist/`, `third_party/`)
- minified files

**Checking a diff** (a branch, a PR, or your own change) for new comments: read
the `+` lines of `git diff <base>...<branch>`, or of `git diff <base>` for the
working tree. Every added comment line is new prose unless the same text was
removed elsewhere in the diff:
- **Reworded:** the comment is still new prose.
- **Moved:** check that it still sits next to the code it describes.

For a large scope, you can give each directory to a subagent with this skill's
rules, for a first pass with fresh eyes. Check each report before you accept
it. Reject:

- edits to code
- edits outside the scope
- deletions of keep-list comments
- flags whose reason doesn't hold up

## 3. Classify every comment

Read each comment next to its code. When a comment makes a claim, check it:
trace the symbol, read the callers and tests, and look at the history
(`git log -L <start>,<end>:<file>`, `git blame`, the linked PR).

**Keep list.** A comment stays only if it is one of these:

- A license or legal header.
- A generated-file notice. Change prose in generated output at its source.
- Docs that state an API contract the signature doesn't show: the errors it
  raises, units, timing, side effects. This covers functions that other
  modules call, a published API, and docs a doc generator reads.
- A **foreign constraint**: behavior forced by a dependency, platform, vendor
  or protocol that we cannot change, and that is still true today on a live
  code path. An issue or RFC link that explains it is ideal. Keep it short.
- A comment that a tool or the runtime reads:
  - compiler and build directives (`//go:build`, `//go:embed`, `//go:generate`)
  - cgo preambles
  - PEP 723 script metadata
  - codegen markers
  - docstrings read at runtime, such as CLI help built from `__doc__`, or
    doctests
  - suppressions that pass the suppression check below

  Deleting one of these can change what the program does even though only a
  comment changed.

When you can't show that a keep reason applies, the comment goes. Before it
goes, move what it knows to its better home.

**Everything else:**

| Category | Example | Action |
| --- | --- | --- |
| Tautology | `// increment the counter` above `count++`; `/** Returns the user. */` | Delete. |
| Stale | `// retries 3 times` above `maxRetries = 5` | Confirm the mismatch, then delete. If callers, tests or docs expect what the comment says, the code may be the bug. Then the comment is the only record of the intended behavior: keep it until a test or issue records that behavior, and report it as a possible bug. |
| Dead code | A commented-out block | Delete it once you've confirmed a commit holds it (`git log -S'<a distinctive line>'`). Uncommitted commented-out code may be someone's work in progress: leave it and mention it. |
| Our-code surprise | `// must call init() before load()`; `// amount is in cents here` | Flag the symbol for a reshape that makes the comment unnecessary (rename, extract, type, reorder). Delete now if the code already shows the fact. Otherwise keep it until the reshape lands or an issue records it. |
| Debt | `TODO`, `FIXME`, `HACK`, "fine for now", "temporary" | Capture it in an issue, then delete. |
| Decision | `// advisory locks, not SELECT FOR UPDATE: the job spans transactions` | Record it in an ADR, then delete. |
| Constraint | "do not remove", "keep in sync with X", "talk to Y before changing" | Offer to encode it as a check (step 5). Then delete. |

These are warning signs, not reasons to keep: `IMPORTANT`, `do not remove`,
`too risky`, `fine for now`, and long justifications. Check the claim. If it is
a foreign constraint and still true, keep it. If it is about our own code, it
is a surprise or a constraint. If you can't confirm it either way, it goes.

**Suppression check.** Use this for `eslint-disable`, `@ts-ignore`,
`@ts-expect-error`, `# type: ignore`, `noqa`, `nolint`, `shellcheck disable`
and similar. Look up the rule each one silences.

- **Unused** (the rule no longer fires): delete it, but only after running the
  tool and seeing that it is unused. For example, run mypy with
  `--warn-unused-ignores`, or run the linter with the directive removed. If you
  can't run the tool, keep the directive and say so.
- **Style-only, pedantic or faulty rule:** keep it.
- **Rule that guards correctness or safety** (type errors, floating promises,
  hook dependencies, security rules): report which rule is silenced and where.
  Call it a likely bug only when you can name the failure, such as an input or
  a caller that breaks. A rule firing is not proof of a bug. Leave the
  suppression in place for now, because removing it alone just breaks the lint.
  Remove it in the follow-up that fixes the code.

When one block holds several categories, capture each part before you delete
the block.

## 4. Capture before deleting

- **Issues.** Say what the shortcut is, its impact (what breaks, for whom, and
  when), and a concrete fix. Point to the code as `path:line` at a commit, or
  as a permalink. Reuse an existing issue when one already covers it. Filing an
  issue posts to a shared tracker, so confirm before you file the first one,
  unless the user already asked you to file issues. If you can't file, put the
  drafted issue in your report and **leave the comment in place** until someone
  files it.
- **ADRs.** Follow the project's template and numbering, or use *Title /
  Status / Context / Decision / Consequences*. Write one ADR per decision, and
  extend an existing ADR when it already covers the decision. If the project
  has no ADR home, ask once whether to start `docs/adr/`. Until someone
  answers, keep decision comments in place.
- **Reshape flags** go in the report, one line each: the symbol, and the change
  that would make the comment unnecessary. Invent nothing: every flag names
  real code inside the scope.

## 5. Constraints: offer an encoding

The best home for a rule that must hold is a check that fails when someone
breaks it. For each constraint comment, offer the cheapest check that enforces
it within the scope: a type, a runtime assertion, a test, or a CI lint. Adding
a check changes code, so ask first, and wait for approval.

- **If approved:** add the check as its own change, then delete the comment.
- **If declined:** record the constraint in an ADR or an issue, delete the
  comment, and list it in the report as not enforced. If there's nowhere to
  record it, keep the comment.

## 6. Edit

- **Keep the change to comments only.** Don't fix bugs, rename symbols or
  refactor in this change: a diff that only touches comments can be reviewed
  as having no behavior change.
- **Remove whole comments**, along with the blank lines and empty wrappers they
  leave behind (a JSX `{/* … */}`, an empty `/** */`). Run the formatter.
- **Keep the code valid.**
  - A Python docstring that is the whole body of a function or class needs
    `...` or `pass` in its place.
  - Linters that require doc comments on exported identifiers will fail if you
    remove those comments.
- **Don't reword a comment to make it correct.** A shorter, truer comment is
  still prose that will drift again. Delete the comment, or move it to its
  better home.

## 7. Verify and report

1. Read every hunk of `git diff`. It should contain only removed comment
   lines, plus formatter whitespace, `...`/`pass` placeholders, and new ADR
   files. Any other `+` line, or a `-` line that isn't a comment, is a mistake.
2. `git diff --check` is clean.
3. The formatter, linters, type checker, and the tests nearest the changes all
   pass. If the project has its own comment ratchet, that passes too. Report
   any check that was already failing before you started separately.
4. Before and after counts: run the same inventory searches on the same scope
   paths before you edit and again after, and compare. Call the counts
   approximate if they come from grep.

Report in this shape:

```markdown
## Comment audit: <scope>

Scope: <paths reviewed>; not reviewed: <paths, if partial>
Comments: <before> → <after> (comment-only lines: <before> → <after>)

Deleted: <n> tautologies, <n> stale, <n> dead code, <n> surprises, <n> unused directives
Issues: <link or "drafted below">: <one line each>
ADRs: <path>: <one line each>
Reshape flags: <path:line symbol>: <rename/extract/type/reorder to what>
Suppressions hiding bugs: <path:line rule>: <the likely bug>
Constraints: <encoded as …> | <offered, not enforced yet>
Possible bugs: <path:line>: the comment says X, the code does Y
Kept: <n>, by keep reason (or "waiting for an issue to be filed")

Checks: comment-only diff ✓ · git diff --check ✓ · <lint/tests> ✓ · <project ratchet, if any> ✓
```

## 8. Offer the follow-up

The reshape flags, the suppressions hiding bugs, and the approved constraint
encodings are code changes, so they belong in a separate change after this one.
Offer that change, and if the user accepts:

- Make the smallest fix that removes the root cause: delete the dead path, drop
  the parameter, use the real API, rename the symbol.
- Don't add guards that only hide the symptom.
- If a fix needs design work, sketch it and ask before you build it.
- Stay inside the scope, and report anything outside it as open.

## Red flags

| Thought | Reality |
| --- | --- |
| "This comment helps newcomers" | If it repeats the code, newcomers can read the code. If it explains a surprise, make the code obvious. |
| "I'll reword it so it's accurate" | It will drift again. Delete it, or move it to its better home. |
| "It says IMPORTANT / do not remove" | That's a reason to check it. Confirm the claim, then encode it as a check or delete it. |
| "The TODO is obvious, just delete it" | Capture it in an issue first. Otherwise the debt disappears without a trace. |
| "I'll fix this while I'm here" | That's a separate change. Keep this diff to comments only. |
| "The comment and the code disagree, so the comment is stale" | Check which one callers and tests rely on. The code may be the bug. |
| "This directive looks unused" | Run the tool that reads it. If you can't, keep it. |
| "The suppression is ugly, delete it" | Find out what the rule catches. A correctness rule means the code needs fixing first. |
| "No ADR folder, so I'll create one" | Ask first. |
