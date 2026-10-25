// Pulls the latest files from GitHub into this Bolt project.
// Bolt's terminal has no git, so this fetches the repo tree through the
// GitHub API and writes every file. Run:  npm run pull
//
//   npm run pull            write/overwrite files from GitHub main
//   npm run pull -- --prune also delete files under src/, public/, supabase/,
//                           scripts/ that no longer exist in the repo
//
// Never touches node_modules, .env, .bolt or dist.

import { mkdir, writeFile, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const OWNER = 'DealerHR';
const REPO = 'brochar';
const BRANCH = process.env.BRANCH || 'main';
const PRUNE_DIRS = ['src', 'public', 'supabase', 'scripts'];
const SKIP = /^(node_modules|dist|\.bolt|\.git)(\/|$)|^\.env(\.local)?$/;

const prune = process.argv.includes('--prune');

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${r.statusText}`);
  return r.json();
}

async function main() {
  console.log(`Pulling ${OWNER}/${REPO}@${BRANCH} ...`);
  const ref = await getJson(`https://api.github.com/repos/${OWNER}/${REPO}/commits/${BRANCH}`);
  const sha = ref.sha;
  console.log(`Latest commit: ${sha.slice(0, 7)}  ${ref.commit.message.split('\n')[0]}`);

  const tree = await getJson(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${sha}?recursive=1`);
  if (tree.truncated) throw new Error('Repo tree too large for one request.');
  const files = tree.tree.filter(t => t.type === 'blob' && !SKIP.test(t.path));

  let written = 0, unchanged = 0;
  const limit = 8;
  const queue = [...files];
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      const r = await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${sha}/${f.path}`);
      if (!r.ok) throw new Error(`${f.path} -> ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      let same = false;
      try { same = Buffer.compare(await readFile(f.path), buf) === 0; } catch { /* new file */ }
      if (same) { unchanged++; continue; }
      await mkdir(dirname(f.path), { recursive: true });
      await writeFile(f.path, buf);
      written++;
      console.log(`  updated  ${f.path}`);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));

  const inRepo = new Set(files.map(f => f.path));
  const extras = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e);
      const s = await stat(p);
      if (s.isDirectory()) await walk(p);
      else if (!inRepo.has(p)) extras.push(p);
    }
  }
  for (const d of PRUNE_DIRS) await walk(d);

  if (extras.length) {
    if (prune) {
      for (const p of extras) { await unlink(p); console.log(`  deleted  ${p}`); }
    } else {
      console.log('\nFiles in this project that are not in the repo (run with --prune to delete):');
      for (const p of extras) console.log(`  ${p}`);
    }
  }

  console.log(`\nDone. ${written} file(s) updated, ${unchanged} unchanged.`);
  if (written && files.some(f => f.path === 'package.json')) {
    console.log('If package.json changed, run: npm install');
  }
}

main().catch(err => { console.error('Pull failed:', err.message); process.exit(1); });
