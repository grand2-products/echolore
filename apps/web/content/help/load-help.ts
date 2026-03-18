import type { SupportedLocale } from "@/lib/i18n";

// Static imports — bundled at build time as raw strings
import enAiChat from "./en/ai-chat.md";
import enAiKnowledge from "./en/ai-knowledge.md";
import enAituber from "./en/aituber.md";
import enCoworking from "./en/coworking.md";
import enGettingStarted from "./en/getting-started.md";
import enMeetings from "./en/meetings.md";
import enSearch from "./en/search.md";
import enWiki from "./en/wiki.md";
import jaAiChat from "./ja/ai-chat.md";
import jaAiKnowledge from "./ja/ai-knowledge.md";
import jaAituber from "./ja/aituber.md";
import jaCoworking from "./ja/coworking.md";
import jaGettingStarted from "./ja/getting-started.md";
import jaMeetings from "./ja/meetings.md";
import jaSearch from "./ja/search.md";
import jaWiki from "./ja/wiki.md";

const content: Record<string, string> = {
  "ja/getting-started": jaGettingStarted,
  "ja/wiki": jaWiki,
  "ja/ai-chat": jaAiChat,
  "ja/meetings": jaMeetings,
  "ja/coworking": jaCoworking,
  "ja/aituber": jaAituber,
  "ja/search": jaSearch,
  "ja/ai-knowledge": jaAiKnowledge,
  "en/getting-started": enGettingStarted,
  "en/wiki": enWiki,
  "en/ai-chat": enAiChat,
  "en/meetings": enMeetings,
  "en/coworking": enCoworking,
  "en/aituber": enAituber,
  "en/search": enSearch,
  "en/ai-knowledge": enAiKnowledge,
};

export function loadHelpContent(locale: SupportedLocale, slug: string): string {
  return content[`${locale}/${slug}`] ?? content[`ja/${slug}`] ?? "";
}
