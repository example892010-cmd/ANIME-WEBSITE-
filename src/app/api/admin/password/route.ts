import { NextResponse } from "next/server";
import { requestHasAdminSession, updateAdminPassword, verifyAdminPassword, verifyRecoveryCode } from "@/lib/admin-server";

export const runtime = "nodejs";

const recoveryAttempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "change");
    const newPassword = String(body?.newPassword || "");
    const confirmPassword = String(body?.confirmPassword || "");
    if (newPassword.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    if (newPassword !== confirmPassword) return NextResponse.json({ error: "New passwords do not match." }, { status: 400 });

    if (action === "recover") {
      const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const now = Date.now();
      const recent = recoveryAttempts.get(clientKey);
      if (recent && recent.resetAt > now && recent.count >= 5) {
        return NextResponse.json({ error: "Too many recovery attempts. Please try again later." }, { status: 429 });
      }
      if (!recent || recent.resetAt <= now) recoveryAttempts.set(clientKey, { count: 0, resetAt: now + 30 * 60 * 1000 });
      if (!(await verifyRecoveryCode(String(body?.recoveryCode || "")))) {
        const current = recoveryAttempts.get(clientKey) || { count: 0, resetAt: now + 30 * 60 * 1000 };
        current.count += 1;
        recoveryAttempts.set(clientKey, current);
        return NextResponse.json({ error: "Recovery code verification failed." }, { status: 401 });
      }
      recoveryAttempts.delete(clientKey);
    } else {
      if (!requestHasAdminSession(request)) return NextResponse.json({ error: "Admin session expired. Please sign in again." }, { status: 401 });
      if (!(await verifyAdminPassword(String(body?.oldPassword || "")))) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
      }
    }

    await updateAdminPassword(newPassword);
    const response = NextResponse.json({ success: true, message: "Admin password updated." });
    if (action === "recover") response.cookies.set("aniflix_admin_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("Admin password update failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Password update failed." }, { status: 503 });
  }
}
