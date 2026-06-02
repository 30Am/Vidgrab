import Link from "next/link";
import { Downloader } from "@/components/Downloader";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4">
      <section className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Download YouTube &amp; Instagram videos.
          <span className="block text-brand">No ads. No nonsense.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-400">
          Paste a link, pick a quality, click once. Up to 4K video, merged audio, or
          audio-only, straight to your device.
        </p>

        <div className="mt-10 flex w-full justify-center">
          <Downloader />
        </div>

        <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
          <li>✓ Up to 4K</li>
          <li>✓ Audio-only (MP3 / M4A)</li>
          <li>✓ No popups or fake buttons</li>
          <li>✓ Files auto-delete after 24h</li>
        </ul>
      </section>

      <footer className="w-full border-t border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-slate-800">
        <nav className="flex justify-center gap-6">
          <Link href="/about" className="hover:text-brand">
            About
          </Link>
          <Link href="/faq" className="hover:text-brand">
            FAQ
          </Link>
          <Link href="/contact" className="hover:text-brand">
            Contact
          </Link>
        </nav>
        <p className="mt-3">VidGrab · For personal use. Respect creators&rsquo; rights.</p>
      </footer>
    </main>
  );
}
