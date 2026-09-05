/**
 * syntax.cjs - verify that every JavaScript source file compiles without syntax errors.
 * Run: node .audit/syntax.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const JS_FILES = [
  'game/app.js',
  'game/engine.js',
  'game/ml.js',
  'game/cloud.js',
  'game/vendor-supabase.js',
  'game/admin/admin.js',
  'app/copy-game.js',
  'game/test-fairness.js',
  'game/test-ml.js',
  'game/test-ml-ct.js',
  'game/test-bal-ct.js',
  'game/test-v15.js',
  'game/test-position-skills.js'
];

let pass = 0, fail = 0;
const failures = [];

for (const rel of JS_FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    fail++;
    failures.push(`${rel} (file missing)`);
    continue;
  }
  try {
    execSync(`node --check "${abs}"`, { stdio: 'pipe' });
    pass++;
  } catch (err) {
    fail++;
    failures.push(`${rel}: ${err.message}`);
  }
}

console.log(`Syntax check: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
}
