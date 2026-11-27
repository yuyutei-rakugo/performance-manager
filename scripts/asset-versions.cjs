const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const base = 'https://notebook.invalid/';
// Match quoted literal local asset URLs, including imports, HTML and fetch calls.
const literal = /(['"`])((?:\.\/)?[\w./-]+\.(?:js|css|html|json|webmanifest)(?:\?[^'"\s`#]*)?(?:#[^'"\s`]*)?)\1/g;

function references(source, filenames) {
  return [...source.matchAll(literal)].flatMap(match => {
    const url = new URL(match[2], base);
    const file = url.pathname.slice(1);
    if (match[2].startsWith('/')) return [];
    return filenames.has(file) ? [{match, url, file}] : [];
  });
}

function versions({url}) {
  return [...url.searchParams].filter(([key]) => key === 'v' || key === 'revision');
}

function check(sources, filenames) {
  const groups = new Map();
  for (const [sourceFile, source] of sources) {
    for (const ref of references(source, filenames)) {
      if (!groups.has(ref.file)) groups.set(ref.file, []);
      groups.get(ref.file).push({sourceFile, tags:versions(ref)});
    }
  }
  return [...groups].flatMap(([file, refs]) => {
    if (!refs.some(ref => ref.tags.length)) return [];
    const tags = refs.map(ref => ref.tags.map(pair => pair.join('=')).join('&'));
    if (new Set(tags).size === 1 && refs[0].tags.length === 1 &&
        refs[0].tags[0][0] === 'v' && /^[\w-]+$/.test(refs[0].tags[0][1])) return [];
    return [file + ': ' + refs.map(({sourceFile}, i) => sourceFile + ' (' + (tags[i] || 'unversioned') + ')').join(', ')];
  });
}

function update(source, filenames, targets, version) {
  let result = source;
  for (const {match, file} of references(source, filenames).reverse()) {
    if (!targets.has(file)) continue;
    const raw = match[2];
    const hashStart = raw.indexOf('#');
    const fragment = hashStart < 0 ? '' : raw.slice(hashStart);
    const [filePath, ...queryParts] = raw.slice(0, hashStart < 0 ? raw.length : hashStart).split('?');
    const query = queryParts.join('?').split('&').filter(part =>
      part && !/^(?:v|revision)(?:=|$)/.test(part));
    const value = filePath + '?v=' + version + (query.length ? '&' + query.join('&') : '') + fragment;
    const start = match.index + 1;
    result = result.slice(0, start) + value + result.slice(start + raw.length);
  }
  return result;
}

function readProject() {
  const names = fs.readdirSync(root, {withFileTypes:true}).filter(entry => entry.isFile()).map(entry => entry.name);
  const filenames = new Set(names);
  const sources = new Map(names.filter(name => /\.(html|js|css|webmanifest)$/.test(name))
    .map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
  return {filenames, sources};
}

function main([command, version, ...files]) {
  const {filenames, sources} = readProject();
  if (command === 'check' && !version) {
    const problems = check(sources, filenames);
    if (!problems.length) return;
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }
  if (command !== 'update' || !version || !/^[\w-]+$/.test(version) ||
      !files.length || !(files.length === 1 && files[0] === '--all') &&
      !files.every(file => filenames.has(file) && /\.(js|css|html|json|webmanifest)$/.test(file))) {
    console.error('Usage: node scripts/asset-versions.cjs check | update VERSION --all | update VERSION FILE [...]');
    process.exitCode = 1;
    return;
  }
  const targets = files[0] === '--all'
    ? new Set([...sources.values()].flatMap(source =>
      references(source, filenames).filter(ref => versions(ref).length).map(ref => ref.file)))
    : new Set(files);
  for (const [name, source] of sources) {
    const updated = update(source, filenames, targets, version);
    if (updated !== source) fs.writeFileSync(path.join(root, name), updated);
  }
}

module.exports = {check, update, readProject};
if (require.main === module) main(process.argv.slice(2));
