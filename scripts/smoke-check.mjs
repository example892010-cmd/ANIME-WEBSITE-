import fs from "node:fs";
import path from "node:path";

const required = [
  "src/app/api/admin/login/route.ts",
  "src/app/api/admin/password/route.ts",
  "src/app/api/admin/anime/route.ts",
  "src/app/api/admin/anime/[id]/route.ts",
  "src/app/api/site-anime/route.ts",
  "src/app/settings/page.tsx",
  "src/app/anime-entry/[slug]/page.tsx",
  "src/app/my-list/page.tsx",
  "src/app/profile/page.tsx",
  "src/components/admin/admin-settings.tsx",
  "src/components/telegram-banner.tsx",
  "telegram-admin-bot/bot.py",
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing required implementation file: ${file}`);
}
const navbar = fs.readFileSync("src/components/navbar.tsx", "utf8");
const auth = fs.readFileSync("src/lib/admin-server.ts", "utf8");
const admin = fs.readFileSync("src/components/admin/admin-settings.tsx", "utf8");
const bot = fs.readFileSync("telegram-admin-bot/bot.py", "utf8");
const checks = [
  ["Public navigation contains no user login UI", !/LoginPopoverButton|NavbarAvatar/.test(navbar)],
  ["Admin password is hashed with scrypt", /scrypt\(/.test(auth)],
  ["Admin cookie is HTTP-only", /httpOnly:\s*true/.test(fs.readFileSync("src/app/api/admin/login/route.ts", "utf8"))],
  ["Admin anime APIs require signed sessions", /requestHasAdminSession/.test(fs.readFileSync("src/app/api/admin/anime/route.ts", "utf8"))],
  ["Anime catalogue is public-read", /listRule:\s*""/.test(auth) && /viewRule:\s*""/.test(auth)],
  ["Telegram bot restricts operations to configured owner", /def is_owner/.test(bot) && /TELEGRAM_ADMIN_ID/.test(bot)],
  ["Telegram bot calls shared anime API", /\/api\/admin\/anime/.test(bot)],
  ["Visitors' My List is device-local", /aniflix_my_list/.test(fs.readFileSync("src/app/my-list/page.tsx", "utf8")) && /aniflix_guest_bookmarks/.test(fs.readFileSync("src/hooks/use-get-bookmark.tsx", "utf8"))],
  ["Guest watch progress saves locally without login", /guest-.*episodeNumber|GUEST_BOOKMARKS_KEY/.test(fs.readFileSync("src/hooks/use-get-bookmark.tsx", "utf8"))],
  ["Telegram admin bot only accepts private chat commands", /chat.*type.*private/.test(fs.readFileSync("telegram-admin-bot/bot.py", "utf8"))],
  ["Telegram admin bot attempts to delete password messages", /deleteMessage/.test(fs.readFileSync("telegram-admin-bot/bot.py", "utf8"))],
  ["Telegram bot password change verifies old password through shared API", /oldPassword/.test(fs.readFileSync("telegram-admin-bot/bot.py", "utf8")) && /api\(\"POST\", \"\/api\/admin\/password/.test(fs.readFileSync("telegram-admin-bot/bot.py", "utf8"))],
  ["Existing anime details support guest list management", !/if \(!auth\)/.test(fs.readFileSync("src/app/anime/[slug]/page.tsx", "utf8"))],
  ["Telegram join link is configured", /t\.me\/\+98iAagsDsjI5NDk1/.test(fs.readFileSync("src/components/telegram-banner.tsx", "utf8"))],
  ["Recovery flow requires a private recovery code", /ADMIN_RECOVERY_CODE/.test(auth)],
];
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) process.exitCode = 1;
}
console.log(`\nChecked ${required.length} required paths and ${checks.length} static behavior assertions.`);
