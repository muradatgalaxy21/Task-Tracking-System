// Shared upload configuration and validation helpers.
// Safe to import from both client components and the upload route handler:
// this file has no server-only dependencies.

// The category an upload belongs to. It selects which content-type allowlist
// and size cap the server enforces when issuing the client token.
export type UploadCategory = "avatar" | "chat";

// Avatars are always images and are compressed client-side before upload,
// so the cap is small and only guards against unexpectedly large payloads.
export const AVATAR_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Chat accepts images plus the common document formats a team typically shares.
export const CHAT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
];
export const CHAT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Returns the allowlist and size cap for a given upload category.
// Falls back to the avatar profile (most restrictive) for unknown values.
export function getUploadConstraints(category: UploadCategory) {
  if (category === "chat") {
    return {
      allowedContentTypes: CHAT_ALLOWED_TYPES,
      maximumSizeInBytes: CHAT_MAX_BYTES,
    };
  }
  return {
    allowedContentTypes: AVATAR_ALLOWED_TYPES,
    maximumSizeInBytes: AVATAR_MAX_BYTES,
  };
}

// Client-side guard so users get an immediate, clear error before any network
// round-trip. The server re-enforces the same rules through the issued token,
// so this is a UX convenience and not the security boundary.
export function validateFileForUpload(
  file: File,
  category: UploadCategory
): string | null {
  const { allowedContentTypes, maximumSizeInBytes } =
    getUploadConstraints(category);

  // Reject any MIME type that is not in the category allowlist.
  if (!allowedContentTypes.includes(file.type)) {
    return "This file type is not allowed.";
  }

  // Reject files larger than the category cap, surfacing the limit in MB.
  if (file.size > maximumSizeInBytes) {
    const mb = Math.round(maximumSizeInBytes / (1024 * 1024));
    return `File is too large. Maximum size is ${mb}MB.`;
  }

  return null;
}
