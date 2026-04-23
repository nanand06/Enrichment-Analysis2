const fs = require('fs');
const backendBinaryExists = fs.existsSync('./resources/backend');

module.exports = {
  packagerConfig: {
    asar: true,
    ...(backendBinaryExists ? { extraResource: ['./resources/backend'] } : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    // FusesPlugin removed: it and Vite both override the start command.
    // To re-enable fuses for production builds, add it back and use only `npm run package` / `npm run make` (not `npm start`).
  ],
};
