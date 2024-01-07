#!/usr/bin/env bun

import { build } from './builder';
import { serve } from './server';
import path from 'path';

const rootDir = path.normalize(path.join(path.dirname(Bun.argv[1]), '..'));
let args = Bun.argv.slice(2);

function entrypoint() {
  if (args[0] === 'serve') {
    const port = 8081; // TODO: make this configurable
    return serve({
      rootDir,
      port
    });
  } else if (args[0] === 'build') {
    args = args.slice(1);

    const pbfs = args.filter(x => x.endsWith('.pbf'));
    const slices = args.filter(x => !x.endsWith('.pbf'));

    return build({
      rootDir,
      pbfs,
      slices,
    });
  } else {
    console.log(`Usage:

mapt serve                          - launch tileserver and style server
mapt build [pbf] [layer1] [layer2]  - build tiles
`);
    process.exit(1);
  }
}

entrypoint();
