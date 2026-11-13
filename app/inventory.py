import html
import io
import json
import os
import re
import secrets
import sqlite3
import uuid
import zipfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import Response

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
DATA_DIR = Path(os.environ.get("DATA_DIR") or ("/data" if Path("/data").is_dir() and os.access("/data", os.W_OK) else Path(__file__).resolve().parent.parent / "var"))
DB_PATH = DATA_DIR / "inventory.sqlite3"
PRODUCTS_PATH = DATA_DIR / "products.json"
router = APIRouter()
_lock = __import__("threading").RLock()


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    return db


def initialize():
    with database() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS employees(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, telegram_id TEXT UNIQUE,
          role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('employee','director')),
          active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS warehouses(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS suppliers(
          id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, phone TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS receipts(
          id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES suppliers(id),
          warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
          employee_id TEXT REFERENCES employees(id), received_at TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS receipt_items(
          id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL, product_name TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '',
          quantity REAL NOT NULL CHECK(quantity > 0), unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
          currency TEXT NOT NULL CHECK(currency IN ('USD','UZS'))
        );
        CREATE INDEX IF NOT EXISTS receipt_items_product_idx ON receipt_items(product_id);
        CREATE INDEX IF NOT EXISTS receipts_date_idx ON receipts(received_at);
        """)
        if db.execute("SELECT 1 FROM suppliers WHERE name=? COLLATE NOCASE", ("EHORECA",)).fetchone() is None:
            stamp = now()
            db.execute("INSERT INTO suppliers VALUES(?,?,?,?,1,?,?)", ("supplier-ehoreca", "EHORECA", "", "Excel yetkazib beruvchi", stamp, stamp))
@contextmanager
def database():
    db = connect()
    try:
        with db:
            yield db
    finally:
        db.close()


def require_admin(password: str | None):
    if not ADMIN_PASSWORD:
        raise HTTPException(503, "ADMIN_PASSWORD is not configured")
    if not password or not secrets.compare_digest(password, ADMIN_PASSWORD):
        raise HTTPException(401, "Wrong password")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


initialize()


def text(value, field, limit=240, required=False):
    result = str(value or "").strip()
    if required and not result:
        raise HTTPException(400, f"{field} is required")
    if len(result) > limit:
        raise HTTPException(400, f"{field} is too long")
    return result


def all_products():
    try:
        rows = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return rows if isinstance(rows, list) else []


def _product_map():
    return {str(p.get("id")): p for p in all_products() if isinstance(p, dict) and p.get("id")}


@router.get("/api/admin/inventory")
def inventory_snapshot(x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    products = _product_map()
    with database() as db:
        employees = [dict(r) for r in db.execute("SELECT * FROM employees ORDER BY active DESC,name COLLATE NOCASE")]
        warehouses = [dict(r) for r in db.execute("SELECT * FROM warehouses ORDER BY active DESC,name COLLATE NOCASE")]
        suppliers = [dict(r) for r in db.execute("SELECT * FROM suppliers ORDER BY active DESC,name COLLATE NOCASE")]
        receipts = [dict(r) for r in db.execute("""
          SELECT r.*,s.name supplier_name,w.name warehouse_name,e.name employee_name
          FROM receipts r JOIN suppliers s ON s.id=r.supplier_id
          JOIN warehouses w ON w.id=r.warehouse_id LEFT JOIN employees e ON e.id=r.employee_id
          ORDER BY r.received_at DESC,r.created_at DESC LIMIT 500
        """)]
        for receipt in receipts:
            receipt["lines"] = [dict(x) for x in db.execute("SELECT * FROM receipt_items WHERE receipt_id=? ORDER BY rowid", (receipt["id"],))]
        raw_stock = db.execute("""
          SELECT ri.product_id,ri.product_name,ri.sku,r.warehouse_id,w.name warehouse_name,
                 SUM(ri.quantity) quantity, SUM(ri.quantity*ri.unit_cost) receipt_value
          FROM receipt_items ri JOIN receipts r ON r.id=ri.receipt_id
          JOIN warehouses w ON w.id=r.warehouse_id
          GROUP BY ri.product_id,ri.product_name,ri.sku,r.warehouse_id,w.name
          ORDER BY ri.product_name COLLATE NOCASE,w.name COLLATE NOCASE
        """).fetchall()
        stock = [dict(x) for x in raw_stock]
        for row in stock:
            p = products.get(row["product_id"], {})
            row["product_name"] = (p.get("name") or {}).get("uz") or row["product_name"]
        totals = {}
        for row in db.execute("""
          SELECT s.id,s.name,COALESCE(SUM(ri.quantity*ri.unit_cost),0) total_received
          FROM suppliers s LEFT JOIN receipts r ON r.supplier_id=s.id
          LEFT JOIN receipt_items ri ON ri.receipt_id=r.id GROUP BY s.id,s.name ORDER BY s.name COLLATE NOCASE
        """):
            totals[row["id"]] = row["total_received"]
        return {"employees":employees,"warehouses":warehouses,"suppliers":suppliers,
                "receipts":receipts,"stock":stock,"products":[{"id":p["id"],"name":p.get("name",{}),"sku":p.get("sku","")} for p in products.values()],
                "supplier_totals":totals}


@router.post("/api/admin/inventory/{kind}")
async def create_record(kind: str, request: Request, x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    data = await request.json()
    if not isinstance(data, dict):
        raise HTTPException(400, "Expected an object")
    stamp, item_id = now(), uuid.uuid4().hex
    with _lock, database() as db:
        if kind == "employees":
            name = text(data.get("name"), "name", required=True)
            telegram_id = text(data.get("telegram_id"), "telegram_id", 32)
            role = data.get("role", "employee")
            if role not in ("employee", "director"): raise HTTPException(400, "Invalid role")
            try:
                db.execute("INSERT INTO employees VALUES(?,?,?,?,1,?,?)",(item_id,name,telegram_id or None,role,stamp,stamp))
            except sqlite3.IntegrityError as exc: raise HTTPException(409,"Telegram ID is already assigned") from exc
        elif kind == "warehouses":
            db.execute("INSERT INTO warehouses VALUES(?,?,?,1,?,?)",(item_id,text(data.get("name"),"name",required=True),text(data.get("location"),"location"),stamp,stamp))
        elif kind == "suppliers":
            db.execute("INSERT INTO suppliers VALUES(?,?,?, ?,1,?,?)",(item_id,text(data.get("name"),"name",required=True),text(data.get("phone"),"phone",60),text(data.get("note"),"note",1000),stamp,stamp))
        elif kind == "receipts":
            _save_receipt(db,item_id,data,stamp)
        else: raise HTTPException(404,"Unknown section")
    return {"ok":True,"id":item_id}


def _save_receipt(db, receipt_id, data, stamp):
    supplier_id = text(data.get("supplier_id"),"supplier",64,True)
    warehouse_id = text(data.get("warehouse_id"),"warehouse",64,True)
    employee_id = text(data.get("employee_id"),"employee",64) or None
    received_at = text(data.get("received_at"),"received_at",40) or stamp[:10]
    note = text(data.get("note"),"note",1000)
    lines = data.get("lines")
    if not isinstance(lines,list) or not lines: raise HTTPException(400,"At least one product is required")
    if db.execute("SELECT 1 FROM suppliers WHERE id=? AND active=1",(supplier_id,)).fetchone() is None: raise HTTPException(400,"Select an active supplier")
    if db.execute("SELECT 1 FROM warehouses WHERE id=? AND active=1",(warehouse_id,)).fetchone() is None: raise HTTPException(400,"Select an active warehouse")
    if employee_id and db.execute("SELECT 1 FROM employees WHERE id=? AND active=1",(employee_id,)).fetchone() is None: raise HTTPException(400,"Select an active employee")
    products = _product_map()
    normalized=[]
    for line in lines:
        if not isinstance(line,dict): raise HTTPException(400,"Invalid receipt line")
        product_id=text(line.get("product_id"),"product",120,True)
        product=products.get(product_id)
        if not product: raise HTTPException(400,"Product not found")
        try: quantity=float(line.get("quantity")); unit_cost=float(line.get("unit_cost",0))
        except (TypeError,ValueError): raise HTTPException(400,"Quantity and cost must be numbers")
        currency=line.get("currency","USD")
        if not (0 < quantity <= 1000000) or not (0 <= unit_cost <= 100000000000) or currency not in ("USD","UZS"):
            raise HTTPException(400,"Invalid quantity, cost, or currency")
        pname=product.get("name") or {}
        normalized.append((uuid.uuid4().hex,product_id,pname.get("uz") or pname.get("ru") or product_id,str(product.get("sku") or ""),quantity,unit_cost,currency))
    db.execute("INSERT INTO receipts VALUES(?,?,?,?,?,?,?)",(receipt_id,supplier_id,warehouse_id,employee_id,received_at,note,stamp))
    db.executemany("INSERT INTO receipt_items VALUES(?,?,?,?,?,?,?,?)",[(line_id,receipt_id,*row) for line_id,*row in normalized])


def _get(kind, item_id):
    table={"employees":"employees","warehouses":"warehouses","suppliers":"suppliers"}.get(kind)
    if not table: raise HTTPException(404,"Unknown section")
    with database() as db:
        row=db.execute(f"SELECT * FROM {table} WHERE id=?",(item_id,)).fetchone()
        return dict(row) if row else None


@router.put("/api/admin/inventory/{kind}/{item_id}")
async def update_record(kind: str, item_id: str, request: Request, x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    data=await request.json()
    if not isinstance(data,dict): raise HTTPException(400,"Expected an object")
    stamp=now()
    with _lock, database() as db:
        if kind == "receipts":
            if db.execute("SELECT 1 FROM receipts WHERE id=?",(item_id,)).fetchone() is None: raise HTTPException(404,"Receipt not found")
            db.execute("DELETE FROM receipts WHERE id=?",(item_id,))
            _save_receipt(db,item_id,data,stamp)
        elif kind == "employees":
            old=_get(kind,item_id)
            if not old: raise HTTPException(404,"Record not found")
            role=data.get("role",old["role"])
            if role not in ("employee","director"): raise HTTPException(400,"Invalid role")
            try:
                db.execute("UPDATE employees SET name=?,telegram_id=?,role=?,active=?,updated_at=? WHERE id=?",
                  (text(data.get("name",old["name"]),"name",required=True),text(data.get("telegram_id",old["telegram_id"]),"telegram_id",32) or None,role,int(bool(data.get("active",old["active"]))),stamp,item_id))
            except sqlite3.IntegrityError as exc: raise HTTPException(409,"Telegram ID is already assigned") from exc
        elif kind == "warehouses":
            old=_get(kind,item_id)
            if not old: raise HTTPException(404,"Record not found")
            db.execute("UPDATE warehouses SET name=?,location=?,active=?,updated_at=? WHERE id=?",
              (text(data.get("name",old["name"]),"name",required=True),text(data.get("location",old["location"]),"location"),int(bool(data.get("active",old["active"]))),stamp,item_id))
        elif kind == "suppliers":
            old=_get(kind,item_id)
            if not old: raise HTTPException(404,"Record not found")
            db.execute("UPDATE suppliers SET name=?,phone=?,note=?,active=?,updated_at=? WHERE id=?",
              (text(data.get("name",old["name"]),"name",required=True),text(data.get("phone",old["phone"]),"phone",60),text(data.get("note",old["note"]),"note",1000),int(bool(data.get("active",old["active"]))),stamp,item_id))
        else: raise HTTPException(404,"Unknown section")
    return {"ok":True}


@router.delete("/api/admin/inventory/{kind}/{item_id}")
def delete_record(kind: str, item_id: str, x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    with _lock,database() as db:
        if kind=="receipts":
            cur=db.execute("DELETE FROM receipts WHERE id=?",(item_id,))
            if not cur.rowcount: raise HTTPException(404,"Receipt not found")
        elif kind in ("employees","warehouses","suppliers"):
            cur=db.execute(f"UPDATE {kind} SET active=0,updated_at=? WHERE id=?",(now(),item_id))
            if not cur.rowcount: raise HTTPException(404,"Record not found")
        else: raise HTTPException(404,"Unknown section")
    return {"ok":True}


def _column_name(n):
    result=""
    while n:
        n,rem=divmod(n-1,26);result=chr(65+rem)+result
    return result


def _sheet_xml(rows):
    body=[]
    max_columns=max((len(row) for row in rows),default=1)
    for ri,row in enumerate(rows,1):
        cells=[]
        for ci,value in enumerate(row,1):
            ref=f"{_column_name(ci)}{ri}"
            value=escape(str(value if value is not None else ""))
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{value}</t></is></c>')
        body.append(f'<row r="{ri}">{"".join(cells)}</row>')
    dimension=f'<dimension ref="A1:{_column_name(max_columns)}{len(rows)}"/>'
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+dimension+'<sheetData>'+''.join(body)+'</sheetData></worksheet>'

@router.get("/api/admin/inventory.xlsx")
def export_inventory(x_admin_password: str | None = Header(default=None)):
    require_admin(x_admin_password)
    products=_product_map()
    rows=[["MASTERCOFFEE · OMBOR VA KIRIM HISOBOTI"],["Hisobot vaqti",now()],[],["OMBOR QOLDIG'I"],["Artikul","Mahsulot","Ombor","Miqdor","Kirim qiymati"]]
    with database() as db:
        for r in db.execute("""
          SELECT ri.sku,ri.product_id,ri.product_name,w.name warehouse_name,
                 SUM(ri.quantity) quantity,SUM(ri.quantity*ri.unit_cost) value
          FROM receipt_items ri JOIN receipts rc ON rc.id=ri.receipt_id
          JOIN warehouses w ON w.id=rc.warehouse_id
          GROUP BY ri.sku,ri.product_id,ri.product_name,w.name
          ORDER BY ri.product_name COLLATE NOCASE
        """):
            name=((products.get(r["product_id"],{}).get("name") or {}).get("uz") or r["product_name"])
            rows.append([r["sku"],name,r["warehouse_name"],r["quantity"],round(r["value"],2)])
        rows += [[],["YETKAZIB BERUVCHILAR"],["Yetkazib beruvchi","Telefon","Kirimlar qiymati"]]
        for r in db.execute("""
          SELECT s.name,s.phone,COALESCE(SUM(ri.quantity*ri.unit_cost),0) total
          FROM suppliers s LEFT JOIN receipts rc ON rc.supplier_id=s.id
          LEFT JOIN receipt_items ri ON ri.receipt_id=rc.id
          GROUP BY s.id ORDER BY s.name COLLATE NOCASE
        """): rows.append([r["name"],r["phone"],round(r["total"],2)])
        rows += [[],["KIRIMLAR"],["Sana","Yetkazib beruvchi","Ombor","Xodim","Mahsulot","Artikul","Miqdor","Birlik narxi","Valyuta"]]
        for r in db.execute("""
          SELECT rc.received_at,s.name supplier,w.name warehouse,COALESCE(e.name,'') employee,
                 ri.product_name,ri.sku,ri.quantity,ri.unit_cost,ri.currency
          FROM receipts rc JOIN suppliers s ON s.id=rc.supplier_id
          JOIN warehouses w ON w.id=rc.warehouse_id LEFT JOIN employees e ON e.id=rc.employee_id
          JOIN receipt_items ri ON ri.receipt_id=rc.id ORDER BY rc.received_at DESC,rc.created_at DESC
        """): rows.append(list(r))
        rows += [[],["XODIMLAR"],["Ism","Telegram ID","Lavozim","Faol"]]
        for r in db.execute("SELECT name,telegram_id,role,active FROM employees ORDER BY name COLLATE NOCASE"):
            rows.append([r["name"],r["telegram_id"],"Direktor" if r["role"]=="director" else "Xodim","Ha" if r["active"] else "Yo'q"])
    buf=io.BytesIO()
    workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hisobot" sheetId="1" r:id="rId1"/></sheets></workbook>'
    files={
      "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      "_rels/.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml":workbook,
      "xl/_rels/workbook.xml.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/worksheets/sheet1.xml":_sheet_xml(rows)
    }
    with zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED) as z:
        for name,content in files.items(): z.writestr(name,content)
    return Response(buf.getvalue(),media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      headers={"Content-Disposition":"attachment; filename=mastercoffee-inventory.xlsx"})

