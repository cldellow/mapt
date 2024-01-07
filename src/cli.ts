#!/usr/bin/env bun

import { serve } from './server';
import path from 'path';

const rootDir = path.normalize(path.join(path.dirname(Bun.argv[1]), '..'));
const args = Bun.argv.slice(2);

function entrypoint() {
  if (args[0] === 'serve') {
    const port = 8081; // TODO: make this configurable
    return serve({
      rootDir,
      port
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
