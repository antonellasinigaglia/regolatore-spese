const KEY="regolatore-spese-v1";
const defaultState={
  income:3000,savings:1000,
  categories:[
    ["Affitto",700],["Trasporti",185],["Mounjaro",300],["Yasminelle",30],
    ["Luce",80],["Telefono + internet",30],["Alimentari",250],["Gatti",70],
    ["Auto",70],["ChatGPT Go",7.99],["Casa + igiene",40],["Acquisti online",100],
    ["Svago",20],["Salute extra",25]
  ].map(([name,budget])=>({id:crypto.randomUUID(),name,budget,active:true})),
  expenses:[],
  annual:[{id:crypto.randomUUID(),name:"Prime Video",amount:49,date:"",note:"Pagamento unico annuale"}],
  subscriptions:[
    {id:crypto.randomUUID(),name:"ChatGPT Go",amount:7.99,frequency:"mensile",active:true},
    {id:crypto.randomUUID(),name:"Prime Video",amount:49,frequency:"annuale",active:true},
    {id:crypto.randomUUID(),name:"Netflix",amount:0,frequency:"",active:false},
    {id:crypto.randomUUID(),name:"Integratori",amount:0,frequency:"",active:false}
  ]
};
let state=load(), page="dashboard";
function load(){try{return JSON.parse(localStorage.getItem(KEY))||defaultState}catch(e){return defaultState}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
const money=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(n)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function spent(id){return state.expenses.filter(x=>x.categoryId===id).reduce((a,x)=>a+Number(x.amount),0)}
function totalBudget(){return state.categories.filter(c=>c.active).reduce((a,c)=>a+Number(c.budget),0)}
function cushion(){return state.income-state.savings-totalBudget()}
function fmtDate(d){return d?new Date(d+"T12:00:00").toLocaleDateString("it-IT"): ""}
function nav(){return `<div class="nav">${["dashboard","spese","budget","annuali","impostazioni"].map(p=>`<button class="${page===p?"active":""}" onclick="go('${p}')">${({dashboard:"Dashboard",spese:"Spese",budget:"Budget",annuali:"Annuali",impostazioni:"Impostazioni"})[p]}</button>`).join("")}</div>`}
function render(){document.getElementById("app").innerHTML=`<main class="shell"><div class="top"><div class="brand">Regolatore spese</div><button class="primary" onclick="addExpense()">+ Spesa</button></div>${nav()}${page==="dashboard"?dashboard():page==="spese"?expensesPage():page==="budget"?budgetPage():page==="annuali"?annualPage():settingsPage()}</main>`}
function dashboard(){
 const available=state.income-state.savings-totalSpent();
 const week=state.income-state.savings-totalSpent(); 
 return `<div class="hero"><small>Budget operativo</small><h1>${money(state.income-state.savings)}</h1><span>€1.000 accantonati ogni mese</span></div>
 <div class="grid">
 <div class="card"><div class="label">Entrate</div><div class="value">${money(state.income)}</div></div>
 <div class="card"><div class="label">Risparmio</div><div class="value">${money(state.savings)}</div></div>
 <div class="card"><div class="label">Speso</div><div class="value">${money(totalSpent())}</div></div>
 <div class="card"><div class="label">Budget residuo</div><div class="value">${money(available)}</div></div>
 <div class="card"><div class="label">Cuscinetto</div><div class="value ${cushion()<0?"danger":""}">${money(cushion())}</div></div>
 <div class="card"><div class="label">Spese registrate</div><div class="value">${state.expenses.length}</div></div>
 </div>

 <div class="section"><h2>Budget categorie</h2>${state.categories.filter(c=>c.active).map(c=>catRow(c)).join("")}</div>`
}
function totalSpent(){return state.expenses.reduce((a,x)=>a+Number(x.amount),0)}
function catRow(c){let s=spent(c.id), pct=c.budget?Math.min(100,s/c.budget*100):0;return `<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">${money(s)} di ${money(c.budget)} · residuo ${money(c.budget-s)}</div><div class="bar"><i style="width:${pct}%"></i></div></div><span>${pct>100?"⚠":""}</span></div>`}
function expensesPage(){
 return `<div class="section"><h2>Spese</h2><div class="actions"><button class="primary" onclick="addExpense()">+ Aggiungi spesa</button><button class="secondary" onclick="exportCSV()">Esporta CSV</button></div>
 ${state.expenses.length?state.expenses.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=>{let c=state.categories.find(x=>x.id===e.categoryId);return `<div class="expense"><div class="desc">${esc(e.description||"Spesa")}</div><div class="amount">${money(e.amount)}</div><div class="meta">${fmtDate(e.date)} · ${esc(c?.name||"Categoria archiviata")} <button class="secondary" style="padding:3px 7px;margin-left:6px" onclick="deleteExpense('${e.id}')">Elimina</button></div></div>`}).join(""):`<div class="empty">Nessuna spesa registrata.</div>`}</div>`
}
function budgetPage(){
 const active=state.categories.filter(c=>c.active);
 const archived=state.categories.filter(c=>!c.active);
 return `<div class="section"><div class="actions"><button class="primary" onclick="addCategory()">+ Categoria</button></div><div class="section">${active.map(c=>`<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">Attiva · speso ${money(spent(c.id))}</div></div><span>${money(c.budget)}</span><button class="secondary" onclick="editCategory('${c.id}')">Modifica</button></div>`).join("") || `<div class="empty">Nessuna categoria attiva.</div>`}</div>${archived.length?`<div class="section"><details><summary class="muted" style="cursor:pointer">Categorie archiviate (${archived.length})</summary><div style="margin-top:12px">${archived.map(c=>`<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">Archiviata · speso ${money(spent(c.id))}</div></div><span>${money(c.budget)}</span><button class="secondary" onclick="editCategory('${c.id}')">Riattiva</button></div>`).join("")}</div></details></div>`:""}`
}`
function annualPage(){
 return `<div class="section"><h2>Spese annuali</h2><p class="muted">Queste spese non entrano nel budget mensile.</p>${state.annual.map(a=>`<div class="row"><div><b>${esc(a.name)}</b><div class="muted">${a.date?fmtDate(a.date):"Data da inserire"} · ${esc(a.note)}</div></div><b>${money(a.amount)}</b></div>`).join("")}</div>`
}
function settingsPage(){
 return `<div class="section"><h2>Impostazioni</h2><div class="form settings">
 <div class="field"><label>Entrate mensili</label><input id="income" type="number" step="0.01" value="${state.income}"></div>
 <div class="field"><label>Risparmio mensile</label><input id="savings" type="number" step="0.01" value="${state.savings}"></div>
 <button class="primary" onclick="saveSettings()">Salva impostazioni</button>
 <div class="actions"><button class="secondary" onclick="exportJSON()">Backup JSON</button><button class="secondary" onclick="document.getElementById('importFile').click()">Importa JSON</button><input id="importFile" type="file" accept=".json" hidden onchange="importJSON(event)"></div>
 <button class="secondary" onclick="resetData()">Ripristina dati iniziali</button></div>
 <div class="section"><h2>Abbonamenti</h2>${state.subscriptions.map(s=>`<div class="row"><div><b>${esc(s.name)}</b><div class="muted">${s.active?"Attivo":"Disdetto"} · ${s.frequency}</div></div><span>${money(s.amount)}</span></div>`).join("")}</div>`
}
function go(p){page=p;render()}
function addExpense(){
 const active=state.categories.filter(c=>c.active);
 document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Aggiungi spesa</h2><div class="form">
 <div class="field"><label>Data</label><input id="fdate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
 <div class="field"><label>Categoria</label><select id="fcat">${active.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
 <div class="field"><label>Descrizione</label><input id="fdesc" placeholder="Es. supermercato"></div>
 <div class="field"><label>Importo €</label><input id="famount" type="number" min="0" step="0.01" placeholder="0,00"></div>
 <div class="actions"><button class="primary" onclick="confirmExpense()">Salva</button><button class="secondary" onclick="closeModal()">Annulla</button></div>
 </div></div></div>`)
}
function confirmExpense(){let amount=Number(document.getElementById("famount").value);if(!amount||amount<0)return alert("Inserisci un importo valido.");state.expenses.push({id:crypto.randomUUID(),date:document.getElementById("fdate").value,categoryId:document.getElementById("fcat").value,description:document.getElementById("fdesc").value.trim(),amount});save();closeModal();render()}
function deleteExpense(id){if(confirm("Eliminare questa spesa?")){state.expenses=state.expenses.filter(x=>x.id!==id);save();render()}}
function addCategory(){
 document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Nuova categoria</h2><div class="form"><div class="field"><label>Nome</label><input id="cname"></div><div class="field"><label>Budget mensile €</label><input id="cbudget" type="number" step="0.01"></div><div class="actions"><button class="primary" onclick="confirmCategory()">Crea</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)
}
function confirmCategory(){let n=document.getElementById("cname").value.trim(),b=Number(document.getElementById("cbudget").value);if(!n||b<0)return alert("Inserisci nome e budget.");state.categories.push({id:crypto.randomUUID(),name:n,budget:b,active:true});save();closeModal();render()}
function editCategory(id){
 let c=state.categories.find(x=>x.id===id);
 document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Modifica categoria</h2><div class="form"><div class="field"><label>Nome</label><input id="cname" value="${esc(c.name)}"></div><div class="field"><label>Budget mensile €</label><input id="cbudget" type="number" step="0.01" value="${c.budget}"></div><div class="actions"><button class="primary" onclick="updateCategory('${id}')">Salva</button><button class="secondary" onclick="archiveCategory('${id}')">${c.active?"Archivia":"Riattiva"}</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)
}
function updateCategory(id){let c=state.categories.find(x=>x.id===id);c.name=document.getElementById("cname").value.trim()||c.name;c.budget=Number(document.getElementById("cbudget").value)||0;save();closeModal();render()}
function archiveCategory(id){let c=state.categories.find(x=>x.id===id);c.active=!c.active;save();closeModal();render()}
function saveSettings(){state.income=Number(document.getElementById("income").value)||0;state.savings=Number(document.getElementById("savings").value)||0;save();render()}
function closeModal(){document.getElementById("modal")?.remove()}
function exportJSON(){download("regolatore-backup.json",JSON.stringify(state,null,2),"application/json")}
function importJSON(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{state=JSON.parse(r.result);save();render()}catch{alert("Backup non valido.")}};r.readAsText(f)}
function exportCSV(){let lines=[["Data","Categoria","Descrizione","Importo"].join(";")];state.expenses.forEach(e=>{let c=state.categories.find(x=>x.id===e.categoryId);lines.push([e.date,c?.name||"Categoria archiviata",e.description,e.amount].map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";"))});download("spese.csv","\uFEFF"+lines.join("\n"),"text/csv")}
function download(name,data,type){let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
function resetData(){if(confirm("Ripristinare i dati iniziali? Le spese attuali verranno cancellate.")){localStorage.removeItem(KEY);state=load();render()}}
render();
