"use client";

import React from "react";

interface UserAvatarProps {
  fullName?: string | null;
  image?: string | null;
  size?: number; // size in pixels (both width and height)
  className?: string; // custom classes to merge
}

/**
 * UserAvatar Component
 * 1. Extract initials from full name or default to "?"
 * 2. If profile photo exists, render img element with object-cover
 * 3. Else render fallback div with background color and initials
 */
export default function UserAvatar({
  fullName,
  image,
  size = 24,
  className = "",
}: UserAvatarProps) {
  // 1. Extract initials from the name
  const initials = fullName
    ? fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  // 2. If profile photo exists, render img element
  if (image) {
    return (
      <img
        src={image}
        alt={fullName || "User avatar"}
        width={size}
        height={size}
        style={{ width: `${size}px`, height: `${size}px` }}
        className={`rounded-md object-cover shrink-0 select-none ${className}`}
      />
    );
  }

  // 3. Fallback: render initials text
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.max(8, size * 0.38)}px`,
      }}
      className={`rounded-md bg-warm-400/15 flex items-center justify-center shrink-0 font-bold text-warm-400 select-none ${className}`}
    >
      {initials}
    </div>
  );
}
