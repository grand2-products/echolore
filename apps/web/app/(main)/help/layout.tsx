"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { helpTopics } from "@/content/help/manifest";
import { useT } from "@/lib/i18n";

interface HelpLayoutProps {
  children: React.ReactNode;
}

export default function HelpLayout({ children }: HelpLayoutProps) {
  const pathname = usePathname();
  const t = useT();

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b border-gray-200 bg-white p-4 md:w-56 md:border-b-0 md:border-r md:overflow-y-auto">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t("help.sidebar.title")}
        </h2>
        <nav className="space-y-1">
          {helpTopics.map((topic) => {
            const href = `/help/${topic.slug}`;
            const isActive =
              pathname === href || (pathname === "/help" && topic.slug === helpTopics[0]?.slug);

            return (
              <Link
                key={topic.slug}
                href={href}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {t(topic.titleKey)}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-3xl">{children}</div>
      </div>
    </div>
  );
}
