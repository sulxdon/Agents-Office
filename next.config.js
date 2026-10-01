/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // sql.js ships a UMD bundle that breaks under webpack — load it as a plain node module.
    serverComponentsExternalPackages: ["sql.js"],
  },
  webpack: (config) => {
    // sql.js ships a wasm file; don't parse it as JS
    config.module.rules.push({ test: /\.wasm$/, type: "asset/resource" });
    return config;
  },
};

module.exports = nextConfig;
