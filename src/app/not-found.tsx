import Link from "next/link";

// A workpaper with no entry: the 404 keeps the product's look and points back to the real pages.
export default function NotFound() {
  return (
    <main style={{ maxWidth: 680, margin: "12vh auto", padding: "0 20px" }}>
      <p className="data" style={{ color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase" }}>Workpaper · no entry</p>
      <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 900, fontSize: 44, lineHeight: 1.08, margin: "10px 0 16px" }}>
        Nothing is filed at this address.
      </h1>
      <p style={{ fontSize: 18, lineHeight: 1.55, margin: "0 0 22px" }}>
        The page you asked for does not exist. Footing checks that each link cited in an AI answer says what the sentence claims; start from one of these.
      </p>
      <p style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", fontSize: 17 }}>
        <Link href="/">Check an answer</Link>
        <a href="/about">What it checks</a>
        <a href="/pitch">Pitch deck</a>
        <Link href="/eval">Measured results</Link>
      </p>
    </main>
  );
}
