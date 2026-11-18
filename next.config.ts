import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds the GitHub Pages site (.github/workflows/pages.yml): a static
// export under the repo's base path, without the Node API routes (route.ts files
// stop counting as routes). Locally and on a Node host, everything runs.
const pages = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(pages
    ? {
        output: "export",
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
        pageExtensions: ["tsx"],
      }
    : {
        // The email client emulator reads its font files from its own package folder.
        serverExternalPackages: ["@hyper-elements/email-clients", "@hyper-elements/email-client-models"],
        outputFileTracingIncludes: {
          "/api/clients": ["./node_modules/@hyper-elements/email-clients/fonts/**/*"],
        },
      }),
};

export default nextConfig;
