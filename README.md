# mapt

`mapt` is an opinionated tool for building custom [vector tiles](https://docs.mapbox.com/data/tilesets/guides/vector-tiles-introduction/) with [tilemaker](https://github.com/systemed/tilemaker). It can also help author
[MapLibre style sheets](https://maplibre.org/maplibre-style-spec/).

`mapt` provides an easier developer workflow:

- encourages thematic slices (e.g. `land`, `roads`, `boundaries`)
  - ⚡ iterate faster when developing
  - 🎯 create focused Lua files that are easier to understand
- humanizes JSON config
  - 🤝 use [JSON6](https://github.com/d3x0r/json6) for parsing `.json` files, so `//` and `/* ... */` comments, trailing commas, and naked identifiers are supported
  - 🎨 optionally use [Tailwind CSS colour palette](https://atmos.style/palettes/tailwindcss) names like `red-50`, `red-100`, etc, not raw hex codes
- works for dev or production
  - 🎶 in dev mode, `mapt` dynamically renders your full map based on several input `pmtiles` and style files
  - 🎵 in production mode, `mapt` produces a single `pmtiles` and style file, suitable for publishing to static hosting

# Usage

`mapt` requires a specific file layout. Consider an example map
that has been factored into `land` and `water` slices. It has this
layout:

```bash
slices/land.json    # tilemaker config file
slices/land.lua     # tilemaker lua profile
slices/water.json   # tilemaker config file
slices/water.lua    # tilemaker lua profile
styles/style.json   # Root MapLibre style file into which other styles
                    # will be merged
styles/land.json    # Style file for land
styles/water.json   # Style file for water
```

You author your Lua profiles and style files modularly. `mapt` will
intelligently combine them together as needed.

## `build`

```
mapt build file.pbf land water
```

Build `land.pmtiles` and `water.pmtiles` with `file.pbf` as input.

Your tilemaker configuration will be read from `slices/land.json`, your Lua profile from `layers/land.lua`, etc.

## `serve`

```
mapt serve
```

Launches a local web server to previe your tiles:

- http://localhost:8081
  - Shows your tile files and links to [the PMTiles Viewer](https://protomaps.github.io/PMTiles/)
- http://localhost:8081/map
  - Stitches your style files together and renders a map of your tiles.
