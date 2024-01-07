# mapt

# Usage

## `build`

```
mapt build file.pbf layer1 layer2
```

Build `layer1.pmtiles` and `layer2.pmtiles` with `file.pbf` as input.

Your tilemaker configuration will be read from `layers/layer1.json`, your Lua profile from `layers/layer1.lua`.

## `serve`

```
mapt serve
```

Launches a local web server to previe your tiles:

- http://localhost:8081
  - Shows your tile files and links to [the PMTiles Viewer](https://protomaps.github.io/PMTiles/)
- http://localhost:8081/map
  - Stitches your style files together and renders a map of your tiles.


