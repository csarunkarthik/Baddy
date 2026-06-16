"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";

/** Route-level error boundary — branded dark "something went wrong" card with retry. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="app-bg flex items-center justify-center min-h-screen px-4">
      <Card className="max-w-sm w-full text-center" padding="lg">
        <div className="w-12 h-12 rounded-2xl bg-danger/15 text-danger flex items-center justify-center mx-auto mb-4">
          <TriangleAlert size={24} />
        </div>
        <h1 className="text-lg font-bold text-text">Something went wrong</h1>
        <p className="text-sm text-muted mt-1.5">
          An unexpected error occurred. You can try again.
        </p>
        <Button onClick={reset} className="mt-5 w-full">
          Retry
        </Button>
      </Card>
    </div>
  );
}
