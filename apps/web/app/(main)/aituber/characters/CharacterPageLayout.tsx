"use client";

import Link from "next/link";

interface CharacterPageLayoutProps {
  title: string;
  error: string | null;
  message: string | null;
  narrow?: boolean;
  children: React.ReactNode;
}

export function CharacterPageLayout({
  title,
  error,
  message,
  narrow,
  children,
}: CharacterPageLayoutProps) {
  return (
    <div className={narrow ? "mx-auto max-w-3xl p-8" : "p-8"}>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/aituber/characters" className="text-gray-400 hover:text-gray-600">
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <title>Back</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-600">{message}</p>}

      {children}
    </div>
  );
}
