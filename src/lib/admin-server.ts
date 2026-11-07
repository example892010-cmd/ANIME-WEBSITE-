import PocketBase from "pocketbase";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function getAdminPocketBase() {
  if (!PB_URL) throw new Error("PocketBase is not configured. Set POCKETBASE_URL.");
  const email = requiredEnv("PB_SUPERUSER_EMAIL");
  const password = requiredEnv("PB_SUPERUSER_PASSWORD");
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("_superusers").authWithPassword(email, password);
  await ensureAdminCollections(pb);
  await ensureInitialAdminPassword(pb);
  return pb;
}

async function ensureAdminCollections(pb: PocketBase) {
  const existing = await pb.collections.getFullList();
  const names = new Set(existing.map((collection) => collection.name));
  if (!names.has("site_anime")) {
    await pb.collections.create({
      name: "site_anime",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true, min: 1, max: 180 },
        { name: "slug", type: "text", required: true, min: 1, max: 180 },
        { name: "description", type: "text", required: false, max: 10000 },
        { name: "poster", type: "file", required: false, maxSelect: 1, maxSize: 5242880, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
        { name: "posterUrl", type: "url", required: false },
        { name: "bannerUrl", type: "url", required: false },
        { name: "status", type: "text", required: false, max: 40 },
        { name: "genres", type: "json", required: false, maxSize: 200000 },
        { name: "audioLanguages", type: "json", required: false, maxSize: 200000 },
        { name: "qualities", type: "json", required: false, maxSize: 200000 },
        { name: "seasons", type: "json", required: false, maxSize: 2000000 },
        { name: "featured", type: "bool", required: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_site_anime_slug ON site_anime (slug)"],
      listRule: "",
      viewRule: "",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    } as any);
  }
  if (!names.has("site_settings")) {
    await pb.collections.create({
      name: "site_settings",
      type: "base",
      fields: [
        { name: "key", type: "text", required: true, min: 1, max: 120 },
        { name: "value", type: "text", required: true, max: 1000 },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_site_settings_key ON site_settings (key)"],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    } as any);
  }
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(digest, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

async function getSetting(pb: PocketBase, key: string) {
  try {
    return await pb.collection("site_settings").getFirstListItem(`key="${key}"`);
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function writeSetting(pb: PocketBase, key: string, value: string) {
  const existing = await getSetting(pb, key);
  if (existing) return pb.collection("site_settings").update(existing.id, { value });
  return pb.collection("site_settings").create({ key, value });
}

async function ensureInitialAdminPassword(pb: PocketBase) {
  const current = await getSetting(pb, "admin_password_hash");
  if (current) return;
  const initialPassword = requiredEnv("ADMIN_INITIAL_PASSWORD");
  if (initialPassword.length < 6) throw new Error("ADMIN_INITIAL_PASSWORD must contain at least 6 characters for the initial setup.");
  await writeSetting(pb, "admin_password_hash", await hashPassword(initialPassword));
}

export async function verifyAdminPassword(password: string) {
  const pb = await getAdminPocketBase();
  const record = await getSetting(pb, "admin_password_hash");
  if (!record || !(await verifyPassword(password, record.value))) return false;
  return true;
}

export async function updateAdminPassword(password: string) {
  if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
  const pb = await getAdminPocketBase();
  await writeSetting(pb, "admin_password_hash", await hashPassword(password));
}

export async function verifyRecoveryCode(code: string) {
  const configured = process.env.ADMIN_RECOVERY_CODE;
  if (!configured || !code) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(code);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionSecret() {
  const secret = requiredEnv("ADMIN_SESSION_SECRET");
  if (secret.length < 32) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createAdminSession(channel: "web" | "telegram" = "web") {
  const payload = Buffer.from(JSON.stringify({ sub: "aniflix-admin", channel, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.sub === "aniflix-admin" && Number(decoded.exp) > Date.now();
  } catch {
    return false;
  }
}

export function requestHasAdminSession(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const cookie = request.headers.get("cookie") || "";
  const cookieToken = cookie.match(/(?:^|;\s*)aniflix_admin_session=([^;]+)/)?.[1] || "";
  try {
    return Boolean((bearer && verifyToken(bearer)) || (cookieToken && verifyToken(decodeURIComponent(cookieToken))));
  } catch {
    return false;
  }
}

export function verifyTelegramBotSecret(request: Request) {
  const configured = process.env.TELEGRAM_ADMIN_BOT_SECRET;
  const supplied = request.headers.get("x-aniflix-bot-secret") || "";
  if (!configured || !supplied) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function toPublicAnime(record: any) {
  const pbUrl = PB_URL || "";
  const uploadedPoster = record.poster
    ? `${pbUrl}/api/files/${record.collectionName || "site_anime"}/${record.id}/${encodeURIComponent(record.poster)}`
    : "";
  const poster = record.posterUrl || uploadedPoster;
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    description: record.description || "",
    poster,
    posterUrl: record.posterUrl || "",
    banner: record.bannerUrl || poster,
    status: record.status || "ONGOING",
    genres: Array.isArray(record.genres) ? record.genres : [],
    audioLanguages: Array.isArray(record.audioLanguages) ? record.audioLanguages : ["Tamil"],
    qualities: Array.isArray(record.qualities) ? record.qualities : ["480p", "720p", "1080p"],
    seasons: Array.isArray(record.seasons) ? record.seasons : [],
    featured: Boolean(record.featured),
    created: record.created,
    updated: record.updated,
  };
}

export function normalizeAnimePayload(input: Record<string, any>) {
  const title = String(input.title || "").trim();
  const generatedSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = String(input.slug || generatedSlug || `anime-${Date.now()}`).trim();
  if (!title || !slug) throw new Error("Anime title and slug are required.");
  const readArray = (value: unknown, fallback: unknown[] = []) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) {
      try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : fallback; }
      catch { return value.split(",").map((part) => part.trim()).filter(Boolean); }
    }
    return fallback;
  };
  let seasons = readArray(input.seasons, []);
  if (typeof input.seasons === "string" && input.seasons.trim()) {
    try { seasons = JSON.parse(input.seasons); }
    catch { throw new Error("Seasons must be valid JSON."); }
  }
  if (!Array.isArray(seasons)) throw new Error("Seasons must be a JSON array.");
  return {
    title,
    slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    description: String(input.description || "").trim(),
    posterUrl: String(input.posterUrl || "").trim(),
    bannerUrl: String(input.bannerUrl || "").trim(),
    status: String(input.status || "ONGOING").trim().toUpperCase(),
    genres: readArray(input.genres, []),
    audioLanguages: readArray(input.audioLanguages, ["Tamil"]),
    qualities: readArray(input.qualities, ["480p", "720p", "1080p"]),
    seasons,
    featured: input.featured === true || input.featured === "true" || input.featured === "on",
  };
}
