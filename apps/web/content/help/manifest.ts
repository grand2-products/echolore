export interface HelpTopic {
  slug: string;
  titleKey: string;
}

export const helpTopics: HelpTopic[] = [
  { slug: "getting-started", titleKey: "help.topics.gettingStarted" },
  { slug: "wiki", titleKey: "help.topics.wiki" },
  { slug: "ai-chat", titleKey: "help.topics.aiChat" },
  { slug: "meetings", titleKey: "help.topics.meetings" },
  { slug: "coworking", titleKey: "help.topics.coworking" },
  { slug: "aituber", titleKey: "help.topics.aituber" },
  { slug: "search", titleKey: "help.topics.search" },
  { slug: "ai-knowledge", titleKey: "help.topics.aiKnowledge" },
];
