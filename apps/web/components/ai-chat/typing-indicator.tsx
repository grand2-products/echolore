"use client";

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl bg-gray-100 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-400" />
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-400"
            style={{ animationDelay: "0.2s" }}
          />
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-400"
            style={{ animationDelay: "0.4s" }}
          />
        </div>
      </div>
    </div>
  );
}
