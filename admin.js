let CATS = {}, SITE = null, siteDirty = false;
let PW = sessionStorage.getItem("mc_admin") || "";
let items = [], cur = -1, dirty = false;
let WEB = { q:"", results:[], page:null, msg:"" };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const api = (url, opts = {}) => fetch(url, { ...opts, headers:{ ...(opts.headers||{}), "X-Admin-Password": PW } });

async function login(pw){
  PW = pw;
  const r = await api("/api/admin/login", { method:"POST" });
  if(!r.ok){ PW = ""; sessionStorage.removeItem("mc_admin"); return r.status === 503 ? "Serverda ADMIN_PASSWORD sozlanmagan" : "Parol noto'g'ri"; }
  sessionStorage.setItem("mc_admin", PW);
  $("loginView").hidden = true; $("appView").hidden = false;
  items = await (await fetch("/api/products", { cache:"no-store" })).json();
  await loadSite();
  renderList();
  return "";
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginMsg").textContent = await login($("pw").value);
});
$("logout").onclick = () => { sessionStorage.removeItem("mc_admin"); location.reload(); };

document.querySelectorAll("[data-tab]").forEach(b => b.onclick = async () => {
  document.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("on", x === b));
  $("productsTab").hidden = b.dataset.tab !== "products";
  $("leadsTab").hidden = b.dataset.tab !== "leads";
  const sec = ["cats", "rent", "srv"].includes(b.dataset.tab) ? b.dataset.tab : "";
  $("siteTab").hidden = !sec;
  document.querySelectorAll("[data-sec]").forEach(p => { p.hidden = p.dataset.sec !== sec; });
  if(sec) renderSite();
  if(b.dataset.tab === "leads") loadLeads();
});

async function loadLeads(){
  const r = await api("/api/admin/leads");
  const rows = r.ok ? await r.json() : [];
  $("leads").innerHTML = rows.length ? rows.map(l => `<tr><td>${esc(l.name)}<br><small>${esc(l.company)}</small></td>
    <td><a href="tel:${esc(l.phone)}">${esc(l.phone)}</a></td><td>${esc(l.topic)}</td><td>${esc(l.note)}<br><small>${esc(l.cart)}</small></td></tr>`).join("")
    : `<tr><td colspan="4">Hali arizalar yo'q</td></tr>`;
}

function setDirty(v){ dirty = v; $("saveMsg").className = "msg" + (v ? " err" : ""); $("saveMsg").textContent = v ? "Saqlanmagan o'zgarishlar bor" : ""; }

function renderList(){
  const q = $("q").value.toLowerCase();
  $("list").innerHTML = items.map((p,i) => ({ p, i }))
    .filter(({p}) => !q || JSON.stringify(p.name).toLowerCase().includes(q) || (p.sku||"").toLowerCase().includes(q))
    .map(({p,i}) => `<div class="item${i===cur?" on":""}" data-i="${i}">
      <img src="${esc((p.images||[])[0]||"")}" alt=""><div><b>${esc(p.name?.uz||p.id)}</b>
      <small>${esc(CATS[p.cat]||p.cat)} · ${p.price ? "$"+p.price : "narx so'rov"}</small></div></div>`).join("");
}
$("q").oninput = renderList;
$("list").onclick = e => { const it = e.target.closest(".item"); if(it){ cur = +it.dataset.i; WEB = { q:"", results:[], page:null, msg:"" }; renderList(); renderEditor(); } };

$("addBtn").onclick = () => {
  items.unshift({ id:"new-" + Date.now().toString(36), cat:"machines", sku:"", brand:"", price:0, old:0, badge:null, stock:"in",
    name:{uz:"Yangi mahsulot",ru:"Новый товар"}, desc:{uz:"",ru:""}, specs:[], images:[] });
  cur = 0; WEB = { q:"", results:[], page:null, msg:"" }; setDirty(true); renderList(); renderEditor();
};

const specsToText = specs => (specs||[]).map(s => [s.k?.uz, s.k?.ru, s.v?.uz, s.v?.ru].map(x => x||"").join(" | ")).join("\n");
const textToSpecs = txt => txt.split("\n").map(l => l.split("|").map(x => x.trim())).filter(a => a[0])
  .map(([ku,kr,vu,vr]) => ({ k:{uz:ku, ru:kr||ku}, v:{uz:vu||"", ru:vr||vu||""} }));

