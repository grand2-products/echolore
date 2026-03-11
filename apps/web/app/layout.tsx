import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "@livekit/components-styles";
import { appTagline, appTitle } from "@/lib/app-config";
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
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
