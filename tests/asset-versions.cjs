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

const project = readProject();
assert.deepEqual(check(project.sources, project.filenames), [], 'Run scripts/asset-versions.cjs update to align references');
console.log('PASS asset versions, mixed and missing tags, query preservation, and repository consistency');
