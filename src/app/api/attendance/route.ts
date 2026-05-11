import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/attendance - Fetch attendance records
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const user_id = searchParams.get("user_id");

  try {
    const attendance = await prisma.dailyAttendance.findMany({
      where: {
        AND: [
          ...(date ? [{ date: new Date(date) }] : []),
          ...(user_id ? [{ user_id }] : []),
        ]
      },
      orderBy: {
        date: "desc",
      },
      include: {
        user: {
          select: {
            full_name: true,
            email: true,
          }
        }
      }
    });

    return NextResponse.json(attendance);
  } catch (error) {
    console.error("Failed to fetch attendance:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/attendance - Log attendance (handles batch upsert)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Admin can record or update attendance
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  });

  if (user?.role !== "Admin") {
    return NextResponse.json({ error: "Only Admins can log attendance" }, { status: 403 });
  }

  try {
    const body = await req.json();
    
    // Check if it's a batch update (array)
    if (Array.isArray(body)) {
      const records = body;
      
      // We'll do this in a transaction
      await prisma.$transaction(
        records.map((record) => {
          const attendanceDate = new Date(record.date);
          attendanceDate.setHours(0, 0, 0, 0);
          
          return prisma.dailyAttendance.upsert({
            where: {
              user_id_date: {
                user_id: record.user_id,
                date: attendanceDate,
              }
            },
            update: {
              status: record.status,
            },
            create: {
              user_id: record.user_id,
              date: attendanceDate,
              status: record.status,
            },
          });
        })
      );
      
      return NextResponse.json({ success: true });
    }

    // Single record update
    const { status, date, user_id } = body;
    const targetUserId = user_id || session.user.id;

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 });
    }

    const attendanceDate = date ? new Date(date) : new Date();
    attendanceDate.setHours(0, 0, 0, 0);

    const record = await prisma.dailyAttendance.upsert({
      where: {
        user_id_date: {
          user_id: targetUserId,
          date: attendanceDate,
        }
      },
      update: {
        status,
      },
      create: {
        user_id: targetUserId,
        date: attendanceDate,
        status,
      },
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("Failed to log attendance:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
