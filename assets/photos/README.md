# Photo Library

Add paired customer and license images here.

Expected folder layout:

- `assets/photos/customers/`
- `assets/photos/licenses/`

Each person should use the same ID filename in both folders:

- `assets/photos/customers/p_0001.png`
- `assets/photos/licenses/p_0001.png`

The mapping between IDs and metadata lives in `data/photo-library.json`.

Optional: use a single atlas image grid.

- Add `atlas` to `data/photo-library.json` with `image`, `tileWidth`, `tileHeight`, `columns`.
- For each photo ID, use `customerAtlas` and `licenseAtlas` with `{ "col": N, "row": N }`.
- Keep `customerImage`/`licenseImage` empty or omitted for atlas entries.

Tag values currently used by the game matcher:

- `ageBand`: `16-17`, `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`
- `hairColor`
- `hairStyle`
- `accessories` (string array)
