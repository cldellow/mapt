import { Glob } from "bun";
import { Database } from 'bun:sqlite';
import json6 from 'json-6';
import { rewriteColors } from './colors';
import { normalize, join, resolve } from 'path';

async function getLayerInformation() {
  // Background and hillshading aren't defined via tilemaker outputs, so set their
  // z-indexes here.
  const layerIndex = {};
  const layersInFile = {};

  {
    const dataString = await (Bun.file('styles/style.json').text());
    const data = json6.parse(dataString);

    for (const layer of data.layers || []) {
      const { id } = layer;
      const m = /-([0-9]+)$/.exec(id);

      if (m) {
        //seenLayers[id] = true;
        layerIndex[id] = Number(m[1]);
      }
    }
  }


  const glob = new Glob("/layers/*.json");
  for (const file of glob.scanSync(".")) {
    const root = file.replace(/.*[/]/, '').replace('.json', '');
    const dataString = await (Bun.file(file).text());
    const data = json6.parse(dataString);

    const seenLayers = {};

    for (const [k, v] of Object.entries(data.layers || {})) {
      seenLayers[k] = true;
      if (typeof v.zindex === 'number')
        layerIndex[k] = v.zindex;
    }

    layersInFile[root] = seenLayers;
  }

  return {
    layerIndex,
    layersInFile
  }
}

async function mergeStyles() {
  const { layerIndex, layersInFile } = await getLayerInformation();

  // We maintain our styles in the /styles/ folder.
  const glob = new Glob("/styles/*.json");

  const dataString = await (Bun.file('styles/style.json').text());
  const rv = json6.parse(dataString);

  let sourceIndex = 1;
  for (const file of glob.scanSync(".")) {
    const root = file.replace(/.*[/]/, '').replace('.json', '');

    if (root === 'style')
      // style.json is special; it's the root stylesheet and
      // is already in `rv`
      continue;
    const dataString = await (Bun.file(file).text());
    const data = json6.parse(dataString);

    const sourceMap = {};
    // TODO: de-dupe, if multiple things use the same URL
    for (const [sourceKey, sourceValue] of Object.entries(data.sources)) {
      const newSourceKey = `tiles${sourceIndex}`;
      sourceMap[sourceKey] = newSourceKey;

      rv.sources[newSourceKey] = sourceValue;

      sourceIndex++;
    }

    let i = 1;
    for (const layer of data.layers) {
      if (layer['source-layer']) {
        if (!layersInFile[root][layer['source-layer']]) {
          throw new Error(`styles/${root}.json references unknown layer ${layer['source-layer']}`);
        }
      }
      layer.id = root + '-' + layer.id;
      layer.source = sourceMap[layer.source];
      layer._zindex = i;
      rv.layers.push(layer);
      i++;
    }
  }

  rv.layers.sort((a, b) => {
    const aLayer = a['source-layer'] || a['id'] || '';
    const bLayer = b['source-layer'] || b['id'] || '';

    const az = layerIndex[aLayer] ?? 99999;
    const bz = layerIndex[bLayer] ?? 99999;

    if (az != bz)
      return az - bz;

    return a._zindex - b._zindex;
  });

  rewriteColors(rv);
  return rv;
}

async function handleStyleJson() {
  const data = await mergeStyles();
  return new Response(
    JSON.stringify(data),
    {
      headers: {
        'content-type': 'application/json;charset=utf-8'
      }
    }
  );
}

export function normalizePath(rootDir, rawPathname) {
  let path = `${rawPathname}`;
  if (path === '/map')
    path = '/map.html';

  path = path.replace(/%20/g, ' ');

  path = normalize(path);
  path = path.replace(/^[/\\]*/g, '');

  if (path === 'favicon.ico' || path === 'index.html' || path === 'map.html') {
    // These are provided by the npm package.
    return resolve(rootDir, path);
  }

  // Anything else is assumed to be relative to the working directory.
  return path;
}

export async function handleIndex() {
  const tiles = [];

  const glob = new Glob("/*.pmtiles");
  const files = [];
  for (const file of glob.scanSync("."))
    files.push(file);

  files.sort();
  for (const file of files) {
    const url = `http://localhost:8081/${file}`;
    const pmUrl = `https://protomaps.github.io/PMTiles/?url=${encodeURIComponent(url)}`;
    console.log(file);
    tiles.push(
      `<li><a href="${pmUrl}">${file}</a></li>`
    );
  }

  const response = new Response(`
<head>
  <title>Mapt</title>
</head>
<body>
<a href='/map'>See your map, with styling</a>
<hr/>
<ul>
${tiles.join('')}
</ul>
</body>
`);

  response.headers.set('Content-type', 'text/html');

  return response;
}

export function serve(args: {
  rootDir: string,
  port: number
}) {
  const { rootDir, port } = args;
  Bun.serve({
    port,
    development: true,
    async fetch(req) {
      const url = new URL(req.url);
      console.log(`${new Date().toISOString()}: ${url.pathname}`);

      if (url.pathname === '/')
        return handleIndex();

      const path = normalizePath(rootDir, url.pathname);

      // Try to load .json documents with json-6 parser so that we can have comments, etc
      if (path.endsWith('style.json'))
        return handleStyleJson();

      let file = Bun.file(path);

      // Support Range requests for PMTiles, adapted from
      // https://bun.sh/docs/api/http#streaming-files
      if (req.headers.get('Range')) {
        const [start = 0, end = Infinity] = req.headers
          .get("Range") // Range: bytes=0-100
          .split("=") // ["Range: bytes", "0-100"]
          .at(-1) // "0-100"
          .split("-") // ["0", "100"]
          .map(Number); // [0, 100]
        file = file.slice(start, end + 1);
      }

      const response = new Response(file);

      // Enable CORS.
      if (req.headers.get('origin')) {
        response.headers.set('Access-Control-Allow-Origin', req.headers.get('origin'));
      }

      return response;
    },
  });
  console.log(`Serving on http://localhost:${port}/`);
}
