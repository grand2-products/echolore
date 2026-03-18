"use client";

import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadHelpContent } from "@/content/help/load-help";
import { helpTopics } from "@/content/help/manifest";
import { useLocale } from "@/lib/i18n";

export default function HelpPage() {
  const params = useParams();
  const slugSegments = params.slug as string[] | undefined;
  const slug = slugSegments?.[0] ?? helpTopics[0]?.slug ?? "getting-started";
  const locale = useLocale();
  const content = loadHelpContent(locale, slug);

  if (!content) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
        Page not found
      </div>
    );
  }

  return (
    <article className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-a:text-blue-600">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  );
}
