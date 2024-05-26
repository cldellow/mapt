import { Glob } from "bun";
import { resolve } from 'path';
import json6 from 'json-6';
import { rewriteColors } from './colors';

async function getLayerInformation() {
  // Background and hillshading aren't defined via tilemaker outputs, so set their
  // z-indexes here.
  const layerIndex: { [layerId: string]: number } = {};
  const layersInFile: { [filename: string]: { [layerName: string]: true } } = {};

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


  const glob = new Glob(resolve("slices", "*.json"));
  for (const file of glob.scanSync({
    root: ".",
    onlyFiles: false, // we want to allow symlinks
  })) {
    const root = file.replace(/.*[/]/, '').replace('.json', '');
    const dataString = await (Bun.file(file).text());
    const data = json6.parse(dataString);

    const seenLayers: { [k: string]: true } = {};

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

// When used as a server, pass the prefix to be used, e.g.
// http://localhost:8081
export interface InteractiveServiceStyles {
  rootUrl: string;
  isSingle: boolean;
}

// When used as a pre-built style file, pass in the full path
// to your PMTiles file, e.g. and S3 or R2 URL.
export interface PrebuiltStyles {
  pmtilesUrl: string;
}

export async function mergeStyles(
  config: InteractiveServiceStyles | PrebuiltStyles
) {
  const { layerIndex, layersInFile } = await getLayerInformation();

  // We maintain our styles in the /styles/ folder.
  const glob = new Glob("/styles/*.json");

  const dataString = await (Bun.file('styles/style.json').text());
  const rv = json6.parse(dataString);

  const newSourceKeysByUrl = {};

  let sourceIndex = 1;
  for (const file of glob.scanSync({
    root: ".",
    onlyFiles: false, // we want to allow symlinks
  })) {
    const root = file.replace(/.*[/]/, '').replace('.json', '');

    if (root === 'style')
      // style.json is special; it's the root stylesheet and
      // is already in `rv`
      continue;
    const dataString = await (Bun.file(file).text());
    const data = json6.parse(dataString);

    // TODO: we should support inserting the whole sources/tiles key if absent,
    //       to simplify things
    if ('pmtilesUrl' in config)
      data.sources.tiles.url = `pmtiles://${config.pmtilesUrl}`;
    else
      data.sources.tiles.url = `pmtiles://${config.rootUrl}/${config.isSingle ? 'tiles' : root}.pmtiles`;

    const sourceMap: { [id: string]: string } = {};
    for (const [sourceKey, sourceValue] of Object.entries(data.sources)) {
      const sourceValueUrl = (sourceValue as any).url;
      if (newSourceKeysByUrl[sourceValueUrl]) {
        sourceMap[sourceKey] = newSourceKeysByUrl[sourceValueUrl];
      } else {
        const newSourceKey = `tiles${sourceIndex}`;
        sourceMap[sourceKey] = newSourceKey;
        rv.sources[newSourceKey] = sourceValue;
        sourceIndex++;
        newSourceKeysByUrl[sourceValueUrl] = newSourceKey;
      }
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

  rv.layers.sort((a: any, b: any) => {
    const aLayer: string = a['source-layer'] || a['id'] || '';
    const bLayer: string = b['source-layer'] || b['id'] || '';

    const az = layerIndex[aLayer] ?? 99999;
    const bz = layerIndex[bLayer] ?? 99999;

    if (az != bz)
      return az - bz;

    return a._zindex - b._zindex;
  });

  rewriteColors(rv);
  return rv;
}
