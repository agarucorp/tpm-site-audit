"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="panel error-page" data-testid="error-page">
      <h2>Something went wrong loading this page</h2>
      <p className="muted">Your audits are saved. Try again, or go back to the board.</p>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="btn">
          Back to board
        </Link>
      </div>
    </div>
  );
}
