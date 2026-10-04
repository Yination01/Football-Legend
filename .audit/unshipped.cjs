/**
 * unshipped.cjs - report commits on main that have landed since the last build.
 * Run: node .audit/unshipped.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const statePath = path.join(ROOT, '.build-state.json');

if (!fs.existsSync(statePath)) {
  console.log('No .build-state.json found.');
  process.exit(0);
}

try {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const lastCommit = state.lastBuild?.commit;
  const lastNumber = state.lastBuild?.number;
  const lastDate = state.lastBuild?.dispatchedAt;

  console.log(`Last recorded build: Build ${lastNumber || '?'} (${lastDate || 'unknown date'}, commit ${lastCommit || '?'})`);

  if (lastCommit) {
    try {
      // A commit only counts as "unshipped" if it touched code that goes into the APK.
      // Docs, .audit, .github and .build-state.json never ship, so they are not noise here.
      const raw = execSync(`git log --name-only --pretty=format:'%h %s' ${lastCommit}..HEAD`, { cwd: ROOT, encoding: 'utf8' }).trim();
      const shipped = [];
      let housekeeping = 0;
      if (raw) {
        for (const chunk of raw.split(/\n(?=[0-9a-f]{7,} )/)) {
          const [header, ...files] = chunk.split('\n');
          const touchesShipped = files.some(f => /^(game|app)\//.test(f.trim()) && !/^app\/(node_modules|android\/app\/build)\//.test(f.trim()));
          if (touchesShipped) shipped.push(header); else housekeeping++;
        }
      }
      if (!shipped.length) {
        console.log('All shipped code on main is included in the last build.');
        if (housekeeping) console.log(`(${housekeeping} housekeeping commit(s) since then - docs/config only, nothing that ships.)`);
      } else {
        console.log(`\n${shipped.length} shipped-commit(s) on main since build ${lastNumber}:`);
        shipped.forEach(line => console.log(`  * ${line}`));
        if (housekeeping) console.log(`  (+${housekeeping} housekeeping commit(s) ignored: docs/config only)`);
      }
    } catch (e) {
      console.log('Could not resolve git log range from commit ' + lastCommit);
    }
  }
} catch (e) {
  console.error('Error reading .build-state.json:', e.message);
}
