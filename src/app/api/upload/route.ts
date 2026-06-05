import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/upload - Handle file upload and store locally
 * 1. Receive multipart form data containing a file
 * 2. Extract and validate file presence
 * 3. Create absolute directory path for public/uploads
 * 4. Write file buffer to local disk with unique filename
 * 5. Return public asset URL path and metadata
 */
export async function POST(req: Request) {
  try {
    // 1. Receive multipart form data containing the file
    const formData = await req.formData();
    const file = formData.get("file") as File;

    // 2. Validate file presence
    if (!file) {
      return NextResponse.json(
        { error: "No file was selected for upload" },
        { status: 400 }
      );
    }

    // 3. Convert file contents to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 4. Resolve absolute directory path inside uploads/ directory in the project root
    const uploadDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });

    // 5. Generate a unique safe filename and full local path
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueFileName = `${randomUUID()}-${safeName}`;
    const destinationPath = path.join(uploadDir, uniqueFileName);

    // 6. Write file buffer to the file system
    await writeFile(destinationPath, buffer);

    // 7. Generate public access URL
    const relativeUrl = `/uploads/${uniqueFileName}`;

    return NextResponse.json({
      url: relativeUrl,
      name: file.name,
      type: file.type,
    });
  } catch (err) {
    console.error("FILE_UPLOAD_ERROR", err);
    return NextResponse.json(
      { error: "Failed to upload file. Please try again." },
      { status: 500 }
    );
  }
}
