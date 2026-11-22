import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Footing · what it checks" };

export default function About() {
  return (
    <main style={{ maxWidth: 760, margin: "3rem auto", fontFamily: "system-ui", padding: "0 1rem", lineHeight: 1.55 }}>
      <h1>What Footing checks</h1>
      <p>
        Footing checks <b>citation faithfulness</b>: whether the page an AI answer cites actually says what the sentence claims. It does not check
        whether the claim is true, and it does not search for better sources.
      </p>
      <h2>How a check runs</h2>
      <ul>
        <li>Each cited page is fetched by a small non-AI proxy on this site (no model runs there) and reduced to readable text.</li>
        <li>
          On a laptop with Gemini Nano 4, Nano triages every readable citation on the device (<code>PREFER_ON_DEVICE</code>). Pages it cannot
          read, PDFs and pages that need JavaScript go to the cloud model; every Nano “supports” goes to the cloud for the final call.
        </li>
        <li>Code then checks that every quote a model returns appears word for word in the text the model was given. A quote that is not there is shown as unverified, never as supported.</li>
        <li>Every verdict carries a badge showing where it was actually decided: <code>ON_DEVICE</code> or <code>IN_CLOUD</code>.</li>
      </ul>
      <h2>What leaves your laptop</h2>
      <p>
        The sentence and the matching source passages are sent to the cloud model whenever a check is decided there. A check Nano settles on its own
        sends no text to the cloud model or to this site. The cited URL is sent to this site&apos;s fetch proxy, which fetches it and keeps no copy of the page.
      </p>
      <h2>If a check fails with a quota or rate-limit message</h2>
      <p>
        The cloud model runs on a free tier shared by everyone using this page. If a citation shows a rate-limit or “high demand” error, wait about a minute
        and tap the citation to confirm it again; the other results stay as they are. Checks run on at most 8 cloud calls per run; the rest wait for a tap.
      </p>
      <h2>If your browser has no Gemini Nano</h2>
      <p>
        The full check still runs in the cloud. The meter under the results says how many citations a Nano laptop would have read on-device first.
        Chrome needs the on-device model downloaded (several GB) and plenty of free disk space (see <a href="https://developer.chrome.com/docs/ai/get-started">Chrome&apos;s requirements</a>); the first check on such a laptop starts that download and shows its progress.
      </p>
      <p><Link href="/">Check an answer</Link> · <Link href="/eval">Measured results</Link></p>
    </main>
  );
}
