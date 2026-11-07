# ANIFLIX NETWORK TAMIL

A mobile-friendly anime discovery and streaming interface branded for **ANIFLIX NETWORK TAMIL**. Public visitors can browse without creating an account. Website management is protected by a private admin password and can also be controlled through a private Telegram admin bot.

## Included

- Public browsing with no user login, registration or subscription gate.
- ANIFLIX branding, logo, responsive navigation and mobile bottom navigation.
- Anime discovery, search, detail pages and the existing streaming player.
- A Telegram channel join link: https://t.me/+98iAagsDsjI5NDk1
- My List and watch progress stored locally in each visitor's browser (no account required).
- Protected Admin Settings for adding, editing and deleting anime, posters, descriptions, seasons, episodes, status, genres, audio languages and qualities.
- PocketBase-backed content storage shared by the website and Telegram admin bot.
- Telegram admin bot with owner-ID restriction and password verification.

## Requirements

- Node.js 20 or newer
- A PocketBase server with a PocketBase superuser account
- Python 3.10+ only if you want to run the Telegram admin bot

## Website setup

1. Copy `.env.example` to `.env`.
2. Configure `POCKETBASE_URL`, `PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD`. The PocketBase account must be a superuser, because the app creates its two private/public content collections automatically on the first admin setup.
3. Set `ADMIN_INITIAL_PASSWORD` to `shiyam` for the initial admin password. It is only used to initialize a password hash in PocketBase. Once the first successful admin setup has seeded the hash, remove `ADMIN_INITIAL_PASSWORD` from the hosting environment.
4. Set `ADMIN_SESSION_SECRET` to a unique random secret of at least 32 characters.
5. Set `ADMIN_RECOVERY_CODE` to a unique private recovery code (preferably 32+ random characters). Keep it somewhere safe; it is required by the Forgot Password flow and recovery attempts are rate-limited.
6. Install and run:

```bash
npm ci
npm run dev
```

The public website does not ask visitors to log in. Open `/settings` and enter the admin password only when you need to manage website content.

### Production environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `POCKETBASE_URL` | Yes for admin tools | Server-side PocketBase URL |
| `NEXT_PUBLIC_POCKETBASE_URL` | Recommended | PocketBase URL used by existing user-data features |
| `PB_SUPERUSER_EMAIL` | Yes for admin tools | PocketBase superuser email |
| `PB_SUPERUSER_PASSWORD` | Yes for admin tools | PocketBase superuser password; server-side only |
| `ADMIN_INITIAL_PASSWORD` | First setup only | Set to `shiyam` before the first admin login; remove after hash initialization |
| `ADMIN_SESSION_SECRET` | Yes | HMAC signing key, at least 32 characters |
| `ADMIN_RECOVERY_CODE` | Yes for recovery | Private code used to verify password recovery |
| `TELEGRAM_ADMIN_BOT_SECRET` | Yes for Telegram bot | Shared server-to-bot secret; keep private |
| `REDIS_URL` | No | Optional cache URL |
| `DOMAIN_URL` | No | Public website domain for metadata |

The admin password is hashed with scrypt and stored in the private PocketBase `site_settings` collection. Anime records and uploaded poster files are stored in the public-read / admin-write `site_anime` collection. These collections are created by the server after the PocketBase superuser environment variables are configured.

### Admin password

- Initial password: `shiyam` (set through `ADMIN_INITIAL_PASSWORD` during first setup; it is never embedded in browser JavaScript).
- Change Password verifies the current password before saving a new password. New passwords must be at least 8 characters.
- Forgot Password requires `ADMIN_RECOVERY_CODE` from the hosting environment. It does not reset the password merely because someone clicks a button.
- Admin sessions use an HTTP-only, same-site cookie and expire after 12 hours.

## Telegram admin bot setup

The included bot is a separate private bot process, so it does not slow down the website server.

1. Create a Telegram bot using BotFather and keep its token private.
2. Find your Telegram numeric user ID and set it as `TELEGRAM_ADMIN_ID`.
3. Set these variables in the bot service:

```env
TELEGRAM_BOT_TOKEN=your_botfather_token
TELEGRAM_ADMIN_ID=your_numeric_telegram_user_id
ANIFLIX_SITE_URL=https://your-website-domain
TELEGRAM_ADMIN_BOT_SECRET=the_same_secret_as_the_website
```

4. Install and start the bot:

```bash
cd telegram-admin-bot
pip install -r requirements.txt
python bot.py
```

5. Send `/start` to the bot from the configured owner account and enter the same admin password used on the website.

The bot accepts commands only in a private chat from the configured owner and attempts to delete password messages after receiving them. It supports adding anime (including a poster photo), listing entries, editing fields with JSON, changing status, editing episode data and categories, replacing posters, toggling homepage featuring, deleting entries, changing the admin password after checking the current password, and ending the admin session. It calls the same website API and PocketBase collection as the website Admin Settings panel.

## Seasons / episodes format

In Admin Settings, the Seasons and Episodes box accepts JSON. Example:

```json
[
  {
    "number": 1,
    "title": "Season 1",
    "episodes": [
      {
        "number": 1,
        "title": "Episode 1",
        "url": "https://your-authorized-video-host.example/watch/episode-1",
        "quality": "720p",
        "duration": "24 min"
      }
    ]
  }
]
```

The website stores the episode metadata and supplied watch URL. It does not upload, copy or host video files. Add only media links that you have permission to use.

## Deployment notes

- Deploy the website as a Node.js web service with the environment variables above.
- Deploy `telegram-admin-bot` as a separate long-running Python worker/service, with its four environment variables.
- PocketBase must be hosted on persistent storage and reachable by the website service. Do not use an ephemeral filesystem for the PocketBase database or uploaded posters.
- `ADMIN_INITIAL_PASSWORD`, `ADMIN_SESSION_SECRET`, `ADMIN_RECOVERY_CODE`, `PB_SUPERUSER_PASSWORD` and `TELEGRAM_ADMIN_BOT_SECRET` must never be prefixed with `NEXT_PUBLIC_`.

## Checks

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

The anime streaming providers rely on third-party endpoints and may change independently of this repository. A successful build does not guarantee that an external provider or every third-party stream will always be available.
