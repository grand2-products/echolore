"use client";

import { Header, Sidebar } from "@/components/layout";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  // Mock user data - in production, this would come from authentication
  const user = {
    name: "テストユーザー",
    email: "test@grand2-products.com",
    avatarUrl: undefined,
  };

  return (
    <div className="flex h-screen flex-col">
      <Header user={user} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
