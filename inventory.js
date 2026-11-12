"use strict";
let inv=null, invTab="stock", invEdit=null;
const ir=document.getElementById("inventoryContent");
const ie=s=>esc(s);
const iv=async(url,opts)=>api(url,opts);
const invBtn=(k,x)=>'<button class="ghost" data-e="'+k+'" data-id="'+ie(x.id)+'">Tahrirlash</button> <button class="danger" data-d="'+k+'" data-id="'+ie(x.id)+'">O‘chirish</button>';
async function invLoad(){const r=await iv("/api/admin/inventory",{cache:"no-store"});if(!r.ok)throw Error("Ombor yuklanmadi: "+r.status);inv=await r.json();invRender();}
async function initInventory(){await invLoad();}
function invOptions(list,selected,label,products){return '<option value="">'+label+'</option>'+list.map(x=>'<option value="'+ie(x.id)+'"'+(x.id===selected?' selected':'')+'>'+ie(products?((x.name||{}).uz||(x.name||{}).ru||x.id)+(x.sku?' · '+x.sku:''):x.name)+'</option>').join('');}
function invTable(head,body){return '<div style="overflow:auto"><table><thead><tr>'+head.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+(body||'<tr><td colspan="'+head.length+'">Ma’lumot yo‘q</td></tr>')+'</tbody></table></div>';}
function invRender(){
 if(!inv)return;
 document.querySelectorAll("[data-inv-section]").forEach(b=>{b.classList.toggle("on",b.dataset.invSection===invTab);b.classList.toggle("ghost",b.dataset.invSection!==invTab);});
 if(invTab==="stock"){
  ir.innerHTML='<h2>Ombor qoldig‘i</h2><p class="hint">Faqat haqiqiy kirim qoldig‘i. Excel’dagi “На складе” — yetkazib beruvchining qoldig‘i, Mastercoffee’ga kirim emas.</p>'+invTable(["Artikul","Mahsulot","Ombor","Miqdor","Kirim qiymati"],inv.stock.map(x=>'<tr><td>'+ie(x.sku)+'</td><td>'+ie(x.product_name)+'</td><td>'+ie(x.warehouse_name)+'</td><td>'+x.quantity+'</td><td>'+Number(x.receipt_value).toLocaleString("en-US")+'</td></tr>').join(""));
 }else if(invTab==="employees"||invTab==="warehouses"||invTab==="suppliers"){
  const kind=invTab, rows=inv[kind]||[];
  let head=kind==="employees"?["Ism","Telegram ID","Lavozim","Holat",""]:kind==="warehouses"?["Nomi","Manzil","Holat",""]:["Nomi","Telefon","Izoh","Kirim qiymati","Holat",""];
  let body=rows.map(x=>'<tr><td>'+ie(x.name)+'</td>'+(kind==="employees"?'<td>'+ie(x.telegram_id||"—")+'</td><td>'+ (x.role==="director"?"Direktor":"Xodim")+'</td>':kind==="warehouses"?'<td>'+ie(x.location||"—")+'</td>':'<td>'+ie(x.phone||"—")+'</td><td>'+ie(x.note||"")+'</td><td>'+Number(inv.supplier_totals[x.id]||0).toLocaleString("en-US")+'</td>')+'<td>'+(x.active?"Faol":"O‘chirilgan")+'</td><td>'+invBtn(kind,x)+'</td></tr>').join("");
  let x=invEdit&&invEdit.kind===kind?rows.find(v=>v.id===invEdit.id):null;
  let fields='<label>Nomi / ism<input name="name" required value="'+ie(x?.name||"")+'"></label>';
  if(kind==="employees")fields+='<label>Telegram ID<input name="telegram_id" type="number" value="'+ie(x?.telegram_id||"")+'"></label><label>Lavozim<select name="role"><option value="employee"'+(x?.role!=="director"?" selected":"")+'>Xodim</option><option value="director"'+(x?.role==="director"?" selected":"")+'>Direktor</option></select></label>';
  if(kind==="warehouses")fields+='<label>Manzil / izoh<input name="location" value="'+ie(x?.location||"")+'"></label>';
  if(kind==="suppliers")fields+='<label>Telefon<input name="phone" value="'+ie(x?.phone||"")+'"></label><label>Izoh<textarea name="note">'+ie(x?.note||"")+'</textarea></label>';
  if(x)fields+='<label><input type="checkbox" name="active" style="width:auto"'+(x.active?" checked":"")+'> Faol</label>';
  ir.innerHTML='<h2>'+({employees:"Xodimlar",warehouses:"Omborlar",suppliers:"Yetkazib beruvchilar"}[kind])+'</h2>'+invTable(head,body)+'<div class="card"><form data-kind="'+kind+'" data-id="'+ie(x?.id||"")+'"><h3>'+(x?"Tahrirlash":"Yangi qo‘shish")+'</h3>'+fields+'<div class="bar"><button type="submit">'+(x?"Saqlash":"Qo‘shish")+'</button>'+(x?'<button type="button" class="ghost" data-cancel>Bekor qilish</button>':"")+'<span class="msg" data-msg></span></div></form></div>';
 }else if(invTab==="receipts"){
  let body=inv.receipts.map(x=>'<tr><td>'+ie(x.received_at)+'</td><td>'+ie(x.supplier_name)+'</td><td>'+ie(x.warehouse_name)+'</td><td>'+ie(x.employee_name||"—")+'</td><td>'+x.lines.length+' mahsulot</td><td>'+invBtn("receipts",x)+'</td></tr>').join("");
  let x=invEdit?.kind==="receipts"?inv.receipts.find(v=>v.id===invEdit.id):null;
  let line=x?.lines?.[0]||{};
  ir.innerHTML='<h2>Mahsulot kirimi</h2>'+invTable(["Sana","Yetkazib beruvchi","Ombor","Xodim","Mahsulotlar",""],body)+'<div class="card"><form data-kind="receipts" data-id="'+ie(x?.id||"")+'"><h3>'+(x?"Kirimni tahrirlash":"Yangi kirim")+'</h3><div class="row3"><label>Sana<input name="received_at" type="date" required value="'+ie(x?.received_at||new Date().toISOString().slice(0,10))+'"></label><label>Yetkazib beruvchi<select name="supplier_id" required>'+invOptions(inv.suppliers.filter(v=>v.active),x?.supplier_id,"Tanlang")+'</select></label><label>Ombor<select name="warehouse_id" required>'+invOptions(inv.warehouses.filter(v=>v.active),x?.warehouse_id,"Tanlang")+'</select></label></div><div class="row"><label>Xodim<select name="employee_id">'+invOptions(inv.employees.filter(v=>v.active),x?.employee_id,"Tanlanmagan")+'</select></label><label>Mahsulot<select name="product_id" required>'+invOptions(inv.products,x?line.product_id:null,"Mahsulotni tanlang",true)+'</select></label></div><div class="row3"><label>Miqdor<input name="quantity" type="number" min="0.01" step="0.01" required value="'+(line.quantity||1)+'"></label><label>Birlik narxi<input name="unit_cost" type="number" min="0" step="0.01" value="'+(line.unit_cost||0)+'"></label><label>Valyuta<select name="currency"><option'+(line.currency!=="UZS"?" selected":"")+'>USD</option><option'+(line.currency==="UZS"?" selected":"")+'>UZS</option></select></label></div><label>Izoh<input name="note" value="'+ie(x?.note||"")+'"></label><div class="bar"><button type="submit">'+(x?"Kirimni saqlash":"Kirimni qayd etish")+'</button>'+(x?'<button type="button" class="ghost" data-cancel>Bekor qilish</button>':"")+'<span class="msg" data-msg></span></div></form></div>';
 }
}
document.getElementById("inventorySections").addEventListener("click",e=>{const b=e.target.closest("[data-inv-section]");if(b){invTab=b.dataset.invSection;invEdit=null;invRender();}});
document.getElementById("inventoryExport").addEventListener("click",async()=>{const r=await iv("/api/admin/inventory.xlsx");if(!r.ok){alert("Excel yuklanmadi: "+r.status);return;}const u=URL.createObjectURL(await r.blob()),a=document.createElement("a");a.href=u;a.download="mastercoffee-inventory.xlsx";a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);});
ir.addEventListener("click",async e=>{
 const edit=e.target.closest("[data-e]");if(edit){invEdit={kind:edit.dataset.e,id:edit.dataset.id};invRender();return;}
 const cancel=e.target.closest("[data-cancel]");if(cancel){invEdit=null;invRender();return;}
 const del=e.target.closest("[data-d]");if(del){if(!confirm("Yozuv o‘chirilsinmi? Kirimni o‘chirish ombor qoldig‘ini ham o‘zgartiradi."))return;const r=await iv("/api/admin/inventory/"+del.dataset.d+"/"+encodeURIComponent(del.dataset.id),{method:"DELETE"});if(!r.ok){alert("O‘chirib bo‘lmadi: "+r.status);return;}invEdit=null;await invLoad();}
});
ir.addEventListener("submit",async e=>{
 const form=e.target.closest("[data-kind]");if(!form)return;e.preventDefault();const kind=form.dataset.kind,id=form.dataset.id,fd=new FormData(form),data=Object.fromEntries(fd.entries());
 if(kind==="employees"||kind==="warehouses"||kind==="suppliers")data.active=form.elements.active?form.elements.active.checked:1;
 if(kind==="receipts"){data.lines=[{product_id:data.product_id,quantity:Number(data.quantity),unit_cost:Number(data.unit_cost),currency:data.currency}];delete data.product_id;delete data.quantity;delete data.unit_cost;delete data.currency;}
 const url="/api/admin/inventory/"+kind+(id?"/"+encodeURIComponent(id):"");
 const r=await iv(url,{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 if(!r.ok){const d=await r.json().catch(()=>({}));form.querySelector("[data-msg]").textContent="Xato: "+(d.detail||r.status);return;}
 invEdit=null;await invLoad();
});
document.addEventListener("click",e=>{if(e.target.closest('[data-tab="inventory"]')){inv=null;initInventory().catch(err=>{if(ir)ir.innerHTML='<p class="err">'+ie(err.message)+'</p>';});}});
