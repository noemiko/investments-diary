import type { Ref } from "react";
import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
  errorRef?: Ref<HTMLParagraphElement>;
}

export function ServerError({ message, errorRef }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p
      ref={errorRef}
      role="alert"
      tabIndex={-1}
      className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300"
    >
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
