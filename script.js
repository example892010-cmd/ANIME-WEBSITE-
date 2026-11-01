/*
  ANIFLIX NETWORK TAMIL
  Edit this array to add your own anime entries.
  Use only download URLs for content you own, are authorised to distribute,
  or that is legally available for download.
*/
const animeList = [
  {
    id: 1,
    title: "Your First Anime",
    category: "Action",
    language: "Tamil Dub",
    episodes: "12 Episodes",
    mark: "ア",
    colors: ["#662d91", "#e64e8b"],
    description: "Add a short description of this anime here. Replace this demo entry with your own authorised catalogue information.",
    downloads: [
      { label: "Episode 01 — 720p", url: "https://t.me/your_channel" },
      { label: "Episode 02 — 720p", url: "https://t.me/your_channel" }
    ]
  },
  {
    id: 2,
    title: "Adventure Collection",
    category: "Adventure",
    language: "Tamil Dub",
    episodes: "24 Episodes",
    mark: "旅",
    colors: ["#145b70", "#4e9b9a"],
    description: "A sample catalogue card. Change its title, description, episodes and authorised download links in script.js.",
    downloads: [{ label: "Open download channel", url: "https://t.me/your_channel" }]
  },
  {
    id: 3,
    title: "Fantasy Stories",
    category: "Fantasy",
    language: "Tamil Sub",
    episodes: "Movie",
    mark: "星",
    colors: ["#44317e", "#b45a9e"],
    description: "A sample fantasy entry. Replace this demo text and link with details for content you are allowed to share.",
    downloads: [{ label: "Open download page", url: "https://t.me/your_channel" }]
  },
  {
    id: 4,
    title: "Drama Collection",
    category: "Drama",
    language: "Tamil Dub",
    episodes: "Season 1",
    mark: "夢",
    colors: ["#9b4d39", "#e6a45f"],
    description: "A sample drama entry. Add your own catalogue description here.",
    downloads: [{ label: "Open download channel", url: "https://t.me/your_channel" }]
  }
];

const grid = document.getElementById("anime-grid");
const search = document.getElementById("search");
const empty = document.getElementById("empty-state");
const dialog = document.getElementById("anime-dialog");
let activeCategory = "All";

function renderAnime() {
  const query = search.value.trim().toLowerCase();
  const filtered = animeList.filter(item =>
    (activeCategory === "All" || item.category === activeCategory) &&
    (item.title.toLowerCase().includes(query) || item.category.toLowerCase().includes(query))
  );
  grid.innerHTML = filtered.map(item => `
    <article class="anime-card" data-id="${item.id}" tabindex="0" role="button" aria-label="View ${escapeHtml(item.title)}">
      <div class="poster" data-mark="${escapeHtml(item.mark)}" style="--c1:${item.colors[0]};--c2:${item.colors[1]}">
        <span class="poster-tag">${escapeHtml(item.language.toUpperCase())}</span>
      </div>
      <div class="card-info">
        <h3>${escapeHtml(item.title)}</h3>
        <div class="card-meta"><span>${escapeHtml(item.category)}</span><span>${escapeHtml(item.episodes)}</span></div>
        <div class="card-open">VIEW DOWNLOADS ↗</div>
      </div>
    </article>`).join("");
  document.getElementById("visible-count").textContent = filtered.length;
  document.getElementById("anime-count").textContent = animeList.length;
  empty.hidden = filtered.length !== 0;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}
function openAnime(id) {
  const item = animeList.find(entry => entry.id === Number(id));
  if (!item) return;
  document.getElementById("dialog-title").textContent = item.title;
  document.getElementById("dialog-category").textContent = `${item.category} • ${item.language}`;
  document.getElementById("dialog-description").textContent = item.description;
  document.getElementById("dialog-links").innerHTML = item.downloads.map(link => `
    <a class="download-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
      <span>${escapeHtml(link.label)}</span><span>OPEN ↗</span>
    </a>`).join("");
  dialog.showModal();
}
grid.addEventListener("click", event => {
  const card = event.target.closest(".anime-card");
  if (card) openAnime(card.dataset.id);
});
grid.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".anime-card")) {
    event.preventDefault(); openAnime(event.target.dataset.id);
  }
});
search.addEventListener("input", renderAnime);
document.getElementById("category-filters").addEventListener("click", event => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  document.querySelectorAll(".chip").forEach(chip => chip.classList.toggle("selected", chip === button));
  renderAnime();
});
document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
document.getElementById("year").textContent = new Date().getFullYear();
renderAnime();