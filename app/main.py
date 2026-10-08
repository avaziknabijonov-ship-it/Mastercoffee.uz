import html
import json
import os
import re
import secrets
import shutil
import threading
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    Response,
)
from pydantic import BaseModel
from starlette.routing import Route

ROOT = Path(__file__).resolve().parent.parent


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env_file(ROOT / ".env")


def pick_data_dir() -> Path:
    env = os.environ.get("DATA_DIR")
    if env:
        return Path(env)
    if Path("/data").is_dir() and os.access("/data", os.W_OK):
        return Path("/data")
    return ROOT / "var"


DATA_DIR = pick_data_dir()
UPLOAD_DIR = DATA_DIR / "uploads"
PRODUCTS_FILE = DATA_DIR / "products.json"
SEED_FILE = ROOT / "data" / "products.json"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
if not PRODUCTS_FILE.exists():
    shutil.copy(SEED_FILE, PRODUCTS_FILE)

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "")
SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")
GOOGLE_VERIFY = os.environ.get("GOOGLE_SITE_VERIFICATION", "")
YANDEX_VERIFY = os.environ.get("YANDEX_VERIFICATION", "")
GA_ID = os.environ.get("GA_ID", "")
YM_ID = os.environ.get("YANDEX_METRIKA_ID", "")

PUBLIC_FILES = {"index.html", "styles.css", "script.js", "config.js", "i18n.js", "robots.txt", "admin.html", "admin.js"}
PUBLIC_DIRS = {"assets"}
CATS = {"machines", "bar", "beans", "packed", "accessories"}
CAT_NAMES = {
    "machines": {"uz": "Kofe mashinalari", "ru": "Кофемашины"},
    "bar": {"uz": "Bar uskunalari", "ru": "Барное оборудование"},
    "beans": {"uz": "Kofe donlari", "ru": "Кофе в зёрнах"},
    "packed": {"uz": "Qadoqlangan kofe", "ru": "Фасованный кофе"},
    "accessories": {"uz": "Aksessuarlar", "ru": "Аксессуары"},
}
ALLOWED_IMG = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_UPLOAD = 8 * 1024 * 1024
_lock = threading.Lock()

app = FastAPI()
DOC_PATHS = {"/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"}
app.router.routes = [r for r in app.router.routes if not (isinstance(r, Route) and r.path in DOC_PATHS)]


def read_products() -> list:
    with _lock:
        return json.loads(PRODUCTS_FILE.read_text())


def write_products(items: list) -> None:
    with _lock:
        tmp = PRODUCTS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(items, ensure_ascii=False, indent=1))
        tmp.replace(PRODUCTS_FILE)


def require_admin(password: str | None) -> None:
    if not ADMIN_PASSWORD:
        raise HTTPException(503, "ADMIN_PASSWORD is not configured")
    if not password or not secrets.compare_digest(password, ADMIN_PASSWORD):
        raise HTTPException(401, "Wrong password")


def head_extras() -> str:
    out = []
    if GOOGLE_VERIFY:
        out.append(f'<meta name="google-site-verification" content="{html.escape(GOOGLE_VERIFY)}">')
    if YANDEX_VERIFY:
        out.append(f'<meta name="yandex-verification" content="{html.escape(YANDEX_VERIFY)}">')
    if re.fullmatch(r"G-[A-Z0-9]+", GA_ID):
        out.append(
            f'<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>'
            "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}"
            f'gtag("js",new Date());gtag("config","{GA_ID}");</script>'
        )
    if YM_ID.isdigit():
        out.append(
            "<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};"
            "k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})"
            '(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");'
            f'ym({YM_ID},"init",{{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true}});</script>'
        )
    return "\n".join(out)


def base_url(request: Request) -> str:
    if SITE_URL:
        return SITE_URL
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return f"{proto}://{request.url.netloc}"


