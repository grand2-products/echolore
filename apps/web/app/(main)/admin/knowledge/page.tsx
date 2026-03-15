"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminKnowledgeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/knowledge");
  }, [router]);
  return null;
}
