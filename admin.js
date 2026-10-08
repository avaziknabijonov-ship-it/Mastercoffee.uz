const CATS = { machines:"Kofe mashinalari", bar:"Bar uskunalari", beans:"Kofe donlari", packed:"Qadoqlangan kofe", accessories:"Aksessuarlar" };
let PW = sessionStorage.getItem("mc_admin") || "";
let items = [], cur = -1, dirty = false;
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
$("list").onclick = e => { const it = e.target.closest(".item"); if(it){ cur = +it.dataset.i; renderList(); renderEditor(); } };

$("addBtn").onclick = () => {
  items.unshift({ id:"new-" + Date.now().toString(36), cat:"machines", sku:"", brand:"", price:0, old:0, badge:null, stock:"in",
    name:{uz:"Yangi mahsulot",ru:"Новый товар"}, desc:{uz:"",ru:""}, specs:[], images:[] });
  cur = 0; setDirty(true); renderList(); renderEditor();
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
  $("up").onclick = () => move(-1);
  $("down").onclick = () => move(1);
  $("del").onclick = () => { if(confirm("Mahsulot o'chirilsinmi?")){ items.splice(cur,1); cur = -1; setDirty(true); renderList(); renderEditor(); } };
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

window.addEventListener("beforeunload", e => { if(dirty){ e.preventDefault(); e.returnValue = ""; } });
if(PW) login(PW).then(m => { if(m) $("loginMsg").textContent = m; });
