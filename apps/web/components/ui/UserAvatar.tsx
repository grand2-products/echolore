"use client";

import Image from "next/image";
import { resolveAvatarSrc } from "@/lib/api/fetch";

interface UserAvatarProps {
  avatarUrl?: string | null;
  name: string;
  size?: number;
}

export function UserAvatar({ avatarUrl, name, size = 28 }: UserAvatarProps) {
  const src = resolveAvatarSrc(avatarUrl);
  if (src) {
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
