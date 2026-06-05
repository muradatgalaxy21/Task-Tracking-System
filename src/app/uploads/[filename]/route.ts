import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    // 1. Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    
    // 2. Resolve safe path inside the root uploads folder
    const filePath = path.join(process.cwd(), "uploads", safeFilename);

    // 3. Read the file buffer from the filesystem
    const fileBuffer = await readFile(filePath);
    
    // 4. Map file extension to appropriate MIME content type
    const ext = path.extname(safeFilename).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".svg") contentType = "image/svg+xml";
    else if (ext === ".webp") contentType = "image/webp";

    // 5. Return HTTP response with file contents and content headers
    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    // 1. Capture file read error
    // 2. Return 404 response
    return new Response("File not found", { status: 404 });
  }
}
