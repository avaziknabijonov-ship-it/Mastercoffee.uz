const CFG = window.SITE;

let lang = localStorage.getItem("mc_lang") || "uz";
let PRODUCTS = [];
let SITE = { categories:[], rent:{ plans:[] }, service:{ items:[] } };
let state = { cat:"all", q:"", sort:"popular" };

const t = key => (window.I18N[lang] && window.I18N[lang][key]) || key;
const tr = obj => !obj ? "" : (obj[lang] || obj.uz || "");
const num = n => n.toLocaleString("ru-RU").replace(/\u00a0/g," ");
const fmt = n => !n ? t("price.ask") : CFG.currency === "USD" ? "$" + num(n) : num(n) + (lang === "uz" ? " so'm" : " сум");
const catName = id => tr((SITE.categories.find(c => c.id === id) || {}).name) || id;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

/* ---------- i18n ---------- */
function applyLang(){
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.title = t("meta.title");
  document.getElementById("metaDesc").content = t("meta.desc");
  document.getElementById("ogTitle").content = t("meta.title");
  document.getElementById("ogDesc").content = t("meta.desc");
  document.querySelectorAll(".lang__btn").forEach(b => b.classList.toggle("is-active", b.dataset.lang === lang));
  applySiteData();
  renderSite();
  render();
  renderCart();
}

function applySiteData(){
  const map = {
    phone: CFG.phone,
    phone2: CFG.phone2,
    email: CFG.email,
    address: tr(CFG.address),
    addressShort: tr(CFG.address),
    hours: tr(CFG.hours),
    telegram: "Telegram: @" + CFG.telegramUser
  };
  document.querySelectorAll("[data-site]").forEach(el => {
    const k = el.dataset.site;
    if(k in map) el.textContent = map[k];
    if(k === "phone" || k === "phoneLink") el.href = "tel:" + CFG.phoneHref;
    if(k === "phone2") el.href = "tel:" + CFG.phone2Href;
    if(k === "email") el.href = "mailto:" + CFG.email;
    if(k === "telegram" || k === "telegramLink") el.href = "https://t.me/" + CFG.telegramUser;
    if(k === "instagram") el.href = CFG.instagram;
  });
}

document.getElementById("lang").addEventListener("click", e => {
  const b = e.target.closest(".lang__btn");
  if(!b || b.dataset.lang === lang) return;
  lang = b.dataset.lang;
  localStorage.setItem("mc_lang", lang);
  applyLang();
});

/* ---------- catalog ---------- */
const grid = document.getElementById("productGrid");
const info = document.getElementById("catalogInfo");
const searchInput = document.getElementById("searchInput");

function visible(){
  let items = PRODUCTS.filter(p => state.cat === "all" || p.cat === state.cat);
  const q = state.q.trim().toLowerCase();
  if(q) items = items.filter(p =>
    (tr(p.name) + " " + tr(p.desc) + " " + (p.brand||"") + " " + (p.sku||"") + " " + catName(p.cat)).toLowerCase().includes(q));
  if(state.sort === "asc") items = [...items].sort((a,b) => (a.price || Infinity) - (b.price || Infinity));
  if(state.sort === "desc") items = [...items].sort((a,b) => b.price - a.price);
  if(state.sort === "name") items = [...items].sort((a,b) => tr(a.name).localeCompare(tr(b.name)));
  return items;
}

function cardHtml(p){
  const badge = tr(p.badge);
  const sale = p.old && p.old > p.price;
  return `
    <article class="card" data-id="${p.id}">
      <div class="card__img" data-open="${p.id}">
        <img src="${p.images[0]}" alt="${esc(tr(p.name))}" loading="lazy">
        ${badge ? `<span class="badge${sale ? " badge--sale" : ""}">${esc(badge)}</span>` : ""}
      </div>
      <div class="card__body">
        <span class="card__cat">${catName(p.cat)}</span>
        <h3 data-open="${p.id}">${esc(tr(p.name))}</h3>
        <p>${esc(tr(p.desc))}</p>
        <span class="stock ${p.stock === "order" ? "stock--order" : ""}">${p.stock === "order" ? t("product.onOrder") : t("product.inStock")}</span>
        <div class="card__foot">
          <span class="price">${fmt(p.price)}${sale ? `<s>${fmt(p.old)}</s>` : ""}</span>
          <button class="add" data-add="${p.id}">${t("product.add")}</button>
        </div>
      </div>
    </article>`;
}

function render(){
  if(!PRODUCTS.length) return;
  const items = visible();
  info.textContent = items.length ? `${items.length} ${t("catalog.found")}${state.q ? ` — "${state.q}"` : ""}` : "";
  grid.innerHTML = items.length
    ? items.map(cardHtml).join("")
    : `<p class="empty">${t("catalog.empty")}</p>`;
}

