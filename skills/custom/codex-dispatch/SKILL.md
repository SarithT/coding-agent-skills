---
name: codex-dispatch
description: If you are Codex, do not load this skill. Use when an agent other than Codex hands work to OpenAI Codex, such as delegating an implementation task, a fix round or a code review, resuming a Codex session, or running `codex exec`.
---

# Codex Dispatch

**If you are Codex, ignore this skill.** It is for agents that launch Codex.

Launch every Codex run, fresh or resumed, through the bundled script. It wraps
`codex exec` with the flags that long unattended runs need, and it stops Codex
cleanly when the run stalls or is cancelled.

## Launch

```bash
bash <this skill's directory>/scripts/codex-dispatch \
  --repo <dir> --model <model> --effort <effort> \
  --prompt <prompt-file> --log <log-file> \
  [--resume <session-id>] [--read-only] [--add-dir <dir>]... \
  [--out <file>] [--timeout <minutes>]
```

- **Run it as a background command** that notifies you when it exits, if your
  harness can do that. Codex runs often take longer than a harness allows a
  foreground command to run. Don't poll the log while you wait.
- **If your harness has no background commands,** run it in the foreground
  with `--timeout` set below the harness's command time limit.
- **Write the prompt to a file first.** The script sends it to Codex on stdin,
  so length and leading dashes don't matter. Inside the prompt, pass paths to
  plans, briefs, diffs and report files instead of pasting their contents.
- **Use one log file per task.**

**Output.** stdout is Codex's final message, followed by
`codex-dispatch: session <id> exit <code>`. `--out` also saves the final message
to a file. The log collects Codex's event stream and errors; read it only when a
run fails.

| Exit code | Meaning |
|---|---|
| 0 | Codex finished. |
| 2 | Bad arguments, or a resume started a different session than requested. |
| 124 | No session within 90 seconds, or `--timeout` passed. The script stopped Codex. |
| 129, 130, 143 | The script was hung up, interrupted or terminated, and stopped Codex first. |
| Other | Codex's own exit code. |

Independent runs, such as two reviews of the same diff, can go out in parallel.

## Sandbox

| Mode | What Codex can do |
|---|---|
| Default | Write in `--repo` and `/tmp`, with network access. Approval requests go to Codex auto-review (`--approve-for-me`) instead of failing. |
| `--add-dir <dir>` | Also write in `<dir>`. Repeatable. `CODEX_DISPATCH_ADD_DIRS` (colon-separated) adds directories for every run, such as toolchain caches or a report directory outside the repo. |
| `--read-only` | Read only, so it can't run anything that writes. For design and plan reviews. These sessions are never resumed. |

Anything outside the sandbox, such as a container daemon or a database,
depends on the local Codex configuration and its rules, not on this script.

## Model and effort

- **Pass `--model` and `--effort` on every call, including resumes.** A resumed
  session doesn't keep them. Without them it falls back to Codex's configured
  default and only prints a warning.
- **Use the project's choice.** Take the model and effort for each role from
  the project's instructions.
- **If the project names none,** use the `model` and `model_reasoning_effort`
  set in `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`). If those
  aren't set either, ask the user. Don't invent a model name.
- **Record the pair you used at the first dispatch,** and reuse it for that
  task's fix rounds unless you deliberately move up a tier.

## Resuming for fix rounds

- **Record every session id** somewhere that survives context compaction, such
  as the plan's progress file or ledger. For example:
  `Task 3: implementer codex <session-id> <model>@<effort>`.
- **Resume with `--resume <session-id>`.** Never use `codex exec resume --last`:
  implementer and reviewer sessions interleave, so "last" is usually the wrong
  one. The script stops a resume that comes back with a different session.
- **The fix prompt contains:**
  - the open findings, verbatim;
  - the tests to re-run;
  - an instruction to append the fix report to the same report file and not to
    commit.

## Before each dispatch

Re-read the current tree. A plan written against an earlier snapshot goes stale
as earlier tasks change files.

## What every dispatch prompt says

- **Don't commit or push.** You commit. The sandbox protects `.git` from
  writes, but state this as a task rule anyway. Don't grant
  `danger-full-access` to get around it.
- **Keep tool output short.** Use summary test reporters and read line ranges
  of large files. When truncating output with `| tail -50`, run with
  `set -o pipefail` so a failing command still fails. Every turn re-reads
  everything the session has seen.
- **Where the result goes:**
  - writable runs write their report to a named file;
  - read-only runs can't write files, so they return the report as their final
    message (save it with `--out`).

Reviewer prompts also say:
- **Never modify tracked files.**
- **Probe a copy, not the tree.** Run mutation probes on a copy in `/tmp`
  (`rsync -a --exclude .git` plus any dependency directories, which can be
  symlinked back). Check that a mutation actually applied before drawing a
  conclusion from it.
- **Prefer running the code to reading it.** Build, lint and format checks
  rarely find anything. Consequential findings come from running the code: a
  race detector, an injected fake, a deliberate mutation.

Have work reviewed by a different model family from the one that wrote it.

## Harness integrations

Some harnesses ship their own Codex integration, such as a plugin or an
extension. That is fine for a one-off question or review the user asks for. Use
this script when you need any of these:
- resuming a specific session by id;
- an effort level the integration doesn't offer;
- network access in the sandbox;
- auto-review of approval requests;
- a cleanup that stops a stalled run.

## Finding sessions later

`codex exec` sessions are hidden from the resume picker. List them with
`codex resume --include-non-interactive --all`, or open one with
`codex resume <session-id>`.
