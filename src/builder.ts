export async function build(args: {
  pbfs: string[],
  layers: string[]
}) {
  const { pbfs, layers } = args;
  if (pbfs.length === 0)
    throw new Error(`you must pass at least one pbf`);

  // TODO: if layers is empty, enumerate all the layers
  for (const layer of layers) {
    const rv = Bun.spawnSync([
      'tilemaker',
      ...pbfs.flatMap(pbf => ['--input', pbf]),
      '--output',
      `../${layer}.pmtiles`,
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
