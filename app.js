let catalogue=[], activeGenre="All", activeSort="featured", searchTerm="", saved=new Set(JSON.parse(localStorage.getItem("aniflix-saved")||"[]")), current=null, savedOnly=false;
const grid=document.getElementById("animeGrid"), count=document.getElementById("resultCount"), empty=document.getElementById("emptyState");
const palettes=[["#42145e","#f04bbd"],["#092d50","#2678ba"],["#521a25","#ef6b3c"],["#1b3c45","#4dc8b1"],["#39205f","#9271ff"],["#533319","#e8a63e"],["#28315d","#d74e94"],["#17483f","#85c95b"]];
const glyphs=["✦","⚔","◈","☄","✧","☯","♜","✺","❖","☾","✹","♢"];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function ratingNum(s){let m=String(s).match(/[\d.]+/);return m?Number(m[0]):0}
function render(){
 let data=catalogue.map((x,i)=>({...x,_i:i})).filter(x=>(activeGenre==="All"||x.genres.some(g=>g.toLowerCase()===activeGenre.toLowerCase()))&&(!searchTerm||(x.title+" "+x.genres.join(" ")).toLowerCase().includes(searchTerm))&&(!savedOnly||saved.has(x.title)));
 if(activeSort==="az")data.sort((a,b)=>a.title.localeCompare(b.title));
 if(activeSort==="rating")data.sort((a,b)=>ratingNum(b.rating)-ratingNum(a.rating));
 count.textContent=`${data.length} TITLES`;
 grid.innerHTML=data.map(x=>{let p=palettes[x._i%palettes.length];return `<article class="anime-card" data-title="${esc(x.title)}"><div class="poster" style="--c1:${p[0]};--c2:${p[1]}"><span class="poster-score">${x.rating==="TBA"?"NEW":"★ "+esc(x.rating)}</span><span class="poster-dub">TAMIL DUB</span><div class="poster-glyph">${glyphs[x._i%glyphs.length]}</div><div class="poster-title">${esc(x.title)}</div><button class="save-mini" data-save="${esc(x.title)}" aria-label="Save ${esc(x.title)}">${saved.has(x.title)?"♥":"♡"}</button></div><div class="card-name">${esc(x.title)}</div><div class="card-genres">${esc(x.genres.slice(0,3).join(" · "))}</div></article>`}).join("");
 empty.hidden=!!data.length; grid.hidden=!data.length;
 document.getElementById("totalCount").textContent=`${catalogue.length} TITLES`;
}
function toast(s){let t=document.getElementById("toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2100)}
function toggleSave(title){if(saved.has(title)){saved.delete(title);toast("Removed from My List")}else{saved.add(title);toast("Added to My List")}localStorage.setItem("aniflix-saved",JSON.stringify([...saved]));render();if(current)openModal(current)}
function openModal(title){current=title;let x=catalogue.find(a=>a.title===title);if(!x)return;document.getElementById("modalTitle").textContent=x.title;document.getElementById("modalRating").textContent=x.rating==="TBA"?"✦ Rating not listed":`★ ${x.rating} / 10`;document.getElementById("modalDesc").textContent=x.description||"Explore this title in the ANIFLIX Tamil Dub collection.";document.getElementById("modalGenres").innerHTML=x.genres.map(g=>`<span>${esc(g)}</span>`).join("");document.getElementById("saveBtn").textContent=(saved.has(title)?"♥ IN MY LIST":"♡ ADD TO MY LIST");document.getElementById("animeModal").classList.add("open");document.getElementById("animeModal").setAttribute("aria-hidden","false")}
function closeModal(){document.getElementById("animeModal").classList.remove("open");document.getElementById("animeModal").setAttribute("aria-hidden","true")}
fetch("catalogue.json").then(r=>r.json()).then(data=>{catalogue=data;render()}).catch(()=>{grid.innerHTML="<p>Could not load catalogue.json. Make sure all project files are in the same folder.</p>"});
document.getElementById("searchInput").addEventListener("input",e=>{searchTerm=e.target.value.trim().toLowerCase();document.getElementById("clearSearch").style.display=searchTerm?"block":"none";render()});
document.getElementById("clearSearch").onclick=()=>{document.getElementById("searchInput").value="";searchTerm="";document.getElementById("clearSearch").style.display="none";render()};
document.getElementById("genreRow").addEventListener("click",e=>{let b=e.target.closest("[data-genre]");if(!b)return;activeGenre=b.dataset.genre;savedOnly=false;document.querySelectorAll(".genre-chip").forEach(x=>x.classList.toggle("active",x===b));render()});
document.querySelector(".tabs").addEventListener("click",e=>{let b=e.target.closest("[data-sort]");if(!b)return;activeSort=b.dataset.sort;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));render()});
grid.addEventListener("click",e=>{let s=e.target.closest("[data-save]");if(s){e.stopPropagation();toggleSave(s.dataset.save);return}let c=e.target.closest("[data-title]");if(c)openModal(c.dataset.title)});
document.getElementById("animeModal").addEventListener("click",e=>{if(e.target.matches("[data-close]"))closeModal()});
document.getElementById("saveBtn").onclick=()=>current&&toggleSave(current);
document.getElementById("exploreBtn").onclick=()=>document.getElementById("catalogue").scrollIntoView({behavior:"smooth"});
document.getElementById("resetBtn").onclick=()=>{activeGenre="All";searchTerm="";savedOnly=false;document.getElementById("searchInput").value="";document.querySelectorAll(".genre-chip").forEach(x=>x.classList.toggle("active",x.dataset.genre==="All"));render()};
document.getElementById("navSearch").onclick=()=>{document.getElementById("searchInput").focus();window.scrollTo({top:document.querySelector(".search-wrap").offsetTop-80,behavior:"smooth"})};
document.getElementById("navSaved").onclick=()=>{savedOnly=!savedOnly;activeGenre="All";searchTerm="";document.getElementById("searchInput").value="";document.querySelectorAll(".genre-chip").forEach(x=>x.classList.toggle("active",x.dataset.genre==="All"));render();document.getElementById("catalogue").scrollIntoView({behavior:"smooth"});toast(savedOnly?"Showing your saved anime":"Showing all anime")};
document.getElementById("profileBtn").onclick=()=>toast("Your list is saved on this device");
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();document.getElementById("searchInput").focus()}});