document.getElementById("tabs").addEventListener("click", e => {
  const tab = e.target.closest(".tab");
  if(!tab) return;
  state.cat = tab.dataset.cat;
  setActiveTab(state.cat);
  render();
});
const setActiveTab = cat => document.querySelectorAll(".tab").forEach(x => x.classList.toggle("is-active", x.dataset.cat === cat));

document.getElementById("sort").addEventListener("change", e => { state.sort = e.target.value; render(); });

document.getElementById("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  state.q = searchInput.value; state.cat = "all";
  setActiveTab("all"); render();
  document.getElementById("catalog").scrollIntoView({ behavior:"smooth" });
});
searchInput.addEventListener("input", () => { if(!searchInput.value){ state.q = ""; render(); } });

document.addEventListener("click", e => {
  const el = e.target.closest("[data-jump]");
  if(!el) return;
  state.cat = el.dataset.jump; state.q = ""; searchInput.value = "";
  setActiveTab(state.cat); render();
  document.getElementById("catnav").classList.remove("is-open");
});

/* ---------- product modal ---------- */
const modal = document.getElementById("productModal");
const modalBox = document.getElementById("modalBox");

function openProduct(id){
  const p = PRODUCTS.find(x => x.id === id);
  if(!p) return;
  const sale = p.old && p.old > p.price;
  const similar = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).slice(0,3);
  modalBox.innerHTML = `
    <button class="modal__close" id="modalClose" aria-label="Close">×</button>
    <div class="modal__grid">
      <div>
        <img class="modal__main" id="modalMain" src="${p.images[0]}" alt="${esc(tr(p.name))}">
        ${p.images.length > 1 ? `<div class="thumbs">${p.images.map((s,i) =>
          `<img class="thumb${i===0?" is-active":""}" data-src="${s}" src="${s}" alt="">`).join("")}</div>` : ""}
      </div>
      <div class="modal__info">
        <span class="card__cat">${catName(p.cat)}</span>
        <h3>${esc(tr(p.name))}</h3>
        <p class="muted">${esc(tr(p.desc))}</p>
        <p class="modal__price">${fmt(p.price)} ${sale ? `<s>${fmt(p.old)}</s>` : ""}</p>
        <span class="stock ${p.stock === "order" ? "stock--order" : ""}">${p.stock === "order" ? t("product.onOrder") : t("product.inStock")}</span>
        <table class="specs">
          <tr><td>${t("product.brand")}</td><td>${esc(p.brand || "—")}</td></tr>
          <tr><td>${t("product.sku")}</td><td>${esc(p.sku || "—")}</td></tr>
          ${(p.specs||[]).map(s => `<tr><td>${esc(tr(s.k))}</td><td>${esc(tr(s.v))}</td></tr>`).join("")}
        </table>
        <div class="modal__actions">
          <button class="btn" data-add="${p.id}">${t("product.add")}</button>
          <a class="btn btn--ghost-dark" href="tel:${CFG.phoneHref}">${CFG.phone}</a>
        </div>
        <a class="modal__link" href="/p/${encodeURIComponent(p.id)}?lang=${lang}">${t("product.page")} →</a>
      </div>
    </div>
    ${similar.length ? `<div class="similar">
      <h4>${t("product.similar")}</h4>
      <div class="similar__row">${similar.map(s => `
        <div class="similar__item" data-open="${s.id}">
          <img src="${s.images[0]}" alt="">
          <span>${esc(tr(s.name))}</span>
          <b>${fmt(s.price)}</b>
        </div>`).join("")}</div>
    </div>` : ""}`;
  modal.classList.add("is-open");
  document.getElementById("overlay").classList.add("is-open");
  document.body.classList.add("no-scroll");
  modal.setAttribute("aria-hidden","false");
  location.hash = "product-" + p.id;
}

function closeProduct(){
  modal.classList.remove("is-open");
  document.getElementById("overlay").classList.remove("is-open");
  document.body.classList.remove("no-scroll");
  modal.setAttribute("aria-hidden","true");
  if(location.hash.startsWith("#product-")) history.replaceState(null,"",location.pathname);
}

document.addEventListener("click", e => {
  const open = e.target.closest("[data-open]");
  const add = e.target.closest("[data-add]");
  const thumb = e.target.closest(".thumb");
  if(add){ addToCart(add.dataset.add); return; }
  if(thumb){
    document.getElementById("modalMain").src = thumb.dataset.src;
    document.querySelectorAll(".thumb").forEach(x => x.classList.toggle("is-active", x === thumb));
    return;
  }
  if(open){ openProduct(open.dataset.open); return; }
  if(e.target.id === "modalClose" || e.target === modal) closeProduct();
});

