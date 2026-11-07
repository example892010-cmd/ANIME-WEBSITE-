import { NextResponse } from "next/server";
import { createAdminSession, verifyAdminPassword, verifyTelegramBotSecret } from "@/lib/admin-server";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();
function getClientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const clientKey = getClientKey(request);
  const now = Date.now();
  const recent = attempts.get(clientKey);
  if (recent && recent.resetAt > now && recent.count >= 8) {
    return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes and try again." }, { status: 429 });
  }
  if (!recent || recent.resetAt <= now) attempts.set(clientKey, { count: 0, resetAt: now + 15 * 60 * 1000 });
  try {
    const body = await request.json();
    const channel = body?.channel === "telegram" ? "telegram" : "web";
    if (channel === "telegram" && !verifyTelegramBotSecret(request)) {
      return NextResponse.json({ error: "Telegram bot is not authorized." }, { status: 403 });
    }
    const password = String(body?.password || "");
    if (!password || !(await verifyAdminPassword(password))) {
      const current = attempts.get(clientKey) || { count: 0, resetAt: now + 15 * 60 * 1000 };
      current.count += 1;
      attempts.set(clientKey, current);
      return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
    }
    attempts.delete(clientKey);
    const token = createAdminSession(channel);
    const response = NextResponse.json({ success: true, ...(channel === "telegram" ? { token } : {}) });
    if (channel === "web") {
      response.cookies.set("aniflix_admin_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
    }
    return response;
  } catch (error) {
    console.error("Admin login failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Admin login is unavailable." }, { status: 503 });
  }
}
