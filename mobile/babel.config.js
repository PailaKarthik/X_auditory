module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-unistyles/plugin',
        {
          // Files under `app/` are force-processed so RN components accept
          // Unistyles styles even when they never import Unistyles directly.
          root: 'app',
          // `src/components/AppShell.tsx` only imports the shared stylesheet,
          // so force-process anything pulling styles from it too.
          autoProcessImports: ['@/src/utils/screenStyles'],
        },
      ],
    ],
  };
};
