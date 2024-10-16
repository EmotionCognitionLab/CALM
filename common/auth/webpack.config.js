const path = require("path")

module.exports = {
  entry: path.resolve(__dirname, "auth.js"),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "auth.js",
    library: {
        type: "umd"
    },
    libraryTarget: "module",
  },
  module: {
    rules: [
        {
            test: /\.(js)$/,
            exclude: [/node_modules/, /types\.js/],
            use: "babel-loader",
        },
        {
            test: /\.html$/i,
            loader: "html-loader",
        },
    ],
  },
  mode: "production",
  experiments: {
    outputModule: true
  }
}
