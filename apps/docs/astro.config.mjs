import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// GitHub Pages project site: served under /echolore/
export default defineConfig({
  site: "https://grand2-products.github.io",
  base: "/echolore/",
  integrations: [
    starlight({
      title: "EchoLore",
      description: "AI-powered knowledge & meeting platform. Self-hostable with a single command.",
      // Japanese is the root locale (served at /), English under /en/
      locales: {
        root: { label: "日本語", lang: "ja-JP" },
        en: { label: "English", lang: "en" },
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/grand2-products/echolore",
        },
      ],
      // Single sidebar shared across locales — internal slugs omit the locale
      // prefix and resolve per language; group labels translate via `translations`.
      sidebar: [
        {
          label: "はじめに",
          translations: { en: "Getting Started" },
          items: [
            { slug: "index" },
            { slug: "getting-started/requirements" },
            { slug: "getting-started/install" },
            { slug: "getting-started/first-setup" },
          ],
        },
        {
          label: "機能ガイド",
          translations: { en: "Feature Guides" },
          items: [
            { slug: "features/wiki" },
            { slug: "features/meetings" },
            { slug: "features/ai-chat" },
            { slug: "features/mcp-agents" },
          ],
        },
        {
          label: "管理",
          translations: { en: "Administration" },
          items: [{ slug: "admin/console" }, { slug: "admin/agent-tokens" }],
        },
        {
          label: "運用",
          translations: { en: "Operations" },
          items: [
            { slug: "operations/update" },
            { slug: "operations/backup" },
            { slug: "operations/troubleshooting" },
          ],
        },
        {
          label: "開発に参加する",
          translations: { en: "Contributing" },
          items: [{ slug: "development/dev-setup" }, { slug: "development/contributing" }],
        },
      ],
    }),
  ],
});
