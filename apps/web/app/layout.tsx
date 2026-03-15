import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "@livekit/components-styles";
import { DynamicFavicon } from "@/components/DynamicFavicon";
import { appTagline, appTitle } from "@/lib/app-config";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n";
import { QueryProvider } from "@/lib/query-client";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
});

export const metadata: Metadata = {
  title: appTitle,
  description: appTagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <DynamicFavicon />
        <QueryProvider>
          <AuthProvider>
            <I18nProvider>{children}</I18nProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
