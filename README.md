# BetterDiscord Plugins

This fork of [Zerthox/BetterDiscord-Plugins](https://github.com/Zerthox/BetterDiscord-Plugins) contains plugins for [BetterDiscord](https://betterdiscord.app). The `develop` branch holds source and build tooling; the built plugins are available in [dist/bd on master](https://github.com/XxUnkn0wnxX/Zerthox-BetterDiscord-Plugins/tree/master/dist/bd).

## Building from source

Use Node.js 24 and install the locked dependencies with `npm ci`.

```sh
# Build all plugins to the locally ignored dist/bd directory
npm run build

# Build specific plugins
npm run build -- BetterFolders BetterVolume

# Build directly to the BetterDiscord plugins folder and watch for changes
npm run dev -- BetterFolders
```

Make source changes on `develop`. CI builds the published plugins from a source commit and updates the distribution on `master`. To run publication manually, select `develop` when dispatching the workflow.
