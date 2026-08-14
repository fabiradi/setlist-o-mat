import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isGitHubPages = process.env.GITHUB_ACTIONS === "true" && Boolean(repositoryName);
const basePath = isGitHubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  ...(isGitHubPages ? { output: "export" } : {}),
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
