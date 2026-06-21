import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAuth } from "@/lib/rbac";
import { getUploadConstraints, type UploadCategory } from "@/lib/upload";

export const dynamic = "force-dynamic";

/**
 * POST /api/upload
 *
 * Issues a short-lived, constrained client token so the browser can upload the
 * file bytes directly to Vercel Blob. The file never passes through this
 * function, which removes the serverless request body size limit and the
 * timeouts that broke the previous local-disk implementation in production.
 *
 * The same route also receives the upload-completed callback from Vercel once a
 * client upload finishes, which the SDK validates and acknowledges.
 */
export async function POST(req: Request): Promise<NextResponse> {
  // 1. Parse the SDK request body that drives token issuance or completion.
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      // onBeforeGenerateToken is the security boundary. It runs server-side
      // before any token is minted, so authentication and constraints are
      // applied here and cannot be bypassed by the client.
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // 1. Reject unauthenticated callers before a token is generated.
        const { error } = await requireAuth();
        if (error) {
          throw new Error("Unauthorized");
        }

        // 2. Read the upload category the client declared. Default to the
        //    most restrictive (avatar) profile when it is missing or invalid.
        let category: UploadCategory = "avatar";
        if (clientPayload) {
          try {
            const parsed = JSON.parse(clientPayload) as {
              category?: UploadCategory;
            };
            if (parsed.category === "chat" || parsed.category === "avatar") {
              category = parsed.category;
            }
          } catch {
            // Malformed payload falls through to the avatar default.
          }
        }

        // 3. Lock the token to the category allowlist and size cap, and add a
        //    random suffix so concurrent uploads never overwrite each other.
        const { allowedContentTypes, maximumSizeInBytes } =
          getUploadConstraints(category);
        return {
          allowedContentTypes,
          maximumSizeInBytes,
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    // Log the detailed error for server diagnosis (e.g. missing BLOB_READ_WRITE_TOKEN)
    console.error("Vercel Blob Upload Helper Error:", err);
    // handleUpload throws on auth failure, malformed bodies, and constraint
    // violations. Map the auth case to 401 and everything else to 400.
    const message = err instanceof Error ? err.message : "Upload failed";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
