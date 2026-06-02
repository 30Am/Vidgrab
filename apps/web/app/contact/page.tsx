import { StaticPage } from "@/components/StaticPage";

export default function ContactPage() {
  return (
    <StaticPage title="Contact">
      <p>
        Questions, bug reports, or takedown requests? Email us at{" "}
        <a href="mailto:hello@vidgrab.app">hello@vidgrab.app</a>.
      </p>
      <h2>Takedowns</h2>
      <p>
        We respond to valid takedown requests within 24 hours. Since every file is deleted
        automatically after 24 hours, flagged content is removed immediately on request.
      </p>
    </StaticPage>
  );
}
