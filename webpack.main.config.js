const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

// La minification est pilotée par --mode (défaut: production pour les builds).
// Les scripts dev passent --mode development.
const argvMode = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : undefined;
const mode = argvMode || (process.env.NODE_ENV === 'development' ? 'development' : 'production');
const isProd = mode === 'production';

const common = {
  mode,
  devtool: isProd ? false : 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@database': path.resolve(__dirname, 'src/database'),
    },
  },
  // electron et better-sqlite3 (natif) ne peuvent pas être bundlés
  // bufferutil / utf-8-validate : dépendances optionnelles natives de ws (socket.io)
  externals: {
    electron: 'commonjs electron',
    'better-sqlite3-multiple-ciphers': 'commonjs better-sqlite3-multiple-ciphers',
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: { loader: 'ts-loader', options: { transpileOnly: true, ignoreDiagnostics: [5011, 5103] } },
        exclude: /node_modules/,
      },
    ],
  },
  optimization: {
    // Ne PAS inliner process.env.NODE_ENV dans le bundle main :
    // main.ts choisit loadFile/loadURL via process.env.NODE_ENV AU RUNTIME.
    // Sans ceci, webpack fige la branche dev (loadURL localhost:8066) dans l'app packagée.
    nodeEnv: false,
    minimize: isProd,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: { drop_console: false },
        },
      }),
    ],
  },
  stats: { warnings: false },
};

module.exports = [
  {
    ...common,
    target: 'electron-main',
    entry: { main: './src/main/main.ts' },
    output: {
      path: path.resolve(__dirname, 'dist/main'),
      filename: '[name].js',
    },
  },
  {
    ...common,
    target: 'electron-preload',
    entry: { preload: './src/main/preload.ts' },
    output: {
      path: path.resolve(__dirname, 'dist/main'),
      filename: '[name].js',
    },
  },
  {
    ...common,
    target: 'electron-preload',
    entry: { 'splash-preload': './src/main/splash-preload.ts' },
    output: {
      path: path.resolve(__dirname, 'dist/main'),
      filename: '[name].js',
    },
    plugins: [
      new CopyPlugin({
        patterns: [{ from: './src/main/splash.html', to: 'splash.html' }],
      }),
    ],
  },
];