function renderEditor(){
  const p = items[cur];
  if(!p){ $("editor").innerHTML = `<p class="hint">Chapdan mahsulot tanlang.</p>`; return; }
  const f = (label, key, val, type="text") => `<div><label>${label}</label><input data-k="${key}" type="${type}" value="${esc(val)}"></div>`;
  $("editor").innerHTML = `
    <div class="row3">
      ${f("ID (URL: /p/ID)", "id", p.id)}
      <div><label>Kategoriya</label><select data-k="cat">${Object.entries(CATS).map(([k,v]) => `<option value="${k}"${p.cat===k?" selected":""}>${v}</option>`).join("")}</select></div>
      <div><label>Holati</label><select data-k="stock"><option value="in"${p.stock!=="order"?" selected":""}>Mavjud</option><option value="order"${p.stock==="order"?" selected":""}>Buyurtma asosida</option></select></div>
    </div>
    <div class="row">${f("Nomi (UZ)", "name.uz", p.name?.uz)}${f("Название (RU)", "name.ru", p.name?.ru)}</div>
    <div class="row">
      <div><label>Tavsif (UZ)</label><textarea data-k="desc.uz">${esc(p.desc?.uz)}</textarea></div>
      <div><label>Описание (RU)</label><textarea data-k="desc.ru">${esc(p.desc?.ru)}</textarea></div>
    </div>
    <div class="row3">${f("Narx, $ (0 = narxini so'rang)", "price", p.price||0, "number")}${f("Eski narx, $ (chegirma)", "old", p.old||0, "number")}${f("Brend", "brand", p.brand)}</div>
    <div class="row3">${f("Artikul (SKU)", "sku", p.sku)}${f("Yorliq (UZ), masalan Hit", "badge.uz", p.badge?.uz)}${f("Метка (RU)", "badge.ru", p.badge?.ru)}</div>
    <label>Xususiyatlar — har qatorda: Kalit UZ | Ключ RU | Qiymat UZ | Значение RU</label>
    <textarea data-k="specs" style="min-height:120px">${esc(specsToText(p.specs))}</textarea>
    <details class="web" ${WEB.results.length || WEB.page ? "open" : ""}>
      <summary>Internetdan qidirish (rasm, tavsif, xususiyatlar)</summary>
      <div style="display:flex;gap:.5rem"><input id="wq" value="${esc(WEB.q || [p.brand, p.name?.ru || p.name?.uz].filter(Boolean).join(" "))}" placeholder="Model nomi, masalan Dr.Coffee F11"><button id="wgo">Qidirish</button></div>
      <div style="display:flex;gap:.5rem;margin-top:.4rem"><input id="wurl" placeholder="yoki tovar sahifasi havolasi: https://..."><button class="ghost" id="wurlGo">Ma'lumotni olish</button></div>
      <p class="hint" id="wmsg">${esc(WEB.msg)}</p>
      ${webPageHtml(p)}
      <div class="wres">${WEB.results.map((r,i) => `<div class="wcard">
        <img src="${esc(r.thumb || r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <small title="${esc(r.title)}">${esc(r.title)}</small><small class="dom">${esc(r.domain)}${r.w ? ` · ${r.w}×${r.h}` : ""}</small>
        <div><button data-wimg="${i}">+ Rasm</button>${r.page ? `<button class="ghost" data-wpage="${i}">Ma'lumot</button>` : ""}</div>
      </div>`).join("")}</div>
    </details>
    <label>Rasmlar (birinchisi asosiy)</label>
    <div class="imgs" id="imgs">${(p.images||[]).map((src,i) => `<div><img src="${esc(src)}" alt=""><button data-rm="${i}" title="O'chirish">×</button></div>`).join("")}</div>
    <div class="bar">
      <label class="btn" style="margin:0;color:#fff">Rasm yuklash<input type="file" id="upload" accept="image/*" multiple hidden></label>
      <button class="ghost" id="addUrl">Rasm havolasi qo'shish</button>
    </div>
    <div class="bar">
      <button class="ghost" id="up">↑ Yuqoriga</button><button class="ghost" id="down">↓ Pastga</button>
      <a class="btn" style="background:#e9ddd2;color:#2a1a10;text-decoration:none" href="/p/${encodeURIComponent(p.id)}" target="_blank">Sahifani ko'rish ↗</a>
      <span class="sp" style="flex:1"></span><button class="danger" id="del">O'chirish</button>
    </div>`;

  $("editor").querySelectorAll("[data-k]").forEach(el => el.oninput = () => {
    const k = el.dataset.k;
    if(k === "specs") p.specs = textToSpecs(el.value);
    else if(k === "price" || k === "old") p[k] = Math.max(0, Number(el.value) || 0);
    else if(k.includes(".")){
      const [a,b] = k.split(".");
      p[a] = p[a] || {};
      p[a][b] = el.value;
      if(a === "badge" && !p.badge.uz && !p.badge.ru) p.badge = null;
    } else p[k] = el.value.trim();
    setDirty(true); renderList();
  });
  $("imgs").onclick = e => { const b = e.target.closest("[data-rm]"); if(b){ p.images.splice(+b.dataset.rm,1); setDirty(true); renderEditor(); renderList(); } };
  $("addUrl").onclick = () => { const u = prompt("Rasm havolasi (https://...)"); if(u){ (p.images ||= []).push(u.trim()); setDirty(true); renderEditor(); renderList(); } };
  $("upload").onchange = async e => {
    for(const file of e.target.files){
      const fd = new FormData(); fd.append("file", file);
      const r = await api("/api/upload", { method:"POST", body:fd });
      if(r.ok){ (p.images ||= []).push((await r.json()).url); setDirty(true); }
      else alert("Yuklab bo'lmadi: " + file.name);
    }
    renderEditor(); renderList();
  };
  $("wgo").onclick = () => webSearch($("wq").value);
  $("wq").onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); webSearch($("wq").value); } };
  $("wurlGo").onclick = () => webPage($("wurl").value);
  $("editor").querySelector(".wres").onclick = async e => {
    const bi = e.target.closest("[data-wimg]"), bp = e.target.closest("[data-wpage]");
    if(bi){ bi.disabled = true; await addWebImage(p, WEB.results[+bi.dataset.wimg].image); renderEditor(); renderList(); }
    if(bp) webPage(WEB.results[+bp.dataset.wpage].page);
  };
  const wp = $("wpApply");
  if(wp) wp.onclick = () => applyWebPage(p);
  $("editor").querySelectorAll("[data-wpimg]").forEach(b => b.onclick = async () => {
    b.disabled = true; await addWebImage(p, WEB.page.images[+b.dataset.wpimg]); renderEditor(); renderList();
  });
  $("up").onclick = () => move(-1);
  $("down").onclick = () => move(1);
  $("del").onclick = () => { if(confirm("Mahsulot o'chirilsinmi?")){ items.splice(cur,1); cur = -1; setDirty(true); renderList(); renderEditor(); } };
}

