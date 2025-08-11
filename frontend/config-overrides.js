const webpack = require('webpack');

module.exports = function override(config) {
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "buffer": require.resolve("buffer"),
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "util": require.resolve("util"),
    "process": require.resolve("process/browser.js"),
    "vm": false,
    "fs": false,
    "net": false,
    "tls": false,
    "http": false,
    "https": false,
    "zlib": false,
    "path": false,
    "os": false
  };
  
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser.js',
    }),
  ];
  
  // Ignore source map warnings for Web3 and other dependencies
  config.ignoreWarnings = [
    function ignoreSourcemapsLoaderWarnings(warning) {
      return (
        warning.module &&
        warning.module.resource &&
        warning.module.resource.includes("node_modules") &&
        warning.details &&
        warning.details.includes("source-map-loader")
      );
    },
  ];
  
  return config;
};
