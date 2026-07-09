"use client";

/**
 * Top-level error boundary. Catches errors in the root layout. Shows a friendly
 * page — never a raw stack trace.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#3f3a31",
          color: "#f4efe6",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#c9c2b7", fontSize: 14, marginBottom: 20 }}>
            Aria hit an unexpected error. Your data is safe. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#9340ff",
              color: "white",
              border: 0,
              borderRadius: 8,
              padding: "8px 18px",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 12, color: "#a89f91" }}>
              Ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
