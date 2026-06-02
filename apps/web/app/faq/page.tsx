import { StaticPage } from "@/components/StaticPage";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Is VidGrab free?",
    a: "Yes. There are no ads and no paywall for normal use. We apply a fair-use hourly limit to keep the service fast for everyone.",
  },
  {
    q: "What quality can I download?",
    a: "Up to 4K on YouTube when the source provides it, and the original quality on Instagram. You can also extract audio only as MP3 or M4A.",
  },
  {
    q: "Why did my download fail?",
    a: "The most common reasons are private or age-restricted content, a removed video, or a temporary source change. Try again in a few minutes.",
  },
  {
    q: "Do you keep my files?",
    a: "No. Downloaded files are stored only long enough for you to grab them and are automatically deleted after 24 hours.",
  },
  {
    q: "Can I download a whole playlist?",
    a: "Not yet. Paste a single video link for now. Playlist support is on the roadmap.",
  },
];

export default function FaqPage() {
  return (
    <StaticPage title="Frequently asked questions">
      {FAQS.map((item) => (
        <div key={item.q}>
          <h2>{item.q}</h2>
          <p>{item.a}</p>
        </div>
      ))}
    </StaticPage>
  );
}