/* ---------- cart ---------- */
const KEY = "mc_cart";
let cart = JSON.parse(localStorage.getItem(KEY) || "[]");
const cartItemsEl = document.getElementById("cartItems");
const cartCountEl = document.getElementById("cartCount");
const cartTotalEl = document.getElementById("cartTotal");
const drawer = document.getElementById("cartDrawer");
const overlay = document.getElementById("overlay");
const save = () => localStorage.setItem(KEY, JSON.stringify(cart));
const cartTotal = () => cart.reduce((s,i) => s + i.qty * i.price, 0);

function renderCart(){
  cartCountEl.textContent = cart.reduce((s,i) => s + i.qty, 0);
  cartTotalEl.textContent = fmt(cartTotal());
  cartItemsEl.innerHTML = cart.length ? cart.map(i => `
    <div class="citem">
      <img src="${i.img}" alt="">
      <div>
        <h4>${esc(i.name[lang] || i.name.uz)}</h4>
        <span class="csum">${fmt(i.price * i.qty)}</span>
        <div class="qty"><button data-dec="${i.id}">−</button><span>${i.qty}</span><button data-inc="${i.id}">+</button></div>
      </div>
      <button class="rm" data-rm="${i.id}" aria-label="x">×</button>
    </div>`).join("")
    : `<p class="cart-empty">${t("cart.empty")}</p>`;
}

function addToCart(id){
  const p = PRODUCTS.find(x => x.id === id);
  if(!p) return;
  const line = cart.find(i => i.id === id);
  if(line) line.qty++;
  else cart.push({ id:p.id, name:p.name, price:p.price, img:p.images[0], qty:1 });
  save(); renderCart();
  toast(`"${tr(p.name)}" — ${t("product.added")}`);
}

cartItemsEl.addEventListener("click", e => {
  const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"), rm = e.target.closest("[data-rm]");
  if(inc) cart.find(i => i.id === inc.dataset.inc).qty++;
  else if(dec){ const l = cart.find(i => i.id === dec.dataset.dec); l.qty--; if(l.qty < 1) cart = cart.filter(i => i.id !== l.id); }
  else if(rm) cart = cart.filter(i => i.id !== rm.dataset.rm);
  else return;
  save(); renderCart();
});

const openCart = () => { drawer.classList.add("is-open"); overlay.classList.add("is-open"); document.body.classList.add("no-scroll"); drawer.setAttribute("aria-hidden","false"); };
const closeCart = () => { drawer.classList.remove("is-open"); overlay.classList.remove("is-open"); document.body.classList.remove("no-scroll"); drawer.setAttribute("aria-hidden","true"); };
document.getElementById("cartBtn").addEventListener("click", openCart);
document.getElementById("cartClose").addEventListener("click", closeCart);
overlay.addEventListener("click", () => { closeCart(); closeProduct(); });
document.addEventListener("keydown", e => { if(e.key === "Escape"){ closeCart(); closeProduct(); } });

document.getElementById("checkoutBtn").addEventListener("click", () => {
  if(!cart.length){ toast(t("cart.isEmpty")); return; }
  closeCart();
  const list = cart.map(i => `${i.name[lang] || i.name.uz} × ${i.qty}`).join("; ");
  document.getElementById("topicSelect").value = "buy";
  document.querySelector('#leadForm [name="note"]').value = `${t("cart.checkout")}: ${list}. ${t("cart.total")}: ${fmt(cartTotal())}`;
  document.getElementById("formTitle").textContent = t("form.orderTitle");
  document.getElementById("contact").scrollIntoView({ behavior:"smooth" });
});

/* ---------- lead form ---------- */
const form = document.getElementById("leadForm");
const msg = document.getElementById("formMsg");
const submitBtn = document.getElementById("submitBtn");

async function sendLead(payload){
  if(!CFG.leadEndpoint) return false;
  const r = await fetch(CFG.leadEndpoint, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ ...payload, lang, page: location.href })
  });
  return r.ok;
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  if(!d.name.trim() || !d.phone.trim()){
    msg.className = "form-msg err"; msg.textContent = t("form.err"); return;
  }
  submitBtn.disabled = true; submitBtn.textContent = t("form.sending");
  const ok = await sendLead({
    name:d.name, phone:d.phone, company:d.company,
    topic:t("topic." + d.topic), note:d.note,
    cart: cart.length ? cart.map(i => `${i.name.uz} × ${i.qty}`).join("; ") + ` = ${fmt(cartTotal())}` : ""
  }).catch(() => false);
  submitBtn.disabled = false; submitBtn.textContent = t("form.submit");
  if(ok){
    msg.className = "form-msg ok"; msg.textContent = t("form.ok");
    form.reset(); cart = []; save(); renderCart();
  } else {
    msg.className = "form-msg err"; msg.textContent = t("form.fail");
  }
});

