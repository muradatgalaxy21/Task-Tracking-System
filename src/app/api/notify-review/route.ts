// -------------------------------------------------------------------
// Email Notification API Route
// Sends a premium, dark-themed email when a task moves to "In Review".
// Uses nodemailer with SMTP credentials from environment variables.
// -------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

interface NotifyRequestBody {
  taskTitle: string;
  assigneeName: string;
  estimatedDays: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: NotifyRequestBody = await request.json();
    const { taskTitle, assigneeName, estimatedDays } = body;

    // Validate required fields
    if (!taskTitle || !assigneeName) {
      return NextResponse.json(
        { error: "Missing required fields: taskTitle, assigneeName" },
        { status: 400 }
      );
    }

    // Create SMTP transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Send the notification email with premium HTML template
    await transporter.sendMail({
      from: `"AI & Beyond Evaluator" <${process.env.SMTP_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `Review Required: ${taskTitle}`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Inter', Arial, sans-serif; background-color: #020617; margin: 0; padding: 0; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #020617; padding: 40px 0; }
        .container { max-width: 600px; background-color: #0a0f1e; margin: 0 auto; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; }
        .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 30px; text-align: center; }
        .logo-text { color: white; font-size: 18px; font-weight: 800; letter-spacing: 1px; margin: 0; text-transform: uppercase; }
        .content { padding: 40px 30px; }
        .status-badge { display: inline-block; padding: 6px 12px; background: rgba(245, 158, 11, 0.1); color: #f59e0b; border-radius: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 20px; }
        h1 { color: white; font-size: 24px; font-weight: 700; margin: 0 0 10px 0; letter-spacing: -0.5px; }
        p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; }
        .task-card { background: rgba(255, 255, 255, 0.03); border-radius: 16px; padding: 20px; border: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 30px; }
        .task-row { margin-bottom: 15px; }
        .task-row:last-child { margin-bottom: 0; }
        .label { color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
        .value { color: #e2e8f0; font-size: 15px; font-weight: 500; }
        .button-container { text-align: center; margin-top: 10px; }
        .button { display: inline-block; padding: 14px 28px; background: #3b82f6; color: white !important; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px; }
        .footer { padding: 0 30px 40px 30px; text-align: center; }
        .footer-text { color: #475569; font-size: 11px; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <p class="logo-text">AI & Beyond Evaluator</p>
            </div>
            <div class="content">
                <div class="status-badge">In Review</div>
                <h1>Review Required</h1>
                <p>Hello Admin, a task has been submitted and is ready for your evaluation. Please review the details below:</p>
                
                <div class="task-card">
                    <div class="task-row">
                        <div class="label">Task Title</div>
                        <div class="value">${taskTitle}</div>
                    </div>
                    <div class="task-row">
                        <div class="label">Submitted By</div>
                        <div class="value">${assigneeName}</div>
                    </div>
                    <div class="task-row">
                        <div class="label">Estimated Days</div>
                        <div class="value">${estimatedDays || "N/A"} Day${estimatedDays !== 1 ? "s" : ""}</div>
                    </div>
                </div>

                <div class="button-container">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" class="button">Open Dashboard</a>
                </div>
            </div>
            <div class="footer">
                <p class="footer-text">
                    This is an automated performance update.<br>
                    Designed for AI & Beyond Team Transparency.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to send notification email:", err);
    return NextResponse.json(
      { error: "Failed to send notification email" },
      { status: 500 }
    );
  }
}
