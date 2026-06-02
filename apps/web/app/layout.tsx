import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VidGrab: Ad-free YouTube & Instagram Downloader",
  description:
    "Paste a YouTube or Instagram link and download the video, merged video+audio, or audio-only, in the highest quality the source offers. No ads, no popups, no tracking.",
  openGraph: {
    title: "VidGrab",
    description: "Ad-free video downloader for YouTube and Instagram.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
