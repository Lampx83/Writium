/** @type {import('next').NextConfig} */
const forEmbed = process.env.BUILD_FOR === "embed"
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: forEmbed ? "/embed/write" : "",
  assetPrefix: forEmbed ? "/embed/write" : "",
  images: { unoptimized: true },
}

module.exports = nextConfig
