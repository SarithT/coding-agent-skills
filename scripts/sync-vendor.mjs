#!/usr/bin/env node
// Rebuilds skills/vendor/ from the sources in vendor.json.
//
//   node scripts/sync-vendor.mjs                      copy each source at the commit pinned in vendor.lock.json
//   node scripts/sync-vendor.mjs --update             move every pin to the latest commit of its ref, then copy
//   node scripts/sync-vendor.mjs --update --summary FILE
//                                                     also write a Markdown summary of what changed (used as the PR body)
//
// skills/vendor/ is always rebuilt from scratch, so skills removed upstream disappear
// and hand edits are overwritten. Put your own skills in skills/custom/.
//
// include patterns: "path/to/skill" (one skill) or "path/to/dir/*" (every direct
// subdirectory that has a SKILL.md). Optional "exclude": ["skill-name", ...].

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'vendor.json');
const LOCK_PATH = path.join(ROOT, 'vendor.lock.json');
const VENDOR_DIR = path.join(ROOT, 'skills', 'vendor');
const STAGING_DIR = path.join(ROOT, '.vendor-staging');
const NOTICES_PATH = path.join(ROOT, 'THIRD_PARTY.md');
const LICENSE_RE = /^(LICENSE|LICENCE|COPYING)([-._].+)?$/i; // LICENSE, LICENSE.txt, LICENSE-MIT, ...
const NOTICE_RE = /^NOTICE([-._].+)?$/i; // Apache-2.0 §4(d): NOTICE files travel with the work
const SHA_RE = /^[0-9a-f]{40}$/;

const args = process.argv.slice(2);
const update = args.includes('--update');
const summaryPath = args.includes('--summary') ? args[args.indexOf('--summary') + 1] : null;

const git = (gitArgs) =>
  execFileSync('git', gitArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const isGithubShorthand = (repo) => /^[\w.-]+\/[\w.-]+$/.test(repo);
const repoUrl = (repo) => (isGithubShorthand(repo) ? `https://github.com/${repo}.git` : repo);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');

// Fetches `what` (a branch/tag name, or a pinned commit SHA) and returns the checkout
// plus the commit it resolved to. Annotated tags are peeled to their commit.
function checkout(url, what) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-'));
  try {
    git(['init', '-q', dir]);
    git(['-C', dir, 'fetch', '-q', '--depth', '1', url, what]);
    git(['-C', dir, 'checkout', '-q', '--detach', 'FETCH_HEAD']);
    return { dir, sha: git(['-C', dir, 'rev-parse', 'HEAD^{commit}']) };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

// Only regular files inside the checkout may be copied as license/notice files:
// a symlinked LICENSE could otherwise pull in any file on the machine.
function rootFiles(repoDir, pattern) {
  return fs.readdirSync(repoDir).filter((f) => pattern.test(f) && fs.lstatSync(path.join(repoDir, f)).isFile());
}

function expandIncludes(repoDir, source) {
  const exclude = new Set(source.exclude ?? []);
  const found = [];
  for (const pattern of source.include) {
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2);
      const entries = fs.readdirSync(path.join(repoDir, base), { withFileTypes: true });
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.isDirectory() && fs.existsSync(path.join(repoDir, base, e.name, 'SKILL.md'))) {
          found.push(path.posix.join(base, e.name));
        }
      }
    } else {
      if (!fs.existsSync(path.join(repoDir, pattern, 'SKILL.md'))) {
        throw new Error(`${source.repo}: "${pattern}" has no SKILL.md`);
      }
      found.push(pattern);
    }
  }
  return found.filter((p) => !exclude.has(path.posix.basename(p)));
}

function assertNoSymlinks(dir, label) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) throw new Error(`${label}: refusing to vendor symlink ${e.name}`);
    if (e.isDirectory()) assertNoSymlinks(p, label);
  }
}

function copySkill(repoDir, skillPath, dest, source) {
  const src = path.join(repoDir, skillPath);
  assertNoSymlinks(src, `${source.repo}/${skillPath}`);
  fs.cpSync(src, dest, { recursive: true });

  // Redistribution needs the license (and any NOTICE) next to the files. Fall back to the
  // repo-level files; copy all of them so dual-licensed repos (LICENSE-MIT + LICENSE-APACHE) stay intact.
  const skillHas = (re) => fs.readdirSync(dest).some((f) => re.test(f));
  if (!skillHas(LICENSE_RE)) {
    const rootLicenses = rootFiles(repoDir, LICENSE_RE);
    if (!rootLicenses.length) {
      throw new Error(`${source.repo}/${skillPath}: no license file in the skill or the repo root`);
    }
    for (const f of rootLicenses) fs.copyFileSync(path.join(repoDir, f), path.join(dest, f));
  }
  if (!skillHas(NOTICE_RE)) {
    for (const f of rootFiles(repoDir, NOTICE_RE)) fs.copyFileSync(path.join(repoDir, f), path.join(dest, f));
  }
}

function sourceLink(repo, sha, subpath = '') {
  if (!isGithubShorthand(repo)) return `\`${repo}\``;
  const url = `https://github.com/${repo}/tree/${sha}${subpath ? '/' + subpath : ''}`;
  return `[${repo}](${url})`;
}

