import { Glob } from "bun";
import { normalize, join, resolve } from 'path';
import { mergeStyles } from './styles';

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
