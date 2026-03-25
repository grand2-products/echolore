"use client";

import Image from "next/image";
import { buildApiUrl } from "@/lib/api/fetch";

function isValidImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("/api/users/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

interface UserAvatarProps {
  avatarUrl?: string | null;
  name: string;
  size?: number;
}

export function UserAvatar({ avatarUrl, name, size = 28 }: UserAvatarProps) {
  if (isValidImageUrl(avatarUrl)) {
    const src = avatarUrl.startsWith("/api/") ? buildApiUrl(avatarUrl) : avatarUrl;
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="rounded-full"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-full bg-blue-600 text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0)}
    </div>
  );
}
