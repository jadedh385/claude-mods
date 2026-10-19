# claude-mods

My Claude Code mods. Each mod lives in its own folder under `mods/` and is listed in `.claude-plugin/marketplace.json`.

## Install a mod

```
/plugin install prompt-refiner --marketplace jadedh385/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

## Mods

| Mod | What it does |
| --- | --- |
| prompt-refiner | `/refine <rough prompt>` rewrites it with Haiku using `CLAUDE.md` and `.claude/refine.md`, and puts it in the prompt box. `/refine full ...` uses Task / Context / Constraints / Done-when. `/refine undo` restores your text. |

## Adding a mod

1. Create `mods/<name>/` with `.claude-plugin/plugin.json` and `hooks/`.
2. Add an entry to `.claude-plugin/marketplace.json`.
3. Run `claude plugin validate mods/<name>` and `claude plugin test mods/<name>`.
4. Bump `version` in the mod's `plugin.json` whenever it changes.
