import type { Metadata, Viewport } from "next";
import "./globals.css";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const publicBasePath = process.env.GITHUB_ACTIONS === "true" && repositoryName ? `/${repositoryName}` : "";

export const metadata: Metadata = {
  title: "Setlist-o-Mat",
  description: "Gemeinsam das beste Konzertprogramm finden.",
  applicationName: "Setlist-o-Mat",
  manifest: `${publicBasePath}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "Setlist-o-Mat", statusBarStyle: "black-translucent" },
  other: { "codex-preview": "development" },
  icons: {
    icon: `${publicBasePath}/favicon.svg`,
    shortcut: `${publicBasePath}/favicon.svg`,
    apple: [{ url: `${publicBasePath}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#231c3b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