def validate_products(items: list) -> list:
    if not isinstance(items, list):
        raise HTTPException(400, "Expected a list")
    seen = set()
    for p in items:
        if not isinstance(p, dict):
            raise HTTPException(400, "Each product must be an object")
        pid = str(p.get("id", "")).strip()
        if not pid or pid in seen or not all(c.isalnum() or c in "-_" for c in pid):
            raise HTTPException(400, f"Invalid or duplicate id: {pid!r}")
        seen.add(pid)
        if p.get("cat") not in CATS:
            raise HTTPException(400, f"Invalid category for {pid}")
        if not isinstance(p.get("name"), dict) or not p["name"].get("uz"):
            raise HTTPException(400, f"Missing name.uz for {pid}")
        for key in ("price", "old"):
            if not isinstance(p.get(key, 0), (int, float)) or p.get(key, 0) < 0:
                raise HTTPException(400, f"Invalid {key} for {pid}")
        if not isinstance(p.get("images", []), list):
            raise HTTPException(400, f"Invalid images for {pid}")
    return items


# ---------- API ----------

@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/data/products.json")
@app.get("/api/products")
def get_products():
    return JSONResponse(read_products(), headers={"Cache-Control": "no-cache"})


@app.post("/api/admin/login")
def admin_login(x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    return {"status": "ok"}


@app.put("/api/products")
async def put_products(request: Request, x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    items = validate_products(await request.json())
    write_products(items)
    return {"ok": True, "count": len(items)}


@app.post("/api/upload")
async def upload(file: Annotated[UploadFile, File()], x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMG:
        raise HTTPException(400, "Only image files are allowed")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(400, "File too large (max 8 MB)")
    name = uuid.uuid4().hex[:12] + ext
    (UPLOAD_DIR / name).write_bytes(data)
    return {"url": f"/uploads/{name}"}


class Lead(BaseModel):
    name: str
    phone: str
    topic: str = ""
    company: str = ""
    note: str = ""
    cart: str = ""
    lang: str = ""
    page: str = ""


def phone_digits(phone: str) -> str:
    d = re.sub(r"\D", "", phone)
    if len(d) == 9:
        d = "998" + d
    return d if 9 <= len(d) <= 15 else ""


def lead_buttons(phone: str, base: str) -> list:
    d = phone_digits(phone)
    if not d:
        return []
    return [
        [{"text": "📞 Qo'ng'iroq qilish", "url": f"{base}/call/{d}"}],
        [{"text": "✈️ Telegram'da yozish", "url": f"https://t.me/+{d}"}, {"text": "💬 WhatsApp", "url": f"https://wa.me/{d}"}],
    ]


def send_telegram(text: str, buttons: list | None = None) -> bool:
    params = {"chat_id": TG_CHAT, "text": text}
    if buttons:
        params["reply_markup"] = json.dumps({"inline_keyboard": buttons})
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=urllib.parse.urlencode(params).encode()
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except OSError:
        if buttons:
            return send_telegram(text)
        raise


@app.post("/api/lead")
def lead(data: Lead, request: Request):
    if not data.name.strip() or not data.phone.strip():
        raise HTTPException(400, "Name and phone are required")
    d = phone_digits(data.phone)
    lines = [f"🆕 {data.topic or 'Ariza'}", f"👤 {data.name}", f"📞 {'+' + d if d else data.phone}"]
    if data.company:
        lines.append(f"🏢 {data.company}")
    if data.note:
        lines.append(f"📝 {data.note}")
    if data.cart:
        lines.append(f"🛒 {data.cart}")
    if data.page:
        lines.append(f"🌐 {data.page}")
    text = "\n".join(lines)[:4000]
    with _lock, open(DATA_DIR / "leads.jsonl", "a") as f:
        f.write(json.dumps(data.model_dump(), ensure_ascii=False) + "\n")
    if not (TG_TOKEN and TG_CHAT):
        return {"ok": True, "telegram": False}
    try:
        delivered = send_telegram(text, lead_buttons(data.phone, base_url(request)))
    except OSError:
        delivered = False
    if not delivered:
        raise HTTPException(502, "Telegram delivery failed")
    return {"ok": True, "telegram": True}


@app.get("/api/admin/leads")
def admin_leads(x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    f = DATA_DIR / "leads.jsonl"
    rows = [json.loads(line) for line in f.read_text().splitlines()] if f.exists() else []
    return rows[-200:][::-1]


# ---------- SEO ----------

@app.get("/robots.txt")
def robots(request: Request):
    return PlainTextResponse(f"User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /call/\nAllow: /\n\nSitemap: {base_url(request)}/sitemap.xml\n")


@app.get("/sitemap.xml")
def sitemap(request: Request):
    b = base_url(request)
    urls = [(f"{b}/", "1.0")] + [(f"{b}/p/{urllib.parse.quote(p['id'])}", "0.8") for p in read_products()]
    body = "".join(f"<url><loc>{html.escape(u)}</loc><priority>{pr}</priority></url>" for u, pr in urls)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'
    return Response(xml, media_type="application/xml")


def tr(obj, lang: str) -> str:
    if not isinstance(obj, dict):
        return ""
    return obj.get(lang) or obj.get("uz") or ""


def price_text(n, lang: str) -> str:
    if not n:
        return "Narxini so'rang" if lang == "uz" else "Цена по запросу"
    return "$" + f"{n:,.0f}".replace(",", " ")


def abs_url(b: str, u: str) -> str:
    return u if u.startswith("http") else f"{b}/{u.lstrip('/')}"


PAGE = """<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Master Coffee</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="uz" href="{url_uz}"><link rel="alternate" hreflang="ru" href="{url_ru}">
<meta property="og:type" content="product"><meta property="og:site_name" content="Master Coffee">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{image}"><meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css"><link rel="icon" type="image/png" href="/assets/favicon.png">
<script type="application/ld+json">{ld}</script>
{extras}
</head>
<body class="ppage">
<div class="topbar"><div class="container topbar__inner">
<a href="tel:+998994631713">+998 99 463 17 13</a>
<div class="lang"><a class="lang__btn{uz_active}" href="?lang=uz">UZ</a><a class="lang__btn{ru_active}" href="?lang=ru">RU</a></div>
</div></div>
<header class="nav"><div class="container nav__inner">
<a class="logo" href="/"><img src="/assets/logo-dark.png" alt="Master Coffee" class="logo__img"></a>
<div class="nav__actions"><a class="nav__link" href="/#catalog">{catalog}</a><a class="nav__link" href="/#contact">{contacts}</a></div>
</div></header>
<main class="container ppage__main">
<nav class="crumbs"><a href="/">{home}</a> / <a href="/#catalog">{cat}</a> / <span>{title}</span></nav>
<div class="modal__grid">
<div><img class="modal__main" id="pMain" src="{img0}" alt="{title}">{thumbs}</div>
<div class="modal__info">
<span class="card__cat">{cat}</span><h1>{title}</h1><p class="muted">{desc}</p>
<p class="modal__price">{price}</p>
<span class="stock{stock_cls}">{stock}</span>
<table class="specs">{specs}</table>
<div class="modal__actions">
<a class="btn" href="/#product-{pid}">{order}</a>
<a class="btn btn--ghost-dark" href="tel:+998994631713">+998 99 463 17 13</a>
</div>
<p class="muted ppage__tg"><a href="https://t.me/mastercoffeeprice" target="_blank" rel="noopener">Telegram: @mastercoffeeprice</a></p>
</div></div>
</main>
<script>document.querySelectorAll('.thumb').forEach(t=>t.onclick=()=>{{document.getElementById('pMain').src=t.src}})</script>
</body></html>"""


@app.get("/p/{pid}", response_class=HTMLResponse)
def product_page(pid: str, request: Request, lang: str = "uz"):
    lang = "ru" if lang == "ru" else "uz"
    p = next((x for x in read_products() if x.get("id") == pid), None)
    if not p:
        raise HTTPException(404, "Not found")
    b = base_url(request)
    url = f"{b}/p/{urllib.parse.quote(pid)}"
    images = p.get("images") or ["assets/og-image.jpg"]
    title = tr(p.get("name"), lang)
    desc = tr(p.get("desc"), lang)
    e = html.escape
    ld = {
        "@context": "https://schema.org", "@type": "Product", "name": title, "description": desc,
        "image": [abs_url(b, u) for u in images], "url": url,
    }
    if p.get("brand"):
        ld["brand"] = {"@type": "Brand", "name": p["brand"]}
    if p.get("sku"):
        ld["sku"] = p["sku"]
    if p.get("price"):
        ld["offers"] = {
            "@type": "Offer", "price": p["price"], "priceCurrency": "USD", "url": url,
            "availability": "https://schema.org/InStock" if p.get("stock") != "order" else "https://schema.org/PreOrder",
            "seller": {"@type": "Organization", "name": "Master Coffee"},
        }
    rows = []
    if p.get("brand"):
        rows.append(("Brend" if lang == "uz" else "Бренд", p["brand"]))
    if p.get("sku"):
        rows.append(("Artikul" if lang == "uz" else "Артикул", p["sku"]))
    rows += [(tr(s.get("k"), lang), tr(s.get("v"), lang)) for s in p.get("specs", [])]
    thumbs = ""
    if len(images) > 1:
        thumbs = '<div class="thumbs">' + "".join(f'<img class="thumb" src="{e(abs_url(b, u))}" alt="">' for u in images) + "</div>"
    on_order = p.get("stock") == "order"
    page = PAGE.format(
        lang=lang, title=e(title), desc=e(desc), url=e(url) + ("?lang=ru" if lang == "ru" else ""),
        url_uz=e(url), url_ru=e(url) + "?lang=ru", image=e(abs_url(b, images[0])),
        ld=json.dumps(ld, ensure_ascii=False).replace("</", "<\\/"),
        uz_active=" is-active" if lang == "uz" else "", ru_active=" is-active" if lang == "ru" else "",
        home="Bosh sahifa" if lang == "uz" else "Главная", cat=e(tr(CAT_NAMES.get(p.get("cat")), lang)),
        img0=e(abs_url(b, images[0])), thumbs=thumbs, price=e(price_text(p.get("price"), lang)),
        stock_cls=" stock--order" if on_order else "",
        stock=("Buyurtma asosida" if lang == "uz" else "Под заказ") if on_order else ("Mavjud" if lang == "uz" else "В наличии"),
        specs="".join(f"<tr><td>{e(k)}</td><td>{e(v)}</td></tr>" for k, v in rows),
        catalog="Katalog" if lang == "uz" else "Каталог", contacts="Aloqa" if lang == "uz" else "Контакты",
        extras=head_extras(), pid=e(pid), order="Buyurtma berish" if lang == "uz" else "Заказать",
    )
    return HTMLResponse(page)


# ---------- static ----------

@app.get("/uploads/{name}")
def uploads(name: str):
    f = (UPLOAD_DIR / name).resolve()
    if f.parent != UPLOAD_DIR.resolve() or not f.is_file():
        raise HTTPException(404)
    return FileResponse(f)


@app.get("/admin")
def admin_redirect():
    return FileResponse(ROOT / "admin.html")


@app.get("/call/{digits}", response_class=HTMLResponse)
def call(digits: str):
    if not re.fullmatch(r"\d{9,15}", digits):
        raise HTTPException(404)
    tel = f"tel:+{digits}"
    return HTMLResponse(
        f'<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="robots" content="noindex">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<meta http-equiv="refresh" content="0;url={tel}"><title>+{digits}</title></head>'
        f'<body style="font-family:sans-serif;text-align:center;padding:3rem">'
        f'<a href="{tel}" style="font-size:1.6rem">📞 +{digits}</a></body></html>'
    )


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    page = (ROOT / "index.html").read_text().replace("https://mastercoffee.uz", base_url(request))
    return HTMLResponse(page.replace("</head>", head_extras() + "\n</head>", 1))


@app.get("/{path:path}")
def static(path: str):
    parts = Path(path).parts
    if not parts:
        raise HTTPException(404)
    if not (path in PUBLIC_FILES or parts[0] in PUBLIC_DIRS):
        raise HTTPException(404)
    f = (ROOT / path).resolve()
    if not f.is_relative_to(ROOT) or not f.is_file():
        raise HTTPException(404)
    return FileResponse(f)
