/**
 * suite.cjs - Comprehensive audit & test suite for Football Legend.
 * Verifies syntax, simulation fairness, Master League progression, tournament
 * brackets, position-skills matrix, Cloud/Ghost PvP mechanics, and app configs.
 *
 * Run: node .audit/suite.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const startTime = Date.now();

let totalPassed = 0;
let totalFailed = 0;
const sectionFailures = [];

function banner(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function runStep(name, fn) {
  process.stdout.write(`-> ${name}... `);
  try {
    const res = fn();
    const count = typeof res === 'number' ? res : 1;
    totalPassed += count;
    console.log(`\x1b[32mOK\x1b[0m (${count} check${count === 1 ? '' : 's'})`);
    return true;
  } catch (err) {
    totalFailed++;
    sectionFailures.push(`${name}: ${err.message}`);
    console.log(`\x1b[31mFAILED\x1b[0m\n   ${err.message}`);
    return false;
  }
}

// 1. Environment & Config Audits
banner('1. Configuration & Asset Audits');

runStep('Capacitor config integrity', () => {
  const capPath = path.join(ROOT, 'app/capacitor.config.json');
  if (!fs.existsSync(capPath)) throw new Error('app/capacitor.config.json missing');
  const cfg = JSON.parse(fs.readFileSync(capPath, 'utf8'));
  if (cfg.appId !== 'com.footballlegend.game') throw new Error(`Unexpected appId: ${cfg.appId}`);
  if (cfg.appName !== 'Football Legend') throw new Error(`Unexpected appName: ${cfg.appName}`);
  if (cfg.webDir !== 'www') throw new Error(`Unexpected webDir: ${cfg.webDir}`);
  return 3;
});

runStep('Android build.gradle configuration', () => {
  const bgPath = path.join(ROOT, 'app/android/app/build.gradle');
  if (!fs.existsSync(bgPath)) throw new Error('app/android/app/build.gradle missing');
  const bg = fs.readFileSync(bgPath, 'utf8');
  if (!bg.includes('applicationId "com.footballlegend.game"')) {
    throw new Error('applicationId mismatch in build.gradle');
  }
  if (!bg.includes('versionCode')) throw new Error('versionCode missing in build.gradle');
  if (!bg.includes('versionName')) throw new Error('versionName missing in build.gradle');
  return 3;
});

runStep('Game assets referenced by copy-game.js', () => {
  const copyScript = path.join(ROOT, 'app/copy-game.js');
  if (!fs.existsSync(copyScript)) throw new Error('app/copy-game.js missing');
  const content = fs.readFileSync(copyScript, 'utf8');
  const match = content.match(/for\s*\(\s*const\s+f\s+of\s+\[([^\]]+)\]\)/);
  if (!match) throw new Error('Could not parse asset list from copy-game.js');
  const files = match[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
  let checks = 0;
  for (const f of files) {
    const p = path.join(ROOT, 'game', f);
    if (!fs.existsSync(p)) throw new Error(`Required asset missing in game/: ${f}`);
    checks++;
  }
  return checks;
});

// 2. Syntax Validation
banner('2. JavaScript Syntax Compilation (node --check)');

runStep('Every JS source file compiles cleanly', () => {
  const files = [
    'game/app.js',
    'game/engine.js',
    'game/ml.js',
    'game/cloud.js',
    'game/vendor-supabase.js',
    'game/admin/admin.js',
    'app/copy-game.js'
  ];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) throw new Error(`File missing: ${rel}`);
    execSync(`node --check "${abs}"`, { stdio: 'pipe' });
  }
  return files.length;
});

// 3. Game Engine & Simulation Tests
banner('3. Engine, Fairness & Gameplay Suites');

runStep('Simulation Fairness & Honesty (test-fairness.js)', () => {
  const out = execSync('node test-fairness.js', { cwd: path.join(ROOT, 'game'), encoding: 'utf8' });
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  if (!m || parseInt(m[2], 10) > 0) throw new Error(`Fairness failed: ${out}`);
  return parseInt(m[1], 10);
});

runStep('Master League Card & Progression Engine (test-ml.js)', () => {
  const out = execSync('node test-ml.js', { cwd: path.join(ROOT, 'game'), encoding: 'utf8' });
  const m = out.match(/(\d+)\s+ML checks passed,\s+(\d+)\s+failed/);
  if (!m || parseInt(m[2], 10) > 0) throw new Error(`ML tests failed: ${out}`);
  return parseInt(m[1], 10);
});

runStep('ML Club Tournament Mechanics (test-ml-ct.js)', () => {
  const out = execSync('node test-ml-ct.js', { cwd: path.join(ROOT, 'game'), encoding: 'utf8' });
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  if (!m || parseInt(m[2], 10) > 0) throw new Error(`ML CT failed: ${out}`);
  return parseInt(m[1], 10);
});

runStep('BaL Career Tournament Mechanics (test-bal-ct.js)', () => {
  const out = execSync('node test-bal-ct.js', { cwd: path.join(ROOT, 'game'), encoding: 'utf8' });
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  if (!m || parseInt(m[2], 10) > 0) throw new Error(`BaL CT failed: ${out}`);
  return parseInt(m[1], 10);
});

runStep('Position Skills & Player Development (test-position-skills.js)', () => {
  const out = execSync('node test-position-skills.js', { cwd: path.join(ROOT, 'game'), encoding: 'utf8' });
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  if (!m || parseInt(m[2], 10) > 0) throw new Error(`Position skills failed: ${out}`);
  return parseInt(m[1], 10);
});

runStep('Ghost PvP, Cloud Saves & v1.5 Features (test-v15.js)', () => {
  const out = execSync('node test-v15.js', { cwd: path.join(ROOT, 'game'), encoding: 'utf8' });
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  if (!m || parseInt(m[2], 10) > 0) throw new Error(`v15 tests failed: ${out}`);
  return parseInt(m[1], 10);
});

// 4. Summary & Build State
banner('4. Audit Summary & Build State');

try {
  require('./unshipped.cjs');
} catch (e) {
  // non-fatal
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
console.log('\n' + '-'.repeat(60));
if (totalFailed === 0) {
  console.log(`\x1b[32mALL CHECKS GREEN: ${totalPassed} checks passed (${elapsed}s)\x1b[0m`);
  console.log('APK build gate is clear.');
} else {
  console.log(`\x1b[31mAUDIT FAILED: ${totalFailed} failure(s) (${elapsed}s)\x1b[0m`);
  sectionFailures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
}
