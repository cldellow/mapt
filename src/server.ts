import { Glob } from "bun";
import { normalize, join, resolve } from 'path';
import type { InteractiveServiceStyles } from './styles';
import { mergeStyles } from './styles';

async function handleStyleJson(config: InteractiveServiceStyles) {
  const data = await mergeStyles(config);
  return new Response(
    JSON.stringify(data),
    {
      headers: {
        'content-type': 'application/json;charset=utf-8'
      }
    }
  );
}

export function normalizePath(rootDir: string, rawPathname: string) {
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

  const glob = new Glob("*.pmtiles");
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
See your map, with styling: <a href='/map'>development</a> or <a href='/map?single'>production</a>
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
      const isSingle = url.searchParams.has('single');
      console.log(`${new Date().toISOString()}: ${url.pathname}`);

      if (url.pathname === '/')
        return handleIndex();

      const path = normalizePath(rootDir, url.pathname);

      // Try to load .json documents with json-6 parser so that we can have comments, etc
      if (path.endsWith('style.json'))
        return handleStyleJson({
          isSingle,
          rootUrl: url.origin
        });

      let file = Bun.file(path);

      // Support Range requests for PMTiles, adapted from
      // https://bun.sh/docs/api/http#streaming-files
      const range = req.headers.get('Range');
      if (range) {
        const [start = 0, end = Infinity] = range // Range: bytes=0-100
          .split("=") // ["Range: bytes", "0-100"]
          .at(-1)! // "0-100"
          .split("-") // ["0", "100"]
          .map(Number); // [0, 100]
        file = file.slice(start, end + 1);
      }

      const response = new Response(file);

      // Enable CORS.
      const origin = req.headers.get('origin');
      if (origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
      }

      return response;
    },
  });
  console.log(`Serving on http://localhost:${port}/`);
}