document.getElementById("plans").addEventListener("click", e => {
  const btn = e.target.closest("[data-rent]");
  if(!btn) return;
  document.getElementById("topicSelect").value = "rent";
  document.querySelector('#leadForm [name="note"]').value = `${t("rent.title")}: ${btn.dataset.rent}`;
  document.getElementById("formTitle").textContent = t("form.rentTitle");
  document.getElementById("contact").scrollIntoView({ behavior:"smooth" });
});

document.getElementById("serviceCta").addEventListener("click", () => {
  document.getElementById("topicSelect").value = "service";
  document.querySelector('#leadForm [name="note"]').value = lang === "uz" ? "Mashina modeli va nosozlik: " : "Модель машины и неисправность: ";
  document.getElementById("formTitle").textContent = t("form.repairTitle");
  document.getElementById("contact").scrollIntoView({ behavior:"smooth" });
});

/* ---------- ui ---------- */
document.getElementById("burger").addEventListener("click", () => document.getElementById("catnav").classList.toggle("is-open"));

let toastTimer;
function toast(text){
  let el = document.querySelector(".toast");
  if(!el){ el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-show"), 2200);
}

const io = new IntersectionObserver(es => es.forEach(en => {
  if(en.isIntersecting){ en.target.classList.add("is-visible"); io.unobserve(en.target); }
}), { threshold:.12 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

const cio = new IntersectionObserver(es => es.forEach(en => {
  if(!en.isIntersecting) return;
  const el = en.target, target = +el.dataset.count;
  let n = 0;
  const step = () => { n += Math.max(1, Math.ceil(target/30)); el.textContent = n >= target ? target + ("exact" in el.dataset ? "" : "+") : n; if(n < target) requestAnimationFrame(step); };
  step(); cio.unobserve(el);
}), { threshold:.6 });
document.querySelectorAll("[data-since]").forEach(el => { el.dataset.count = new Date().getFullYear() - +el.dataset.since; });
document.querySelectorAll("[data-count]").forEach(c => cio.observe(c));


/* ---------- site sections (admin-editable) ---------- */
function renderSite(){
  const cats = SITE.categories;
  const tile = (href, jump, img, name, desc) => `<a class="cat" href="${href}"${jump ? ` data-jump="${esc(jump)}"` : ""}>
      <img src="${esc(img || "")}" alt="" loading="lazy"><div><h3>${esc(tr(name))}</h3><span>${esc(tr(desc))}</span></div></a>`;
  document.getElementById("catsGrid").innerHTML =
    cats.map(c => tile("#catalog", c.id, c.image, c.name, c.desc)).join("") +
    tile("#rent", "", SITE.rent.image, SITE.rent.title, SITE.rent.desc) +
    tile("#service", "", SITE.service.image, SITE.service.title, SITE.service.desc);
  const links = cats.map(c => `<a href="#catalog" data-jump="${esc(c.id)}">${esc(tr(c.name))}</a>`).join("");
  const nav = document.getElementById("catnav");
  nav.querySelectorAll("[data-jump]").forEach(x => x.remove());
  nav.insertAdjacentHTML("afterbegin", links);
  document.getElementById("footCats").innerHTML = links;
  document.querySelectorAll("#tabs .tab:not([data-cat=all])").forEach(x => x.remove());
  document.getElementById("tabs").insertAdjacentHTML("beforeend",
    cats.map(c => `<button class="tab" data-cat="${esc(c.id)}">${esc(tr(c.name))}</button>`).join(""));
  setActiveTab(state.cat);
  document.getElementById("plans").innerHTML = SITE.rent.plans.map(p => `
    <div class="plan${p.featured ? " plan--featured" : ""}">
      ${p.featured ? `<span class="plan__badge">${t("rent.popular")}</span>` : ""}
      <h3>${esc(tr(p.name))}</h3>
      <p class="plan__price"><span>${esc(p.price || "")}</span> <span>${esc(tr(p.period))}</span></p>
      <ul class="ticks">${(p.features || []).map(f => `<li>${esc(tr(f))}</li>`).join("")}</ul>
      <button class="btn${p.featured ? "" : " btn--ghost-dark"}" data-rent="${esc(tr(p.name))}">${t("rent.cta")}</button>
    </div>`).join("");
  document.getElementById("priceList").innerHTML = SITE.service.items
    .map(it => `<li><span>${esc(tr(it.name))}</span><b>${esc(tr(it.price))}</b></li>`).join("");
  document.getElementById("srvNote").textContent = tr(SITE.service.note);
}

/* ---------- boot ---------- */
Promise.all([fetch("data/products.json").then(r => r.json()), fetch("/api/site").then(r => r.json())])
  .then(([data, site]) => {
    PRODUCTS = data;
    SITE = site;
    applyLang();
    const m = location.hash.match(/^#product-(.+)$/);
    if(m) openProduct(m[1]);
  })
  .catch(() => { applyLang(); grid.innerHTML = `<p class="empty">products.json yuklanmadi</p>`; });
