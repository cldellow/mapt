#!/usr/bin/env bun

import { build } from './builder';
import { serve } from './server';
import { mergeStyles } from './styles';
import path from 'path';

const rootDir = path.normalize(path.join(path.dirname(Bun.argv[1]), '..'));
let args = Bun.argv.slice(2);

async function entrypoint() {
  if (args[0] === 'build') {
    args = args.slice(1);

    const pbfs = args.filter(x => x.endsWith('.pbf'));
    const slices = args.filter(x => !x.endsWith('.pbf'));

    return build({
      rootDir,
      pbfs,
      slices,
    });
  } else if (args[0] === 'serve') {
    const port = 8081; // TODO: make this configurable
    return serve({
      rootDir,
      port
    });
  } else if (args[0] === 'style') {
    const rv = await mergeStyles();
    console.log(JSON.stringify(rv, null, 2));

  } else {
    console.log(`Usage:

mapt build [pbf] [layer1] [layer2]  - build tiles
mapt serve                          - launch tileserver and style server
mapt style                          - stitch styles/* into a single file
`);
    process.exit(1);
  }
}

entrypoint();
