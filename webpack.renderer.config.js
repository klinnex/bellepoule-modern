const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = (env = {}) => ({
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  cache: process.env.NODE_ENV === 'production'
    ? false
    : { type: 'filesystem', buildDependencies: { config: [__filename] } },
  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
          },
        },
      }),
    ],
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10,
        },
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          name: 'react',
          chunks: 'all',
          priority: 20,
        },
      },
    },
  },
  entry: './src/renderer/index.tsx',
  target: 'electron-renderer',
  // Pas de source maps en production : évite d'exposer le code source original
  devtool: process.env.NODE_ENV === 'production' ? false : 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: '[name].js',
    chunkFilename: '[name].chunk.js',
    globalObject: 'globalThis',
  },
  devServer: {
    port: 8066,
    // Restreint le serveur de dev à la machine locale (évite l'exposition réseau du source non minifié)
    host: '127.0.0.1',
    hot: true,
    open: false,
    historyApiFallback: true,
    allowedHosts: 'auto',
    // En dev, webpack serve garde les assets en mémoire. Le splash (chargé par
    // Electron via loadFile depuis dist/) doit être écrit sur disque, sinon
    // Electron lit un fichier obsolète et le badge de canal reste figé sur « main ».
    devMiddleware: {
      writeToDisk: (filePath) =>
        /[\\/]dist[\\/]main[\\/]splash\.html$/.test(filePath) ||
        /[\\/]dist[\\/]remote[\\/]/.test(filePath),
    },
    static: {
      directory: path.join(__dirname, 'dist/renderer'),
      publicPath: '/',
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      // Build navigateur de uuid : la cible electron-renderer résout la variante
      // « node » (require('crypto')), indisponible avec contextIsolation
      uuid$: path.resolve(__dirname, 'node_modules/uuid/dist/cjs-browser/index.js'),
    },
  },
  stats: {
    warnings: false,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: { loader: 'ts-loader', options: { ignoreDiagnostics: [5011, 5103] } },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/renderer/locales',
          to: 'locales',
          noErrorOnMissing: true,
        },
        {
          from: 'src/remote',
          to: '../remote',
          noErrorOnMissing: true,
        },
        {
          // Le client socket.io n'est PAS dans node_modules de l'app packagée
          // (socket.io est bundlé côté serveur, node_modules non inclus).
          // On le copie dans dist/remote → servi en statique par le serveur distant.
          from: 'node_modules/socket.io/client-dist/socket.io.min.js',
          to: '../remote/socket.io.min.js',
        },
        {
          from: 'src/main/splash.html',
          to: path.resolve(__dirname, 'dist/main/splash.html'),
          noErrorOnMissing: true,
        },
      ],
    }),
    ...(env.analyze ? [new BundleAnalyzerPlugin()] : []),
  ],
});
