import { Glob } from "bun";
import fs from "node:fs";
import { basename, dirname, join, resolve } from 'path';
import os from 'os';
import json6 from 'json-6';

class TerminateError extends Error {
  constructor(exitCode) {
    super("");
    this.name = "TerminateError";
    this.exitCode = exitCode;
  }
}

export async function build(args: {
  isSingle: boolean,
  noOutput: boolean,
  pbfs: string[],
  slices: string[],
  tilemakerArgs: string[]
}) {
  const { noOutput, tilemakerArgs, isSingle, pbfs, slices } = args;
  if (pbfs.length === 0)
    throw new Error(`you must pass at least one pbf`);

  if (slices.length === 0 || isSingle) {
    while(slices.length > 0) slices.pop();

    const glob = new Glob("/slices/*.json");
    for (const file of glob.scanSync(".")) {
      const slice = file.replace(/.*[/]/, '').replace('.json', '');

      if (slice.startsWith('mapt_')) {
        fs.unlinkSync(file);
        continue;
      }

      slices.push(slice);
    }
    slices.sort();
  }

  const tmpPrefix = resolve(join('slices', `mapt_${process.pid}_`));

  try {
    try {
      if (isSingle)
        return await buildSingle({ noOutput, tmpPrefix, tilemakerArgs, pbfs, slices });

      return await buildMany({ noOutput, tmpPrefix, tilemakerArgs, pbfs, slices });
    } finally {
      if (process.env.KEEP_FILES !== '1') {
        const glob = new Glob(basename(`${tmpPrefix}`) + '*');
        for (const file of glob.scanSync(dirname(tmpPrefix))) {
          const fqpath = resolve('slices', file);
          fs.unlinkSync(fqpath);
        }
      }
    }
  } catch (e) {
    if (e instanceof TerminateError)
      process.exit(e.exitCode);
    
    throw e;
  }
}

function mergeJson(acc: any, cur: any): any {
  for (const [k, v] of Object.entries(cur)) {
    if (typeof acc[k] === 'undefined') {
      acc[k] = v;
    } else if (k === 'layers') {
      for (const [layerName, layer] of Object.entries(v)) {
        if (acc.layers[layerName]) {
          // This isn't _always_ an error. For example, Hiker Atlas
          // uses a fake `parks` layer.
          console.warn(`duplicate layer detected: ${layerName}`);
        }

        acc.layers[layerName] = layer;
      }
    } else if (k === 'settings') {
      for (const [setting, value] of Object.entries(v)) {
        if (setting === 'minzoom')
          // Take min
          acc.settings[setting] = Math.min(value, acc.settings[setting] ?? 999);
        else if (setting === 'maxzoom' || setting === 'basezoom')
          // Take max
          acc.settings[setting] = Math.max(value, acc.settings[setting] ?? -1);
        else if (setting === 'include_ids' || setting === 'compress' || setting == 'metadata' || setting == 'filemetadata' || setting === 'combine_below' || setting === 'name' || setting === 'version' || setting === 'description')
          // Last writer wins
          acc.settings[setting] = value;
        else
          console.warn(`unknown layer.settings key: ${setting}`);
      }

    } else {
      console.log(`unexpected key: ${k}`);
    }
  }
};

