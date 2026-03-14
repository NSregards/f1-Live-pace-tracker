/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Increase API route timeout for OpenF1 fetches
  serverRuntimeConfig: {
    apiTimeout: 30000,
  },
};

module.exports = nextConfig;
