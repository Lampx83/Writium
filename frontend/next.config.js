/** @type {import('next').NextConfig} */
const forEmbed = process.env.BUILD_FOR === "embed"
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: forEmbed ? "/embed/writium" : "",
  assetPrefix: forEmbed ? "/embed/writium" : "",
  images: { unoptimized: true },
}

module.exports = nextConfig
