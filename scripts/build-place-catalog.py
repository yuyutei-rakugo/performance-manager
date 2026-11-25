#!/usr/bin/env python3
"""Build public, city-boundary-clipped OSM search data from a regional PBF.
Requires osmium and shapely. Never reads or writes the application's member DB.
"""
import argparse, hashlib, json, math, pathlib, unicodedata, urllib.request
import osmium
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import polygonize, unary_union

CITIES = {'神栖市': 'kamisu', '銚子市': 'choshi'}
KEYS = {'amenity', 'shop', 'tourism', 'leisure', 'office', 'historic', 'healthcare',
        'public_transport', 'railway', 'place', 'natural', 'man_made', 'building', 'craft'}
ALIAS_KEYS = ['name:ja', 'name:en', 'name:ja-Hira', 'name:ja-Kana', 'alt_name', 'official_name', 'short_name', 'brand', 'brand:ja']
# This envelope is only a memory optimisation. Actual city polygons determine membership.
def in_envelope(lon, lat): return 140.40 <= lon <= 141.05 and 35.65 <= lat <= 36.08

def eligible(t):
    return bool(t.get('name')) and any(k in t for k in KEYS) and not any(
        t.get(k) in ('yes', '1', 'true') for k in ('disused', 'abandoned', 'demolished', 'removed')) and not (
        t.get('building') in ('house', 'detached') and not any(k in t for k in KEYS - {'building'}))

def category(t):
    if t.get('amenity') in ('post_office', 'townhall', 'library', 'community_centre', 'school', 'kindergarten', 'public_building'):
        return '公共施設'
    if t.get('shop') in ('convenience',): return 'コンビニ'
    if 'shop' in t: return '店舗'
    if t.get('amenity') in ('restaurant', 'cafe', 'fast_food', 'bar', 'pub'): return '飲食店'
    if 'healthcare' in t or t.get('amenity') in ('hospital', 'clinic', 'dentist', 'pharmacy'): return '医療・福祉'
    if 'leisure' in t: return '公園・スポーツ'
    if 'tourism' in t or 'historic' in t: return '観光・史跡'
    if 'railway' in t or 'public_transport' in t: return '交通'
    return 'その他'

def format_address(t):
    if t.get('addr:full'): return t['addr:full']
    prefix = ''.join(dict.fromkeys(filter(None, [t.get(k, '') for k in
        ['addr:province', 'addr:state', 'addr:city', 'addr:suburb', 'addr:quarter', 'addr:neighbourhood', 'addr:place', 'addr:street']])))
    number = '-'.join(filter(None, [t.get('addr:block_number', ''), t.get('addr:housenumber', '')]))
    return prefix + number

def make_row(kind, oid, t, lon, lat):
    names = []
    for k in ALIAS_KEYS:
        for name in t.get(k, '').split(';'):
            name = name.strip()
            if name and name != t['name'] and name not in names: names.append(name)
    # Keep only publicly mapped address fields, never infer a missing street/house number.
    full = format_address(t)
    return {'id': f'{kind}/{oid}', 'name': t['name'], 'aliases': names, 'address': full,
            'lat': round(lat, 7), 'lng': round(lon, 7), 'category': category(t),
            'position': 'point' if kind == 'node' else 'representative'}

class Relations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__(); self.boundaries = {}; self.places = []; self.needed = set()
    def relation(self, r):
        t = dict(r.tags)
        members = [(m.ref, m.role) for m in r.members if m.type == 'w']
        if t.get('boundary') == 'administrative' and t.get('name') in CITIES:
            if t['name'] in self.boundaries: raise ValueError('Ambiguous municipal boundary')
            self.boundaries[t['name']] = {'id': r.id, 'members': members}; self.needed.update(x for x, _ in members)
        elif eligible(t) and members:
            self.places.append((r.id, t, members)); self.needed.update(x for x, _ in members)

class Features(osmium.SimpleHandler):
    def __init__(self, needed):
        super().__init__(); self.nodes = {}; self.ways = {}; self.places = []; self.needed = needed
    def node(self, n):
        if not n.location.valid() or not in_envelope(n.location.lon, n.location.lat): return
        xy = (n.location.lon, n.location.lat); self.nodes[n.id] = xy
        t = dict(n.tags)
        if eligible(t): self.places.append(make_row('node', n.id, t, *xy))
    def way(self, w):
        if w.id not in self.needed and 'name' not in w.tags: return
        t = dict(w.tags)
        if w.id not in self.needed and not eligible(t): return
        coords = [self.nodes.get(n.ref) for n in w.nodes]
        if len(coords) < 2 or any(x is None for x in coords): return
        if w.id in self.needed: self.ways[w.id] = coords
        if eligible(t):
            shape = Polygon(coords) if len(coords) >= 4 and coords[0] == coords[-1] else LineString(coords)
            if shape.is_empty: return
            p = shape.representative_point() if shape.geom_type == 'Polygon' else shape.interpolate(.5, normalized=True)
            self.places.append(make_row('way', w.id, t, p.x, p.y))

