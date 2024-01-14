import { Glob } from "bun";
import json6 from 'json-6';
import { rewriteColors } from './colors';

async function getLayerInformation() {
  // Background and hillshading aren't defined via tilemaker outputs, so set their
  // z-indexes here.
  const layerIndex = {};
  const layersInFile = {};

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


  const glob = new Glob("/slices/*.json");
  for (const file of glob.scanSync(".")) {
    const root = file.replace(/.*[/]/, '').replace('.json', '');
    const dataString = await (Bun.file(file).text());
    const data = json6.parse(dataString);

    const seenLayers = {};

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

export async function mergeStyles(isSingle: boolean | string) {
  const { layerIndex, layersInFile } = await getLayerInformation();

  // We maintain our styles in the /styles/ folder.
  const glob = new Glob("/styles/*.json");

  const dataString = await (Bun.file('styles/style.json').text());
  const rv = json6.parse(dataString);

  let sourceIndex = 1;
  for (const file of glob.scanSync(".")) {
    const root = file.replace(/.*[/]/, '').replace('.json', '');

    if (root === 'style')
      // style.json is special; it's the root stylesheet and
      // is already in `rv`
      continue;
    const dataString = await (Bun.file(file).text());
    const data = json6.parse(dataString);

    // TODO: we should support inserting the whole sources/tiles key if absent,
    //       to simplify things
    if (typeof isSingle === 'string')
      data.sources.tiles.url = `pmtiles://${isSingle}`;
    else
      data.sources.tiles.url = `pmtiles://http://localhost:8081/${isSingle ? 'tiles' : root}.pmtiles`;

    const sourceMap = {};
    // TODO: de-dupe, if multiple things use the same URL
    for (const [sourceKey, sourceValue] of Object.entries(data.sources)) {
      const newSourceKey = `tiles${sourceIndex}`;
      sourceMap[sourceKey] = newSourceKey;

      rv.sources[newSourceKey] = sourceValue;

      sourceIndex++;
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

  rv.layers.sort((a, b) => {
    const aLayer = a['source-layer'] || a['id'] || '';
    const bLayer = b['source-layer'] || b['id'] || '';

    const az = layerIndex[aLayer] ?? 99999;
    const bz = layerIndex[bLayer] ?? 99999;

    if (az != bz)
      return az - bz;

    return a._zindex - b._zindex;
  });

  rewriteColors(rv);
  return rv;
}


