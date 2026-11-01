# ANIFLIX NETWORK TAMIL

A responsive, static anime catalogue website. This version is download-link only; it does not stream or host video files.

## Files
- `index.html` — page structure
- `style.css` — responsive dark anime-inspired design
- `script.js` — catalogue entries, search, category filters and download links

## Add your anime entries
Open `script.js` and edit the `animeList` array. Each entry supports:
- `title`, `category`, `language`, `episodes`
- `mark` and `colors` for the poster-style artwork
- `description`
- `downloads`: an array of `{ label, url }` objects

Replace the sample `https://t.me/your_channel` URLs with links you are authorised to share. Only list content you own, have permission to distribute, or that is legally available for download.

## Preview
Open `index.html` in a browser. No build step or server is required.

## Deploy
Upload the three website files (`index.html`, `style.css`, `script.js`) to your static hosting provider, or connect this repository if the provider supports Git deployment. Set the site root to the folder containing `index.html`.
