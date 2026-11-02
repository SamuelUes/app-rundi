module.exports = function(api) {
  api.cache.using(() => process.env.NODE_ENV);
  const plugins = [
    ['module:react-native-dotenv', {
      moduleName: '@env',
      path: '.env',
    }],
  ];
  if (api.env('production')) {
    // Quitar console.* solo en builds de producción (se conservan
    // console.error/console.warn para diagnósticos de fallos reales).
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }
  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
