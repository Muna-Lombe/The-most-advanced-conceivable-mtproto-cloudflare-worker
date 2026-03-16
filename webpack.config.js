const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  target: 'webworker',
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  experiments: {
    outputModule: true
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    module: true
  }
};