function setWebMsg(m){ WEB.msg = m; const el = $("wmsg"); if(el) el.textContent = m; }

async function webSearch(q){
  q = q.trim();
  if(!q) return;
  WEB.q = q; WEB.page = null;
  setWebMsg("Qidirilmoqda...");
  const r = await api("/api/admin/websearch?q=" + encodeURIComponent(q));
  const d = await r.json().catch(() => ({}));
  WEB.results = r.ok ? d.results : [];
  WEB.msg = r.ok ? `${WEB.results.length} ta natija. "+ Rasm" — rasmni tovarga qo'shadi, "Ma'lumot" — sahifadan nom, tavsif va xususiyatlarni oladi.` : "Xato: " + (d.detail || r.status);
  renderEditor();
}

async function webPage(url){
  url = (url || "").trim();
  if(!/^https?:\/\//.test(url)){ setWebMsg("Havola https:// bilan boshlanishi kerak"); return; }
  setWebMsg("Sahifa o'qilmoqda...");
  const r = await api("/api/admin/webpage?url=" + encodeURIComponent(url));
  const d = await r.json().catch(() => ({}));
  if(!r.ok){ setWebMsg("Bu sahifani o'qib bo'lmadi (" + (d.detail || r.status) + "). Boshqa natijani tanlang."); return; }
  WEB.page = d;
  WEB.msg = "";
  renderEditor();
  $("editor").querySelector(".wpage")?.scrollIntoView({ behavior:"smooth", block:"center" });
}

async function addWebImage(p, url){
  const r = await api("/api/admin/fetch-image", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ url }) });
  (p.images ||= []).push(r.ok ? (await r.json()).url : url);
  setDirty(true);
  WEB.msg = r.ok ? "Rasm qo'shildi ✓" : "Rasm havola sifatida qo'shildi (yuklab bo'lmadi)";
}