function writeNotices(config, lock) {
  const rows = [];
  for (const source of config.sources) {
    const entry = lock.sources[source.id];
    for (const [name, skillPath] of Object.entries(entry.skills)) {
      rows.push(
        `| \`${name}\` | ${sourceLink(source.repo, entry.sha, skillPath)} | \`${entry.sha.slice(0, 7)}\` | ${source.license ?? 'see LICENSE in skill'} |`,
      );
    }
  }
  fs.writeFileSync(
    NOTICES_PATH,
    [
      '# Third-party skills',
      '',
      'Generated by `scripts/sync-vendor.mjs`; do not edit by hand.',
      'Each skill in `skills/vendor/` keeps its upstream license file.',
      '',
      '| Skill | Source | Commit | License |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
  );
}

function summarize(config, oldLock, newLock) {
  const lines = ['Automated sync of third-party skills from `vendor.json`.', ''];
  let changed = false;
  for (const source of config.sources) {
    const before = oldLock.sources?.[source.id];
    const after = newLock.sources[source.id];
    if (before?.sha === after.sha) continue;
    changed = true;
    const range = before
      ? isGithubShorthand(source.repo)
        ? `[\`${before.sha.slice(0, 7)}...${after.sha.slice(0, 7)}\`](https://github.com/${source.repo}/compare/${before.sha}...${after.sha})`
        : `\`${before.sha.slice(0, 7)}...${after.sha.slice(0, 7)}\``
      : `new source at \`${after.sha.slice(0, 7)}\``;
    lines.push(`### ${source.id} (${source.repo}@${source.ref})`, '', `Upstream: ${range}`, '');
    const oldNames = new Set(Object.keys(before?.skills ?? {}));
    const newNames = new Set(Object.keys(after.skills));
    const added = [...newNames].filter((n) => !oldNames.has(n));
    const removed = [...oldNames].filter((n) => !newNames.has(n));
    if (added.length) lines.push(`- Added: ${added.map((n) => `\`${n}\``).join(', ')}`);
    if (removed.length) lines.push(`- Removed: ${removed.map((n) => `\`${n}\``).join(', ')}`);
    lines.push('');
  }
  if (!changed) lines.push('No upstream commit changes.');
  lines.push(
    '',
    '**Before merging:** read the diff. Skills are instructions and scripts that agents run with the installer\'s permissions.',
  );
  return lines.join('\n') + '\n';
}

function main() {
  const config = readJson(CONFIG_PATH);
  const oldLock = fs.existsSync(LOCK_PATH) ? readJson(LOCK_PATH) : { sources: {} };
  const newLock = { sources: {} };
  const owners = new Map(); // skill dir name -> source id

  const ids = config.sources.map((s) => s.id);
  const dupId = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dupId) throw new Error(`vendor.json: duplicate source id "${dupId}"`);

  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  try {
    for (const source of config.sources) {
      const url = repoUrl(source.repo);
      const pinned = oldLock.sources[source.id];
      const usePin = !update && pinned && pinned.repo === source.repo && pinned.ref === source.ref;
      if (usePin && !SHA_RE.test(pinned.sha)) {
        throw new Error(`vendor.lock.json: "${source.id}" sha must be a full 40-char commit id, got "${pinned.sha}"`);
      }

      const { dir: repoDir, sha } = checkout(url, usePin ? pinned.sha : source.ref);
      try {
        if (usePin && sha !== pinned.sha) {
          throw new Error(`${source.id}: fetched ${sha}, but vendor.lock.json pins ${pinned.sha}`);
        }
        console.log(`${source.id}: ${source.repo}@${source.ref} -> ${sha.slice(0, 7)}`);
        const skills = {};
        for (const skillPath of expandIncludes(repoDir, source)) {
          const name = path.posix.basename(skillPath);
          if (owners.has(name)) {
            throw new Error(
              `Skill "${name}" comes from both "${owners.get(name)}" and "${source.id}". Add it to "exclude" in one of them.`,
            );
          }
          owners.set(name, source.id);
          copySkill(repoDir, skillPath, path.join(STAGING_DIR, name), source);
          skills[name] = skillPath;
          console.log(`  + ${name}`);
        }
        if (!Object.keys(skills).length) throw new Error(`${source.id}: include patterns matched no skills`);
        newLock.sources[source.id] = { repo: source.repo, ref: source.ref, sha, skills };
      } finally {
        fs.rmSync(repoDir, { recursive: true, force: true });
      }
    }

    // Swap in the new tree, keeping the old one until the swap has succeeded.
    const backup = `${STAGING_DIR}-old`;
    fs.rmSync(backup, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(VENDOR_DIR), { recursive: true });
    if (fs.existsSync(VENDOR_DIR)) fs.renameSync(VENDOR_DIR, backup);
    try {
      fs.renameSync(STAGING_DIR, VENDOR_DIR);
    } catch (err) {
      if (fs.existsSync(backup)) fs.renameSync(backup, VENDOR_DIR);
      throw err;
    }
    fs.rmSync(backup, { recursive: true, force: true });
  } finally {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }

  writeJson(LOCK_PATH, newLock);
  writeNotices(config, newLock);
  if (summaryPath) fs.writeFileSync(summaryPath, summarize(config, oldLock, newLock));
  console.log(`Vendored ${owners.size} skills into skills/vendor/`);
}

try {
  main();
} catch (err) {
  console.error(`sync-vendor: ${err.stderr?.toString().trim() || err.message}`);
  process.exit(1);
}
