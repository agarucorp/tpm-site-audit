"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 40, background: "#22201d", color: "#ece7de" }}>
        <h2>Something went wrong</h2>
        <p>Your audits are saved. Reload to continue.</p>
        <button onClick={reset} style={{ padding: "8px 14px", borderRadius: 8 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
