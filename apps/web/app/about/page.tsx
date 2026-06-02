import { StaticPage } from "@/components/StaticPage";

export default function AboutPage() {
  return (
    <StaticPage title="About VidGrab">
      <p>
        VidGrab is a fast, ad-free way to download videos from YouTube and Instagram. We
        built it because every other downloader is buried in popups, fake download buttons,
        and trackers. There&rsquo;s none of that here.
      </p>
      <h2>How it works</h2>
      <p>
        You paste a link, we read the available formats, and you pick one. We download the
        file on our servers, hand you a private link, and delete the file after 24 hours.
        We never store your video permanently.
      </p>
    </StaticPage>
  );
}
