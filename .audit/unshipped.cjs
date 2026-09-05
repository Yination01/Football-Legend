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
      const log = execSync(`git log --oneline ${lastCommit}..HEAD`, { cwd: ROOT, encoding: 'utf8' }).trim();
      if (!log) {
        console.log('All commits on main are included in the last build.');
      } else {
        const lines = log.split('\n');
        console.log(`\n${lines.length} commit(s) on main since build ${lastNumber}:`);
        lines.forEach(line => console.log(`  * ${line}`));
      }
    } catch (e) {
      console.log('Could not resolve git log range from commit ' + lastCommit);
    }
  }
} catch (e) {
  console.error('Error reading .build-state.json:', e.message);
}
