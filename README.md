# mapt

`mapt` is an opinionated tool for building custom [vector tiles](https://docs.mapbox.com/data/tilesets/guides/vector-tiles-introduction/) with [tilemaker](https://github.com/systemed/tilemaker). It can also help author
[MapLibre style sheets](https://maplibre.org/maplibre-style-spec/).

`mapt` provides an easier developer workflow:

- encourages thematic layers (e.g. `land`, `roads`, `boundaries`)
  - ⚡ iterate faster when developing
  - 🎯 create focused Lua files that are easier to understand
- uses [JSON6](https://github.com/d3x0r/json6) for parsing `.json` files
  - 🤝 document and collaborate with `//` and `/* ... */` comments
  - 🔣 don't sweat the details - trailing commas and naked identifiers are OK
- works for dev or production
  - 🎶 in dev mode, `mapt` dynamically renders your full map based on several input `pmtiles` and style files
  - 🎵 in production mode, `mapt` produces a single `pmtiles` and style file, suitable for publishing to static hosting

# Usage

`mapt` requires a specific file layout. Consider an example map
that has been factored into `land` and `water` themes. It has this
layout:

```bash
layers/land.json    # tilemaker config file
layers/land.lua     # tilemaker lua profile
layers/water.json   # tilemaker config file
layers/water.lua    # tilemaker lua profile
styles/style.json   # Root MapLibre style file into which other styles
                    # will be merged
styles/land.json    # Style file for land
styles/water.json   # Style file for water
```

You author your Lua profiles and style files modularly. `mapt` will
intelligently combine them together as needed.

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
