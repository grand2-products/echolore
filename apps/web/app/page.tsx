export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-3xl font-bold">社内ポータル</h1>
        <p className="text-gray-600">grand2 Products 社内Wiki & ビデオ会議ツール</p>
        
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <a
            href="/wiki"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-blue-500 hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold">📚 社内Wiki</h2>
            <p className="text-gray-600">
              NotionライクなBlock-basedエディタでナレッジを共有
            </p>
          </a>
          
          <a
            href="/meetings"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-blue-500 hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold">🎥 ビデオ会議</h2>
            <p className="text-gray-600">
              Everybody Coworking / Room モードでリアルタイムコミュニケーション
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}
