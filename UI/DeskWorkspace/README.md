# Desk Workspace subsystem

## Open demo scene
1. Run a static server at repo root (example: `python -m http.server 4173`).
2. Open `http://localhost:4173/UI/DeskWorkspace/Scenes/desk-workspace-demo.html`.

## Spawn test packet
- In the debug panel click **Spawn Case Packet**.
- Keybinds in demo and integrated game view:
  - `P` spawn packet
  - `K` clear desk
  - `O` toggle data overlays (doc id, sorting index, key field)
- Set a deterministic seed in the seed input before spawn for reproducible packets.

## Add a new document template
1. Add a renderer function in `Scripts/templates.js`.
2. Include template name in your spawn/integration config when creating `DeskDocument`.
3. Optionally add associated textures in `Textures/` and reference via `logoUrl` or `wearTexture`.
4. Adjust sizing using `SIZE_PRESETS` in `Scripts/desk-document.js` if needed.
