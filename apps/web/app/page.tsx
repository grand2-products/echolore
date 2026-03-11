import { appTagline, appTitle } from "@/lib/app-config";

export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-3xl font-bold">{appTitle}</h1>
        <p className="text-gray-600">{appTagline}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <a
            href="/wiki"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-blue-500 hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold">Wiki</h2>
            <p className="text-gray-600">Block-based editor for internal documentation.</p>
          </a>

          <a
            href="/meetings"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-blue-500 hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold">Meetings</h2>
            <p className="text-gray-600">Realtime meetings with notes, transcripts, and summaries.</p>
          </a>
        </div>
      </div>
    </main>
  );
}
