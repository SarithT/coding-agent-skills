---
name: claude-dispatch
description: Use when an agent other than Claude Code hands work to Claude Code (Anthropic's `claude` CLI), such as delegating an implementation task, a fix round or a code review, resuming a Claude session, or running `claude -p`. Not for use inside Claude Code itself.
disable-model-invocation: true
---

# Claude Dispatch

**If you are Claude Code, ignore this skill.** It is for agents that launch
Claude Code.

Launch every Claude Code run, fresh or resumed, through the bundled script. It
wraps `claude -p` with the flags that long unattended runs need, gives every run
a session id you can resume, and stops Claude cleanly when the run stalls or is
cancelled.

## Launch

```bash
bash <this skill's directory>/scripts/claude-dispatch \
  --repo <dir> --prompt <prompt-file> --log <log-file> \
  [--model <model>] [--effort <level>] [--resume <session-id>] \
  [--read-only] [--permission-mode <mode>] [--add-dir <dir>]... \
  [--max-budget <usd>] [--out <file>] [--timeout <minutes>] [--detach <file>]
```

- **Run it outside your command sandbox.** See [Sandbox](#sandbox) below.
- **Let it take as long as it needs.** Claude runs often take longer than a
  harness allows a foreground command. Pick the first option your harness
  supports:
  1. A background command that notifies you when it exits. Don't poll the log
     while you wait.
  2. A command session that keeps running and that you can check on. Check
     every few minutes, not every few seconds.
  3. `--detach <file>`. The script starts the run in the background and returns
     at once with the session id. The run writes its normal output to `<file>`.
     It is done when the file's last line is the status line below. Check every
     few minutes.
  4. A foreground command, with `--timeout` set below your command time limit.
- **Write the prompt to a file first.** The script sends it to Claude on stdin,
  so length and leading dashes don't matter. Inside the prompt, pass paths to
  plans, briefs, diffs and report files instead of pasting their contents.
- **Use one log file per task.**

**Output.** stdout is Claude's final message, followed by
`claude-dispatch: session <id> exit <code>`. `--out` also saves the final
message to a file. The log collects Claude's event stream and errors; read it
only when a run fails.

| Exit code | Meaning |
|---|---|
| 0 | Claude finished. |
| 1 | Claude reported an error (such as reaching `--max-budget`) or exited without a result. The reason is on stderr. |
| 2 | Bad arguments. |
| 3 | The script can't write Claude's session folder: it is running inside a sandbox. |
| 124 | Claude didn't start within 120 seconds, or `--timeout` passed. The script stopped Claude. |
| 129, 130, 143 | The script was hung up, interrupted or terminated, and stopped Claude first. |
| Other | Claude's own exit code. |

Independent runs, such as two reviews of the same diff, can go out in parallel.

## Sandbox

Claude Code needs the network, its stored login and write access to its session
folder (`$CLAUDE_CONFIG_DIR`, default `~/.claude`). Inside a command sandbox it
fails with "Not logged in", or worse, finishes without saving the session, so
the fix round can't resume it. The script checks the session folder before it
starts Claude and exits 3 if it can't write there.

So run the script outside your harness's sandbox: request escalated or
unsandboxed execution for the command. If your harness can remember an approved
command prefix, approve `bash <this skill's directory>/scripts/claude-dispatch`
once.

Claude then uses its own permission system instead:

| Mode | What Claude can do |
|---|---|
| Default | Permission mode `auto`: Claude's own classifier approves safe actions and blocks risky ones. Anything that would need a person is denied instead of waiting. `--repo` and `/tmp` are working directories. |
| `--add-dir <dir>` | Also work in `<dir>`. Repeatable. `CLAUDE_DISPATCH_ADD_DIRS` (colon-separated) adds directories for every run, such as a report directory outside the repo. |
| `--read-only` | Only reading and searching files: no edits, no commands. For design and plan reviews. |
| `--permission-mode acceptEdits` | Edits in the working directories are allowed. Commands that would need approval are denied. Use it if `auto` isn't available for the account. |

Claude also loads the user's Claude Code settings, hooks and plugins, and the
repo's `CLAUDE.md`. Don't repeat the project's rules in the prompt.

## Model and effort

- **Use the project's choice.** Take the model and effort for each role from
  the project's instructions, and pass them on every call, including resumes.
  `--model` takes an alias (such as `opus` or `sonnet`) or a full model name.
  `--effort` takes `low`, `medium`, `high`, `xhigh` or `max`.
- **If the project names none, leave both out.** Every run, fresh or resumed,
  then uses the user's Claude Code default. Don't invent a model name.
- **Use `--max-budget <usd>`** when the user gave a spending limit.

## Resuming for fix rounds

- **Record every session id** somewhere that survives context compaction, such
  as the plan's progress file or ledger. For example:
  `Task 3: reviewer claude <session-id> <model>@<effort>`.
- **Resume with `--resume <session-id>` and the same `--repo`.** Never use
  `claude --continue`: implementer and reviewer sessions interleave, so the
  most recent one is usually the wrong one.
- **Pass the same mode again.** A resumed review stays read-only only if you
  pass `--read-only` again.
- **The fix prompt contains:**
  - the open findings, verbatim;
  - the tests to re-run;
  - an instruction to append the fix report to the same report file and not to
    commit.

## Before each dispatch

Re-read the current tree. A plan written against an earlier snapshot goes stale
as earlier tasks change files.

## What every dispatch prompt says

- **Don't commit or push.** You commit.
- **Keep tool output short.** Use summary test reporters and read line ranges
  of large files. When truncating output with `| tail -50`, run with
  `set -o pipefail` so a failing command still fails.
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

## Finding sessions later

Open a session with `claude --resume <session-id>`. To pick from a list
instead, run `claude --resume` in the repo: the list shows that directory's
sessions.
