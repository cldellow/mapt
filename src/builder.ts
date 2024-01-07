import { Glob } from "bun";
import { unlinkSync } from "node:fs";
import { resolve } from 'path';

export async function build(args: {
  rootDir: string,
  pbfs: string[],
  layers: string[]
}) {
  const { pbfs, layers } = args;
  if (pbfs.length === 0)
    throw new Error(`you must pass at least one pbf`);

  if (layers.length === 0) {
    const glob = new Glob("/layers/*.json");
    for (const file of glob.scanSync(".")) {
      const layer = file.replace(/.*[/]/, '').replace('.json', '');
      layers.push(layer);
    }
  }

  for (const layer of layers) {
    const tileFile = resolve(`${layer}.pmtiles`);

    unlinkSync(tileFile);

    const rv = Bun.spawnSync([
      'tilemaker',
      ...pbfs.flatMap(pbf => ['--input', pbf]),
      '--output',
      tileFile,
      `--config`,
      `${layer}.json`,
      `--process`,
      `${layer}.lua`,
    ], {
      cwd: 'layers',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    if (rv.exitCode !== 0)
      process.exit(rv.exitCode);


  }
}