def build(source, output, work_dir=None):
    with osmium.io.Reader(str(source), osmium.osm.NOTHING) as reader:
        timestamp = reader.header().get('osmosis_replication_timestamp')
    if not timestamp: raise ValueError('Missing source timestamp')
    signature = [source.stat().st_size, source.stat().st_mtime_ns, timestamp, 2]
    checkpoint = work_dir / 'named-place-checkpoint.json' if work_dir else None
    saved = json.loads(checkpoint.read_text()) if checkpoint and checkpoint.exists() else None
    if saved and saved.get('signature') == signature:
        first = Relations(); first.boundaries = saved['boundaries']
        second = Features(set()); second.ways = {int(k): v for k, v in saved['ways'].items()}; second.places = saved['places']
        print('Reusing local extraction checkpoint', flush=True)
    else:
        first = Relations(); print('Reading municipal boundary relations…', flush=True); first.apply_file(str(source)); print('Boundary relations loaded', flush=True)
        if set(first.boundaries) != set(CITIES): raise ValueError('Both municipal boundaries are required')
        second = Features(first.needed); print('Reading named places…', flush=True); second.apply_file(str(source)); print('Named places loaded:', len(second.places), flush=True)
        for oid, tags, members in first.places:
            if any(w not in second.ways for w, _ in members): continue
            coords = [xy for w, _ in members for xy in second.ways[w]]
            if not coords: continue
            lon = (min(x for x, _ in coords) + max(x for x, _ in coords)) / 2
            lat = (min(y for _, y in coords) + max(y for _, y in coords)) / 2
            second.places.append(make_row('relation', oid, tags, lon, lat))
        boundary_ids = {w for ref in first.boundaries.values() for w, _ in ref['members']}
        second.ways = {k: v for k, v in second.ways.items() if k in boundary_ids}
        if checkpoint:
            work_dir.mkdir(parents=True, exist_ok=True)
            checkpoint.write_text(json.dumps({'signature': signature, 'boundaries': first.boundaries, 'ways': second.ways, 'places': second.places}, ensure_ascii=False))
    # Administrative borders may extend offshore, outside our POI memory envelope.
    # Fetch only those missing public boundary ways, never guess or truncate the border.
    for city, ref in first.boundaries.items():
        missing = sorted({w for w, _ in ref['members'] if w not in second.ways})
        print(city, 'boundary ways to complete:', len(missing), flush=True)
        for wid in missing:
            url = f'https://api.openstreetmap.org/api/0.6/way/{wid}/full.json'
            request = urllib.request.Request(url, headers={'User-Agent': 'Yuyutei-Performance-Manager-Catalog/1.0'})
            data = json.loads(urllib.request.urlopen(request, timeout=30).read())
            nodes = {e['id']: (e['lon'], e['lat']) for e in data['elements'] if e['type'] == 'node'}
            way = next(e for e in data['elements'] if e['type'] == 'way' and e['id'] == wid)
            second.ways[wid] = [nodes[n] for n in way['nodes']]
    if checkpoint:
        checkpoint.write_text(json.dumps({'signature': signature, 'boundaries': first.boundaries, 'ways': second.ways, 'places': second.places}, ensure_ascii=False))
    boundaries = {}
    for city, ref in first.boundaries.items():
        if not ref['members'] or any(w not in second.ways for w, _ in ref['members']): raise ValueError('Incomplete city boundary: ' + city)
        def rings(inner):
            lines = [LineString(second.ways[w]) for w, role in ref['members'] if (role == 'inner') == inner]
            return unary_union(list(polygonize(unary_union(lines)))) if lines else Polygon()
        boundary = rings(False).difference(rings(True))
        if not boundary.is_valid or boundary.is_empty: raise ValueError('Invalid city boundary: ' + city)
        boundaries[city] = boundary
    manifest = {'schemaVersion': 1, 'sourceDate': timestamp, 'source': '© OpenStreetMap contributors',
        'sourceUrl': 'https://download.geofabrik.de/asia/japan/kanto.html',
        'license': 'ODbL-1.0', 'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/', 'regions': {}}
    output.mkdir(parents=True, exist_ok=True)
    for city, key in CITIES.items():
        rows = [row for row in second.places if boundaries[city].covers(Point(row['lng'], row['lat']))]
        # Collapse a node/outline duplicate only when both name and near-identical position agree.
        unique = []; groups = {}
        for row in sorted(rows, key=lambda r: (r['position'] != 'point', r['id'])):
            name = unicodedata.normalize('NFKC', row['name']).replace(' ', '').replace('　', '')
            previous = groups.setdefault(name, [])
            if any(math.hypot((row['lng']-r['lng'])*90000, (row['lat']-r['lat'])*111000) < 35 and
                   (not row['address'] or not r['address'] or row['address'] == r['address']) for r in previous): continue
            previous.append(row); unique.append(row)
        unique.sort(key=lambda r: (r['name'], r['id']))
        if not unique: raise ValueError('Empty catalog: ' + city)
        document = {'schemaVersion': 1, 'region': city, 'sourceDate': timestamp, 'license': 'ODbL-1.0', 'rows': unique}
        raw = (json.dumps(document, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
        (output / (key + '.json')).write_bytes(raw)
        manifest['regions'][city] = {'file': key + '.json', 'count': len(unique), 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(), 'boundary': f'relation/{first.boundaries[city]["id"]}'}
        print(city, len(unique), len(raw), timestamp, flush=True)
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=pathlib.Path); parser.add_argument('source', type=pathlib.Path); parser.add_argument('--output', default='place-catalog', type=pathlib.Path)
    args = parser.parse_args(); build(args.source, args.output, args.work_dir)
