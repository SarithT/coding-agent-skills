#!/usr/bin/env node
// Checks every skill under skills/ before it can be published:
//  - SKILL.md frontmatter parses as YAML (same parser and rules as the skills CLI)
//    and has non-empty string `name` and `description`
//  - name is lowercase-hyphenated and matches its directory name
//  - no two skills share a name (the skills CLI silently keeps only the first)
//  - each skill is at most 3 directories below skills/ and not under a directory
//    the CLI skips (its discovery depth and SKIP_DIRS)
//  - vendored skills ship a license file
//
// With --cli, also runs the pinned skills CLI (`skills add . --list`) and fails unless it
// discovers exactly the skills found here. Requires `npm ci` first.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const MAX_DEPTH = 3;
const CLI_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__']);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LICENSE_RE = /^(LICENSE|LICENCE|COPYING)([-._].+)?$/i;
const FRONTMATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/; // same as the skills CLI

// A directory holding SKILL.md is a skill; anything nested under it belongs to that skill.
function findSkills(dir, depth = 0, out = []) {
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) {
    out.push({ dir, depth });
    return out;
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.')) findSkills(path.join(dir, e.name), depth + 1, out);
  }
  return out;
}

function frontmatter(text) {
  const m = text.match(FRONTMATTER_RE);
  if (!m) return { error: 'missing YAML frontmatter' };
  try {
    const data = parseYaml(m[1]);
    return data && typeof data === 'object' ? { data } : { error: 'frontmatter is not a YAML mapping' };
  } catch (err) {
    return { error: `YAML parse error: ${err.message.split('\n')[0]}` };
  }
}

function cliDiscoveredNames() {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'skills');
  if (!fs.existsSync(bin)) throw new Error('skills CLI not installed; run `npm ci --ignore-scripts` first');
  const out = execFileSync(bin, ['add', '.', '--list'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DISABLE_TELEMETRY: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  // Skill names are printed as "│    <name>"; descriptions are indented further.
  return new Set(
    out
      .replace(/\x1b\[[0-9;]*m/g, '')
      .split('\n')
      .map((l) => l.match(/^│ {4}(\S+)\s*$/)?.[1])
      .filter(Boolean),
  );
}

const errors = [];
const seen = new Map();
const skills = fs.existsSync(SKILLS_DIR) ? findSkills(SKILLS_DIR) : [];

for (const { dir, depth } of skills) {
  const rel = path.relative(ROOT, dir);
  const skipped = path.relative(SKILLS_DIR, dir).split(path.sep).find((p) => CLI_SKIP_DIRS.has(p));

  if (depth > MAX_DEPTH) errors.push(`${rel}: ${depth} levels below skills/; the skills CLI only looks ${MAX_DEPTH} deep`);
  if (skipped) errors.push(`${rel}: inside "${skipped}/", which the skills CLI never searches`);

  const { data, error } = frontmatter(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'));
  if (error) {
    errors.push(`${rel}/SKILL.md: ${error}`);
    continue;
  }
  const { name, description } = data;
  if (typeof name !== 'string' || !name.trim()) errors.push(`${rel}/SKILL.md: "name" must be a non-empty string`);
  else if (!NAME_RE.test(name)) errors.push(`${rel}/SKILL.md: name "${name}" must be lowercase letters, digits and hyphens`);
  else if (name !== path.basename(dir)) errors.push(`${rel}/SKILL.md: name "${name}" does not match directory "${path.basename(dir)}"`);
  if (typeof description !== 'string' || !description.trim()) errors.push(`${rel}/SKILL.md: "description" must be a non-empty string`);

  if (typeof name === 'string') {
    if (seen.has(name)) errors.push(`duplicate skill name "${name}": ${seen.get(name)} and ${rel}`);
    else seen.set(name, rel);
  }

  const isVendored = rel.split(path.sep)[1] === 'vendor';
  if (isVendored && !fs.readdirSync(dir).some((f) => LICENSE_RE.test(f))) {
    errors.push(`${rel}: vendored skill has no license file`);
  }
}

if (!errors.length && process.argv.includes('--cli')) {
  const found = cliDiscoveredNames();
  const expected = new Set(seen.keys());
  for (const n of expected) if (!found.has(n)) errors.push(`skills CLI does not discover "${n}" (${seen.get(n)})`);
  for (const n of found) if (!expected.has(n)) errors.push(`skills CLI discovers unexpected skill "${n}"`);
}

if (errors.length) {
  console.error(`Found ${errors.length} problem(s):\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${skills.length} skills valid${process.argv.includes('--cli') ? ', all discovered by the skills CLI' : ''}`);
