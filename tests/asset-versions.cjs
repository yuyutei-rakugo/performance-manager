const assert = require('node:assert/strict');
const {check, update, readProject} = require('../scripts/asset-versions.cjs');

const files = new Set(['cloud.js', 'rehearsals.html', 'sw.js']);
const sources = new Map([
  ['app.js', "import './cloud.js?v=old'; fetch('./cloud.js');"],
  ['admin.html', '<script src="./cloud.js?revision=new"></script>'],
  ['member-home.js', 'location.pathname.endsWith("/rehearsals.html");'],
]);
assert.match(check(sources, files).join('\n'), /app\.js \(v=old\).*unversioned.*revision=new/);
for (const [file, source] of sources) {
  sources.set(file, update(source, files, new Set(['cloud.js']), 'release-1'));
}
assert.deepEqual(check(sources, files), []);
assert.match(sources.get('app.js'), /fetch\('\.\/cloud\.js\?v=release-1'\)/);
const link = 'href="rehearsals.html?v=old&detail=one#today"';
assert.equal(update(link, files, new Set(['rehearsals.html']), 'release-1'),
  'href="rehearsals.html?v=release-1&detail=one#today"');
const unrelated = "fetch('https://example.com/cloud.js?v=old'); register('./sw.js');";
assert.equal(update(unrelated, files, new Set(['cloud.js']), 'release-1'), unrelated);
const duplicate = new Map([['index.html','<script src="cloud.js?v=a&v=b"></script>']]);
assert.equal(check(duplicate, files).length, 1);

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'notebook-asset-versions-'));
try {
  const script = path.join(fixture, 'scripts', 'asset-versions.cjs');
  fs.mkdirSync(path.dirname(script));
  fs.copyFileSync(require.resolve('../scripts/asset-versions.cjs'), script);
  fs.writeFileSync(path.join(fixture, 'index.html'),
    '<script src="cloud.js?v=old"></script><script src="cloud.js?v=other"></script><link href="style.css?v=old">');
  for (const file of ['cloud.js', 'style.css']) fs.writeFileSync(path.join(fixture, file), '');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], {encoding:'utf8'});
  const failed = run('update', 'release-1', 'style.css');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /cloud\.js/);
  assert.equal(run('update', 'release-1', '--all').status, 0);
  assert.equal(run('check').status, 0);
} finally {
  fs.rmSync(fixture, {recursive:true, force:true});
}

const project = readProject();
assert.deepEqual(check(project.sources, project.filenames), [], 'Run scripts/asset-versions.cjs update to align references');
console.log('PASS asset versions, mixed and missing tags, query preservation, and repository consistency');
