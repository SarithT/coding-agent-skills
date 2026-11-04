# coding-agent-skills

My agent skills (Claude Code, Codex, Cursor, …): my own, plus a curated set of third-party skills, installable with [`npx skills`](https://github.com/vercel-labs/skills).

## Install

```bash
# see what's available
npx skills add SarithT/coding-agent-skills --list

# install everything (prompts for agents and scope)
npx skills add SarithT/coding-agent-skills

# install specific skills globally for Claude Code, no prompts
npx skills add SarithT/coding-agent-skills --skill brainstorming --skill frontend-design -g -a claude-code -y

# later
npx skills check     # exits 1 when updates are available
npx skills update
```

### Skills that skip one harness

`codex-dispatch` tells an agent how to launch Codex, and `claude-dispatch` how to launch
Claude Code. Install them like any other skill, for every agent. Each description starts by
telling the agent it launches to skip it ("If you are Codex, do not load this skill."), so
that agent leaves it alone even when it's installed.

If you'd rather hide one completely from the harness it targets:

- Codex, in `~/.codex/config.toml`:

  ```toml
  [[skills.config]]
  name = "codex-dispatch"
  enabled = false
  ```

- Claude Code, in `~/.claude/settings.json`:

  ```json
  { "permissions": { "deny": ["Skill(claude-dispatch)"] } }
  ```

## Layout

```
skills/
  custom/<name>/SKILL.md     my own skills (edit freely)
  vendor/<name>/             third-party skills (generated, never edit by hand)
vendor.json                  which third-party skills to include
vendor.lock.json             upstream commit each source is pinned to (generated)
THIRD_PARTY.md               attribution table (generated)
scripts/sync-vendor.mjs      rebuilds skills/vendor/ from vendor.json + vendor.lock.json
scripts/validate.mjs         lints every skill
```

## Adding a custom skill

Create `skills/custom/<name>/SKILL.md`:

```markdown
---
name: <name>            # lowercase-hyphenated, same as the directory name
description: Use when … # what it does and when the agent should load it
---

# Instructions …
```

Run `npm ci --ignore-scripts` once, then `npm run validate`.

## Adding a third-party skill

1. Check its license allows redistribution. Source-available skills (for example Anthropic's
   `docx`, `pdf`, `pptx` and `xlsx`) can't be vendored; point people to the upstream repo instead.
2. Add a source to `vendor.json`:
   ```json
   {
     "id": "some-source",
     "repo": "owner/repo",
     "ref": "main",
     "license": "MIT",
     "include": ["skills/one-skill", "other/dir/*"],
     "exclude": ["skill-i-dont-want"]
   }
   ```
   `include` takes a skill path, or `dir/*` for every skill directly under `dir`.
   `repo` is GitHub `owner/repo` shorthand or any git URL.
3. Run `npm run sync`, review `git diff`, then commit.

To change a third-party skill, copy it into `skills/custom/` under a new name. `skills/vendor/`
is rebuilt from scratch on every sync, and CI fails if it differs from what the pins produce.

## Updates

`.github/workflows/sync-vendor.yml` runs daily. It moves every source to the latest commit of its
`ref` and opens or updates a single PR on `chore/vendor-sync`, with compare links and the list of added and removed
skills. Nothing reaches `main` until you merge it. Read the diff first: skills are instructions and
scripts that agents run with the installer's permissions.

Run it locally with `npm run sync:update`.

### One-time GitHub setup

- **Settings → Actions → General → Workflow permissions:** enable *Allow GitHub Actions to create and approve pull requests*.
- Optional: add a `SKILLS_SYNC_TOKEN` secret: a fine-grained PAT with *Contents* and *Pull requests*
  write access to this repo. PRs opened with the default token don't trigger other workflows, so
  without it `validate.yml` won't run on the sync PR. The sync job validates before opening the PR
  either way. (A GitHub App works too, but its installation tokens expire after an hour: mint one per
  run with `actions/create-github-app-token` instead of storing it as a secret.)

Actions are pinned to commit SHAs and the skills CLI to an exact version in `package-lock.json`;
Dependabot (`.github/dependabot.yml`) proposes updates as PRs.

## License

Everything outside `skills/vendor/` is [MIT](LICENSE). Each skill in `skills/vendor/` keeps its
upstream license, included in its directory and listed in [THIRD_PARTY.md](THIRD_PARTY.md).
