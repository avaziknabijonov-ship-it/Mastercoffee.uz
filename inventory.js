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
function receiptLineRow(x){
 return '<div class="row3 card" data-receipt-line><label>Mahsulot<select data-line-product required>'+invOptions(inv.products,x.product_id,"Mahsulotni tanlang",true)+'</select></label><label>Miqdor<input data-line-qty type="number" min="0.01" step="0.01" required value="'+ie(x.quantity||1)+'"></label><label>Birlik narxi<input data-line-cost type="number" min="0" step="0.01" value="'+ie(x.unit_cost||0)+'"></label><label>Valyuta<select data-line-currency><option'+(x.currency!=="UZS"?" selected":"")+'>USD</option><option'+(x.currency==="UZS"?" selected":"")+'>UZS</option></select></label><button type="button" class="danger" data-remove-line>Qatorni o‘chirish</button></div>';
}
function receiptLinesForm(lines){return '<div data-receipt-lines>'+lines.map(receiptLineRow).join("")+'</div>';}
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
  let lines=x?.lines||[{quantity:1,unit_cost:0,currency:"USD"}];
  ir.innerHTML='<h2>Mahsulot kirimi</h2>'+invTable(["Sana","Yetkazib beruvchi","Ombor","Xodim","Mahsulotlar",""],body)+'<div class="card"><form data-kind="receipts" data-id="'+ie(x?.id||"")+'"><h3>'+(x?"Kirimni tahrirlash":"Yangi kirim")+'</h3><div class="row3"><label>Sana<input name="received_at" type="date" required value="'+ie(x?.received_at||new Date().toISOString().slice(0,10))+'"></label><label>Yetkazib beruvchi<select name="supplier_id" required>'+invOptions(inv.suppliers.filter(v=>v.active),x?.supplier_id,"Tanlang")+'</select></label><label>Ombor<select name="warehouse_id" required>'+invOptions(inv.warehouses.filter(v=>v.active),x?.warehouse_id,"Tanlang")+'</select></label></div><div class="row"><label>Xodim<select name="employee_id">'+invOptions(inv.employees.filter(v=>v.active),x?.employee_id,"Tanlanmagan")+'</select></label><label>Izoh<input name="note" value="'+ie(x?.note||"")+'"></label></div>'+receiptLinesForm(lines)+'<div class="bar"><button type="button" class="ghost" data-add-line>+ Mahsulot qatori</button><button type="submit">'+(x?"Kirimni saqlash":"Kirimni qayd etish")+'</button>'+(x?'<button type="button" class="ghost" data-cancel>Bekor qilish</button>':"")+'<span class="msg" data-msg></span></div></form></div>';
 }}
document.getElementById("inventorySections").addEventListener("click",e=>{const b=e.target.closest("[data-inv-section]");if(b){invTab=b.dataset.invSection;invEdit=null;invRender();}});
document.getElementById("inventoryExport").addEventListener("click",async()=>{const r=await iv("/api/admin/inventory.xlsx");if(!r.ok){alert("Excel yuklanmadi: "+r.status);return;}const u=URL.createObjectURL(await r.blob()),a=document.createElement("a");a.href=u;a.download="mastercoffee-inventory.xlsx";a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);});
ir.addEventListener("click",async e=>{
 const addLine=e.target.closest("[data-add-line]");if(addLine){addLine.closest("form").querySelector("[data-receipt-lines]").insertAdjacentHTML("beforeend",receiptLineRow({quantity:1,unit_cost:0,currency:"USD"}));return;}
 const removeLine=e.target.closest("[data-remove-line]");if(removeLine){const rows=removeLine.closest("[data-receipt-lines]").querySelectorAll("[data-receipt-line]");if(rows.length>1)removeLine.closest("[data-receipt-line]").remove();return;}
 const edit=e.target.closest("[data-e]");if(edit){invEdit={kind:edit.dataset.e,id:edit.dataset.id};invRender();return;}
 const cancel=e.target.closest("[data-cancel]");if(cancel){invEdit=null;invRender();return;}
 const del=e.target.closest("[data-d]");if(del){if(!confirm("Yozuv o‘chirilsinmi? Kirimni o‘chirish ombor qoldig‘ini ham o‘zgartiradi."))return;const r=await iv("/api/admin/inventory/"+del.dataset.d+"/"+encodeURIComponent(del.dataset.id),{method:"DELETE"});if(!r.ok){alert("O‘chirib bo‘lmadi: "+r.status);return;}invEdit=null;await invLoad();}
});
ir.addEventListener("submit",async e=>{
 const form=e.target.closest("[data-kind]");if(!form)return;e.preventDefault();const kind=form.dataset.kind,id=form.dataset.id,fd=new FormData(form),data=Object.fromEntries(fd.entries());
 if(kind==="employees"||kind==="warehouses"||kind==="suppliers")data.active=form.elements.active?form.elements.active.checked:1;
 if(kind==="receipts"){data.lines=Array.from(form.querySelectorAll("[data-receipt-line]")).map(row=>({product_id:row.querySelector("[data-line-product]").value,quantity:Number(row.querySelector("[data-line-qty]").value),unit_cost:Number(row.querySelector("[data-line-cost]").value),currency:row.querySelector("[data-line-currency]").value}));}
 const url="/api/admin/inventory/"+kind+(id?"/"+encodeURIComponent(id):"");
 const r=await iv(url,{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 if(!r.ok){const d=await r.json().catch(()=>({}));form.querySelector("[data-msg]").textContent="Xato: "+(d.detail||r.status);return;}
 invEdit=null;await invLoad();
});
document.addEventListener("click",e=>{if(e.target.closest('[data-tab="inventory"]')){inv=null;initInventory().catch(err=>{if(ir)ir.innerHTML='<p class="err">'+ie(err.message)+'</p>';});}});