async function buildSingle(args: {
  noOutput: boolean;
  tmpPrefix: string;
  pbfs: string[];
  slices: string[],
  tilemakerArgs: string[]
}) {
  // We jump through a lot of hoops. The general idea is that we'd
  // like to create a Lua file that forwards calls to node_function
  // and friends to the versions defined in the user's main files.
  //
  // ...but those main files aren't expecting to be used as a module,
  // so first we'll rewrite them to export their functions.
  //
  // ...and we don't want to make any assumptions about the working
  // directory, so we create the temp files in the same folder as
  // the main files, cleaning up after ourselves at the end.
  //
  // It's a bit of bookkeeping, but hopefully gives a good developer
  // experience.
  const { noOutput, tmpPrefix, tilemakerArgs, pbfs, slices } = args;

  let layerJson = {};

  // Construct a single JSON file.
  const glob = new Glob("/slices/*.json");
  const sliceLuas = [];
  for (const file of glob.scanSync(".")) {
    sliceLuas.push(resolve('slices', basename(file, '.json') + '.lua'));
    const dataString = await (Bun.file(file).text());
    const data = json6.parse(dataString);
    mergeJson(layerJson, data);
  }

  if (noOutput)
    layerJson = rewriteConfigAsNoOutput(layerJson);

  const jsonFile = `${tmpPrefix}config.json`;
  fs.writeFileSync(jsonFile, JSON.stringify(layerJson, null, 2), 'utf-8');

  const sliceMap = {};

  // Rewrite the layer-specific Lua files to export their functions.
  // Note that there may be some Lua files that are just library code--
  // we shouldn't rewrite them.
  for (const inputLua of sliceLuas) {
    const tmpLua = tmpPrefix + basename(inputLua);
    const dataString = await (Bun.file(inputLua).text());
    fs.writeFileSync(tmpLua, `${dataString}

local _mapt_module = {};
_mapt_module.node_keys = node_keys or nil;
_mapt_module.way_keys = way_keys or nil;
_mapt_module.attribute_function = attribute_function or function(attr, layer) return {} end;
_mapt_module.init_function = init_function or function(name) end;
_mapt_module.exit_function = exit_function or function() end;
_mapt_module.node_function = node_function or function() end;
_mapt_module.way_function = way_function or function() end;
_mapt_module.relation_scan_function = relation_scan_function or function() return false end;
_mapt_module.relation_function = relation_function or function() end;
return _mapt_module;
`, 'utf-8');
    sliceMap[inputLua] = {
      name: basename(tmpLua, '.lua'),
    };
  }

  // Write a driver Lua file that proxies to the layer-specific functions.
  const driverFile = tmpPrefix + 'driver.lua';

  const modnames = Object.values(sliceMap).map(x => x.name);

  const generateInvokes = (what: string) => {
    return modnames.map(x => `  ${x}.${what}\n`).join('');
  }

  const driverString = `
local origG = _G;

${modnames.map(x => {
  const funcName = `func_${x}`;
  const envName = `env_${x}`;
  return `
local ${funcName} = loadfile('${x}.lua');
local ${envName} = {};
setmetatable(${envName}, {__index = origG});
setfenv(${funcName}, ${envName});
${x} = ${funcName}();
`;
}).join('')}

-- TODO: initialize node_keys / way_keys

function init_function(name)
${generateInvokes('init_function(name);')}
end

function exit_function()
${generateInvokes('exit_function();')}
end

function attribute_function(attr, layer)
  -- TODO: only forward to module if the layer was declared in its source file
  local rv;
${modnames.map(x => {
  return `
  rv = ${x}.attribute_function(attr, layer) or {};
  if next(rv) ~= nil then return rv end
`;
}).join('')}
  return {}
end

function node_function()
  -- TODO: respect node_keys
${generateInvokes('node_function();')}
end

function way_function()
  -- TODO: respect way_keys
${generateInvokes('way_function();')}
end

function relation_scan_function()
  local rv;
${modnames.map(x => {
  return `
  rv = ${x}.relation_scan_function() == true or rv;
`;
}).join('')}

  return rv
end

function relation_function()
${generateInvokes('relation_function(); RestartRelations();')}
end
`;

  //console.log(driverString);
  fs.writeFileSync(driverFile, driverString, 'utf-8');

  const tileFile = resolve(`${noOutput ? 'mapt_no_output' : 'tiles'}.pmtiles`);

  try {
    fs.unlinkSync(tileFile);
  } catch (e) {
    // ignored
  }

  const rv = Bun.spawnSync([
    ...(process.env.DEBUG === '1' ? ['gdb', '--args'] : []),
    process.env.TILEMAKER || 'tilemaker',
    ...pbfs.flatMap(pbf => ['--input', pbf]),
    '--output',
    tileFile,
    `--config`,
    jsonFile,
    `--process`,
    driverFile,
    ...tilemakerArgs
  ], {
    cwd: 'slices',
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (rv.exitCode !== 0)
    throw new TerminateError(rv.exitCode);

}

function rewriteConfigAsNoOutput(input: any) {
  const copy = JSON.parse(JSON.stringify(input));
  copy.settings.minzoom = copy.settings.maxzoom = 0;
  return copy;
}

async function buildMany(args: {
  noOutput: boolean;
  tmpPrefix: string;
  pbfs: string[];
  slices: string[],
  tilemakerArgs: string[]
}) {
  const { noOutput, tmpPrefix, tilemakerArgs, pbfs, slices } = args;
  for (const slice of slices) {
    const tileFile = resolve(`${noOutput ? 'mapt_no_output' : slice}.pmtiles`);

    try {
      fs.unlinkSync(tileFile);
    } catch (e) {
      // ignored
    }

    const jsonInputFile = resolve('slices', `${slice}.json`);
    const dataString = await (Bun.file(jsonInputFile).text());
    let data = json6.parse(dataString);
    if (noOutput)
      data = rewriteConfigAsNoOutput(data);
    const tmpJsonInputFile = tmpPrefix + '_input.json';
    fs.writeFileSync(tmpJsonInputFile, JSON.stringify(data, null, 2), 'utf-8');

    const rv = Bun.spawnSync([
      ...(process.env.DEBUG === '1' ? ['gdb', '--args'] : []),
      process.env.TILEMAKER || 'tilemaker',
      ...pbfs.flatMap(pbf => ['--input', pbf]),
      '--output',
      tileFile,
      `--config`,
      tmpJsonInputFile,
      `--process`,
      `${slice}.lua`,
      ...tilemakerArgs
    ], {
      cwd: 'slices',
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    if (noOutput)
      try {
        fs.unlinkSync(tileFile);
      } catch (e) {
        // ignored
      }

    if (rv.exitCode !== 0)
      throw new TerminateError(rv.exitCode);
  }
}
