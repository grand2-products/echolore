import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "@livekit/components-styles";
import { QueryProvider } from "@/lib/query-client";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
});

export const metadata: Metadata = {
  title: "社内ポータル | grand2 Products",
  description: "社内Wiki & ビデオ会議ツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
