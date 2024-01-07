import { Glob } from "bun";
import { unlinkSync } from "node:fs";
import { resolve } from 'path';

export async function build(args: {
  rootDir: string,
  pbfs: string[],
  slices: string[]
}) {
  const { pbfs, slices } = args;
  if (pbfs.length === 0)
    throw new Error(`you must pass at least one pbf`);

  if (slices.length === 0) {
    const glob = new Glob("/slices/*.json");
    for (const file of glob.scanSync(".")) {
      const slice = file.replace(/.*[/]/, '').replace('.json', '');
      slices.push(slice);
    }
  }

  for (const slice of slices) {
    const tileFile = resolve(`${slice}.pmtiles`);

    unlinkSync(tileFile);

    const rv = Bun.spawnSync([
      'tilemaker',
      ...pbfs.flatMap(pbf => ['--input', pbf]),
      '--output',
      tileFile,
      `--config`,
      `${slice}.json`,
      `--process`,
      `${slice}.lua`,
    ], {
      cwd: 'slices',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    if (rv.exitCode !== 0)
      process.exit(rv.exitCode);


  }
}