function webPageHtml(p){
  const w = WEB.page;
  if(!w) return "";
  const chk = (k, label, val) => val ? `<label class="wchk"><input type="checkbox" data-wf="${k}" checked> <b>${label}:</b> ${esc(String(val).slice(0, 300))}</label>` : "";
  return `<div class="wpage">
    <div class="hint">Manba: <a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.url.slice(0, 80))}</a></div>
    ${chk("title", "Nomi", w.title)}
    ${chk("desc", "Tavsif", w.desc)}
    ${chk("brand", "Brend", w.brand)}
    ${chk("sku", "Artikul", w.sku)}
    ${w.specs.length ? `<label class="wchk"><input type="checkbox" data-wf="specs" checked> <b>Xususiyatlar (${w.specs.length}):</b> ${esc(w.specs.slice(0, 4).map(x => x.k + ": " + x.v).join("; "))}${w.specs.length > 4 ? "..." : ""}</label>` : ""}
    ${w.price ? `<div class="hint">Saytdagi narx: <b>${esc(w.price)} ${esc(w.currency)}</b> — narxni o'zingiz $ da kiriting.</div>` : ""}
    ${w.images.length ? `<div class="imgs">${w.images.map((src,i) => `<div><img src="${esc(src)}" alt="" referrerpolicy="no-referrer"><button data-wpimg="${i}" title="Qo'shish" style="background:#2f7a44">+</button></div>`).join("")}</div>` : ""}
    <p class="hint">Matnlar RU maydonlarga yoziladi, UZ maydon bo'sh yoki "Yangi mahsulot" bo'lsa, unga ham.</p>
    <div class="bar"><button id="wpApply">Belgilanganlarni tovarga qo'yish</button></div>
  </div>`;
}

function applyWebPage(p){
  const w = WEB.page;
  const on = k => $("editor").querySelector(`[data-wf="${k}"]`)?.checked;
  p.name ||= {}; p.desc ||= {};
  if(on("title")){ p.name.ru = w.title; if(!p.name.uz || p.name.uz === "Yangi mahsulot") p.name.uz = w.title; }
  if(on("desc")){ p.desc.ru = w.desc; if(!p.desc.uz) p.desc.uz = w.desc; }
  if(on("brand")) p.brand = w.brand;
  if(on("sku")) p.sku = w.sku;
  if(on("specs")) p.specs = w.specs.map(x => ({ k:{ uz:x.k, ru:x.k }, v:{ uz:x.v, ru:x.v } }));
  WEB.msg = "Ma'lumotlar qo'yildi ✓ Tekshirib, \"Saytga saqlash\" ni bosing.";
  WEB.page = null;
  setDirty(true); renderEditor(); renderList();
}

function move(d){
  const j = cur + d;
  if(j < 0 || j >= items.length) return;
  [items[cur], items[j]] = [items[j], items[cur]];
  cur = j; setDirty(true); renderList();
}

$("saveAll").onclick = async () => {
  $("saveAll").disabled = true;
  const r = await api("/api/products", { method:"PUT", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(items) });
  $("saveAll").disabled = false;
  if(r.ok){ setDirty(false); $("saveMsg").className = "msg ok"; $("saveMsg").textContent = "Saqlandi ✓"; }
  else { const d = await r.json().catch(() => ({})); $("saveMsg").className = "msg err"; $("saveMsg").textContent = "Xato: " + (d.detail || r.status); }
};

/* ---------- site sections ---------- */
async function loadSite(){
  SITE = await (await fetch("/api/site", { cache:"no-store" })).json();
  syncCats();
}
const syncCats = () => { CATS = Object.fromEntries(SITE.categories.map(c => [c.id, c.name.uz || c.id])); };
function setSiteDirty(v){ siteDirty = v; $("siteMsg").className = "msg" + (v ? " err" : ""); $("siteMsg").textContent = v ? "Saqlanmagan o'zgarishlar bor" : ""; }

const linesToBi = txt => txt.split("\n").map(l => l.split("|").map(x => x.trim())).filter(a => a[0]).map(([u,r]) => ({ uz:u, ru:r||u }));
const biToLines = arr => (arr||[]).map(x => `${x.uz||""} | ${x.ru||""}`).join("\n");
const linesToItems = txt => txt.split("\n").map(l => l.split("|").map(x => x.trim())).filter(a => a[0])
  .map(([nu,nr,pu,pr]) => ({ name:{ uz:nu, ru:nr||nu }, price:{ uz:pu||"", ru:pr||pu||"" } }));
const itemsToLines = arr => (arr||[]).map(i => [i.name?.uz, i.name?.ru, i.price?.uz, i.price?.ru].map(x => x||"").join(" | ")).join("\n");

const fld = (label, path, val, type="text") => `<div><label>${label}</label><input data-p="${path}" type="${type}" value="${esc(val)}"></div>`;
const area = (label, path, val, h=90) => `<label>${label}</label><textarea data-p="${path}" style="min-height:${h}px">${esc(val)}</textarea>`;
const imgCtl = (path, src) => `<label>Rasm</label><div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
  <img class="thumb" src="${esc(src||"")}" alt=""><label class="btn" style="margin:0;color:#fff">Rasm yuklash<input type="file" accept="image/*" data-up="${path}" hidden></label>
  <button class="ghost" data-url="${path}">Havola</button></div>`;

function getPath(path){ return path.split(".").reduce((o,k) => o?.[k], SITE); }
function setPath(path, val){
  const ks = path.split("."), last = ks.pop();
  const o = ks.reduce((o,k) => (o[k] ??= {}), SITE);
  o[last] = val;
}

function renderSite(){
  if(!SITE) return;
  $("catsEd").innerHTML = SITE.categories.map((c,i) => `<div class="card">
    <div class="row3">${fld("ID", `categories.${i}.id`, c.id)}${fld("Nomi (UZ)", `categories.${i}.name.uz`, c.name?.uz)}${fld("Название (RU)", `categories.${i}.name.ru`, c.name?.ru)}</div>
    <div class="row">${fld("Qisqa tavsif (UZ)", `categories.${i}.desc.uz`, c.desc?.uz)}${fld("Описание (RU)", `categories.${i}.desc.ru`, c.desc?.ru)}</div>
    ${imgCtl(`categories.${i}.image`, c.image)}
    <div class="bar"><button class="ghost" data-mv="${i}:-1">↑</button><button class="ghost" data-mv="${i}:1">↓</button>
      <span style="flex:1"></span><small class="hint">${items.filter(p => p.cat === c.id).length} ta mahsulot</small><button class="danger" data-delcat="${i}">O'chirish</button></div>
  </div>`).join("");
  const r = SITE.rent;
  $("rentEd").innerHTML = `<div class="card">
    <div class="row">${fld("Karta nomi (UZ)", "rent.title.uz", r.title?.uz)}${fld("Название карточки (RU)", "rent.title.ru", r.title?.ru)}</div>
    <div class="row">${fld("Karta tavsifi (UZ)", "rent.desc.uz", r.desc?.uz)}${fld("Описание карточки (RU)", "rent.desc.ru", r.desc?.ru)}</div>
    ${imgCtl("rent.image", r.image)}</div>` +
    r.plans.map((p,i) => `<div class="card">
    <div class="row">${fld("Tarif nomi (UZ)", `rent.plans.${i}.name.uz`, p.name?.uz)}${fld("Тариф (RU)", `rent.plans.${i}.name.ru`, p.name?.ru)}</div>
    <div class="row3">${fld("Narx (masalan 1 200 000)", `rent.plans.${i}.price`, p.price)}${fld("Davr (UZ), masalan so'm/oy", `rent.plans.${i}.period.uz`, p.period?.uz)}${fld("Период (RU), напр. сум/мес", `rent.plans.${i}.period.ru`, p.period?.ru)}</div>
    ${area("Imkoniyatlar — har qatorda: UZ | RU", `rent.plans.${i}.features`, biToLines(p.features))}
    <div class="bar"><label style="margin:0;display:flex;gap:.4rem;align-items:center"><input type="checkbox" style="width:auto" data-feat="${i}"${p.featured ? " checked" : ""}> "Ommabop" belgisi</label>
      <span style="flex:1"></span><button class="danger" data-delplan="${i}">Tarifni o'chirish</button></div>
  </div>`).join("");
  const s = SITE.service;
  $("srvEd").innerHTML = `<div class="card">
    <div class="row">${fld("Karta nomi (UZ)", "service.title.uz", s.title?.uz)}${fld("Название карточки (RU)", "service.title.ru", s.title?.ru)}</div>
    <div class="row">${fld("Karta tavsifi (UZ)", "service.desc.uz", s.desc?.uz)}${fld("Описание карточки (RU)", "service.desc.ru", s.desc?.ru)}</div>
    ${imgCtl("service.image", s.image)}
    ${area("Xizmatlar va narxlar — har qatorda: Xizmat UZ | Услуга RU | Narx UZ | Цена RU", "service.items", itemsToLines(s.items), 160)}
    <div class="row">${fld("Izoh (UZ)", "service.note.uz", s.note?.uz)}${fld("Примечание (RU)", "service.note.ru", s.note?.ru)}</div>
  </div>`;
}

$("siteTab").addEventListener("input", e => {
  const el = e.target, path = el.dataset.p;
  if(path){
    if(path.endsWith(".features")) setPath(path, linesToBi(el.value));
    else if(path === "service.items") setPath(path, linesToItems(el.value));
    else setPath(path, path.endsWith(".id") ? el.value.trim() : el.value);
    setSiteDirty(true);
  } else if(el.dataset.feat !== undefined){
    SITE.rent.plans[+el.dataset.feat].featured = el.checked; setSiteDirty(true);
  }
});
$("siteTab").addEventListener("change", async e => {
  const path = e.target.dataset.up;
  if(!path) return;
  const fd = new FormData(); fd.append("file", e.target.files[0]);
  const r = await api("/api/upload", { method:"POST", body:fd });
  if(!r.ok) return alert("Yuklab bo'lmadi");
  setPath(path, (await r.json()).url); setSiteDirty(true); renderSite();
});
$("siteTab").addEventListener("click", e => {
  const b = e.target.closest("button");
  if(!b) return;
  const d = b.dataset;
  if(d.url){ const u = prompt("Rasm havolasi (https://...)", getPath(d.url) || ""); if(u){ setPath(d.url, u.trim()); setSiteDirty(true); renderSite(); } }
  else if(d.mv){ const [i,dir] = d.mv.split(":").map(Number), j = i + dir, c = SITE.categories;
    if(j >= 0 && j < c.length){ [c[i], c[j]] = [c[j], c[i]]; setSiteDirty(true); renderSite(); } }
  else if(d.delcat){ const c = SITE.categories[+d.delcat];
    if(items.some(p => p.cat === c.id)) return alert("Bu yo'nalishda mahsulotlar bor. Avval ularni boshqa yo'nalishga o'tkazing.");
    if(confirm(`"${c.name.uz}" o'chirilsinmi?`)){ SITE.categories.splice(+d.delcat,1); setSiteDirty(true); renderSite(); } }
  else if(d.delplan){ if(confirm("Tarif o'chirilsinmi?")){ SITE.rent.plans.splice(+d.delplan,1); setSiteDirty(true); renderSite(); } }
});
$("addCat").onclick = () => {
  SITE.categories.push({ id:"yangi-" + Date.now().toString(36), name:{ uz:"Yangi yo'nalish", ru:"Новое направление" }, desc:{ uz:"", ru:"" }, image:"" });
  setSiteDirty(true); renderSite();
};
$("addPlan").onclick = () => {
  SITE.rent.plans.push({ name:{ uz:"Yangi tarif", ru:"Новый тариф" }, price:"", period:{ uz:"so'm/oy", ru:"сум/мес" }, featured:false, features:[] });
  setSiteDirty(true); renderSite();
};
$("saveSite").onclick = async () => {
  $("saveSite").disabled = true;
  const r = await api("/api/site", { method:"PUT", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(SITE) });
  $("saveSite").disabled = false;
  if(r.ok){ setSiteDirty(false); syncCats(); renderList(); $("siteMsg").className = "msg ok"; $("siteMsg").textContent = "Saqlandi ✓"; }
  else { const d = await r.json().catch(() => ({})); $("siteMsg").className = "msg err"; $("siteMsg").textContent = "Xato: " + (d.detail || r.status); }
};

window.addEventListener("beforeunload", e => { if(dirty || siteDirty){ e.preventDefault(); e.returnValue = ""; } });
if(PW) login(PW).then(m => { if(m) $("loginMsg").textContent = m; });
