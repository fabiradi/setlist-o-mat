import type { MetadataRoute } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const publicBasePath = process.env.GITHUB_ACTIONS === "true" && repositoryName ? `/${repositoryName}` : "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Setlist-o-Mat",
    short_name: "Setlist-o-Mat",
    description: "Gemeinsam das beste Konzertprogramm finden.",
    start_url: `${publicBasePath}/`,
    scope: `${publicBasePath}/`,
    display: "standalone",
    background_color: "#f7f4ed",
    theme_color: "#241d38",
    icons: [
      { src: `${publicBasePath}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${publicBasePath}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${publicBasePath}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
