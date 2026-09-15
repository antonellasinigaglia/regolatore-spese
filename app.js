const SUPABASE_URL="https://qilylafyygmxgtwgosvt.supabase.co";
const SUPABASE_KEY="sb_publishable_45w093agTkMtioWxrvsBIQ_QjzcWKO9";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const KEY="regolatore-spese-v2";

const defaultCategories=[
  ["Affitto",700],["Trasporti",185],["Mounjaro",300],["Yasminelle",30],
  ["Luce",80],["Telefono + internet",30],["Alimentari",250],["Gatti",70],
  ["Auto",70],["ChatGPT Go",7.99],["Casa + igiene",40],["Acquisti online",100],
  ["Svago",20],["Salute extra",25]
];
const defaultSubscriptions=[
  ["ChatGPT Go",7.99,"mensile",true],["Prime Video",49,"annuale",true],
  ["Netflix",0,"",false],["Integratori",0,"",false]
];
let state={income:3000,savings:1000,categories:[],expenses:[],annual:[],subscriptions:[],month:null};
let page="dashboard";
let currentUser=null;
let currentMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);

const money=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(n)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function monthKey(d=currentMonth){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`}
function monthLabel(d=currentMonth){return d.toLocaleDateString("it-IT",{month:"long",year:"numeric"}).replace(/^./,m=>m.toUpperCase())}
function spent(id){const month=monthKey().slice(0,7);return state.expenses.filter(x=>x.categoryId===id&&x.date?.slice(0,7)===month).reduce((a,x)=>a+Number(x.amount),0)}
function totalBudget(){return state.categories.filter(c=>c.active).reduce((a,c)=>a+Number(c.budget),0)}
function totalSpent(){return state.expenses.filter(x=>x.date?.slice(0,7)===monthKey().slice(0,7)).reduce((a,x)=>a+Number(x.amount),0)}
function cushion(){return state.income-state.savings-totalBudget()}
function fmtDate(d){return d?new Date(d+"T12:00:00").toLocaleDateString("it-IT"):""}
function cache(){localStorage.setItem(KEY,JSON.stringify(state))}
function nav(){return `<div class="nav">${["dashboard","spese","budget","annuali","impostazioni"].map(p=>`<button class="${page===p?"active":""}" onclick="go('${p}')">${({dashboard:"Dashboard",spese:"Spese",budget:"Budget",annuali:"Annuali",impostazioni:"Impostazioni"})[p]}</button>`).join("")}</div>`}
function monthNav(){
  const base=new Date(new Date().getFullYear()-1,0,1);
  const months=Array.from({length:36},(_,i)=>new Date(base.getFullYear(),i,1));
  return `<div class="month-nav"><label for="monthSelect" class="muted">Mensilità</label><select id="monthSelect" onchange="selectMonth(this.value)">${months.map(d=>`<option value="${monthKey(d)}" ${monthKey(d)===monthKey()?"selected":""}>${esc(monthLabel(d))}</option>`).join("")}</select></div>`;
}

function loginPage(message=""){
  return `<main class="shell"><div class="top"><div class="brand">Regolatore spese</div></div><div class="section" style="max-width:620px;margin:50px auto"><h2>Impossibile avviare l'app</h2><p class="muted">${esc(message||"Errore di inizializzazione.")}</p></div></main>`;
}
function renderLogin(message=""){document.getElementById("app").innerHTML=loginPage(message)}
async function signIn(){return}
async function signUp(){return}
async function anonymousLogin(){const {error}=await db.auth.signInAnonymously();if(error)return renderLogin(error.message);await startApp()}
async function signOut(){return}

async function startApp(){
  const {data}=await db.auth.getSession();
  currentUser=data.session?.user||null;
  if(!currentUser){
    const {data:anonymousData,error}=await db.auth.signInAnonymously();
    if(error){console.error(error);return renderLogin("Non riesco ad avviare la sessione anonima. Verifica che gli accessi anonimi siano abilitati in Supabase.")}
    currentUser=anonymousData.user;
  }
  try{await loadFromDB();render()}catch(e){console.error(e);renderLogin("Non riesco a caricare i dati dal database: "+e.message)}
}

async function ensureMonthlySettings(uid){
  const key=monthKey();
  const {data,error}=await db.from("monthly_settings").select("income,savings").eq("user_id",uid).eq("month",key).maybeSingle();
  if(error)throw error;
  if(data)return data;
  const previous=new Date(currentMonth);previous.setMonth(previous.getMonth()-1);
  const previousKey=monthKey(previous);
  const prev=await db.from("monthly_settings").select("income,savings").eq("user_id",uid).eq("month",previousKey).maybeSingle();
  if(prev.error)throw prev.error;
  let income=Number(prev.data?.income??0);
  let savings=Number(prev.data?.savings??0);
  if(!prev.data){
    const legacy=await db.from("settings").select("income,savings").eq("user_id",uid).maybeSingle();
    if(legacy.error)throw legacy.error;
    income=Number(legacy.data?.income??3000);
    savings=Number(legacy.data?.savings??1000);
  }
  const created=await db.from("monthly_settings").insert({user_id:uid,month:key,income,savings}).select("income,savings").single();
  if(created.error)throw created.error;
  return created.data;
}

async function loadFromDB(){
  const uid=currentUser.id;
  const [monthly,categories,expenses,annual,subscriptions]=await Promise.all([
    ensureMonthlySettings(uid),
    db.from("categories").select("id,name,budget,active,due_day,due_date").eq("user_id",uid).order("name"),
    db.from("expenses").select("id,date,category_id,description,amount").eq("user_id",uid).order("date",{ascending:false}),
    db.from("annual_expenses").select("id,name,amount,date,note").eq("user_id",uid).order("name"),
    db.from("subscriptions").select("id,name,amount,frequency,active").eq("user_id",uid).order("name")
  ]);
  for(const r of [monthly,categories,expenses,annual,subscriptions])if(r.error)throw r.error;
  if(!categories.data.length&&!expenses.data.length&&!annual.data.length&&!subscriptions.data.length){
    await seedDefaults(uid);
    return loadFromDB();
  }
  state={
    income:Number(monthly.income??3000),
    savings:Number(monthly.savings??1000),
    month:monthKey(),
    categories:(categories.data||[]).map(c=>({id:c.id,name:c.name,budget:Number(c.budget),active:c.active,dueDay:Number(c.due_day||c.due_date?.slice(8,10)||0)||null})),
    expenses:(expenses.data||[]).map(e=>({id:e.id,date:e.date,categoryId:e.category_id,description:e.description,amount:Number(e.amount)})),
    annual:(annual.data||[]).map(a=>({id:a.id,name:a.name,amount:Number(a.amount),date:a.date||"",note:a.note||""})),
    subscriptions:(subscriptions.data||[]).map(s=>({id:s.id,name:s.name,amount:Number(s.amount),frequency:s.frequency||"",active:s.active}))
  };
  cache();
}

async function seedDefaults(uid){
  const categories=defaultCategories.map(([name,budget])=>({id:crypto.randomUUID(),user_id:uid,name,budget,active:true,due_day:null}));
  const annual=[{id:crypto.randomUUID(),user_id:uid,name:"Prime Video",amount:49,date:null,note:"Pagamento unico annuale"}];
  const subscriptions=defaultSubscriptions.map(([name,amount,frequency,active])=>({id:crypto.randomUUID(),user_id:uid,name,amount,frequency,active}));
  for(const [table,rows] of [["categories",categories],["annual_expenses",annual],["subscriptions",subscriptions]]){const {error}=await db.from(table).insert(rows);if(error)throw error;}
}

function render(){
  document.getElementById("app").innerHTML=`<main class="shell"><div class="top"><div class="brand">Regolatore spese</div><div class="actions"><button class="primary" onclick="addExpense()">+ Spesa</button></div></div>${nav()}${page==="dashboard"?dashboard():page==="spese"?expensesPage():page==="budget"?budgetPage():page==="annuali"?annualPage():settingsPage()}</main>`;
}

function dashboard(){
 const available=state.income-state.savings-totalSpent();
 return `${monthNav()}<div class="hero"><small>Budget operativo</small><h1>${money(state.income-state.savings)}</h1><span>${money(state.savings)} accantonati nel mese</span></div>
 <div class="grid"><div class="card"><div class="label">Entrate</div><div class="value">${money(state.income)}</div></div><div class="card"><div class="label">Risparmio</div><div class="value">${money(state.savings)}</div></div><div class="card"><div class="label">Speso</div><div class="value">${money(totalSpent())}</div></div><div class="card"><div class="label">Budget residuo</div><div class="value">${money(available)}</div></div><div class="card"><div class="label">Cuscinetto</div><div class="value ${cushion()<0?"danger":""}">${money(cushion())}</div></div><div class="card"><div class="label">Spese registrate</div><div class="value">${state.expenses.filter(x=>x.date?.slice(0,7)===monthKey().slice(0,7)).length}</div></div></div>
 <div class="section upcoming-section"><h2>Spese imminenti</h2>${upcomingExpenses()}</div>
 <div class="section"><h2>Budget categorie</h2>${state.categories.filter(c=>c.active).map(catRow).join("")||`<div class="empty">Nessuna categoria attiva.</div>`}</div>`;
}
function catRow(c){let s=spent(c.id),pct=c.budget?Math.min(100,s/c.budget*100):0;return `<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">${money(s)} di ${money(c.budget)} · residuo ${money(c.budget-s)}</div><div class="bar"><i style="width:${pct}%"></i></div></div><span>${s>c.budget?"⚠":""}</span></div>`}

function nextDueDate(day,from=new Date()){
  if(!day)return null;
  const today=new Date(from.getFullYear(),from.getMonth(),from.getDate());
  const d=new Date(from.getFullYear(),from.getMonth(),Math.min(day,new Date(from.getFullYear(),from.getMonth()+1,0).getDate()));
  if(d<today){
    const nextMonth=new Date(from.getFullYear(),from.getMonth()+1,1);
    d.setFullYear(nextMonth.getFullYear(),nextMonth.getMonth(),Math.min(day,new Date(nextMonth.getFullYear(),nextMonth.getMonth()+1,0).getDate()));
  }
  return d;
}
function daysUntil(d){const today=new Date();const a=new Date(today.getFullYear(),today.getMonth(),today.getDate());const b=new Date(d.getFullYear(),d.getMonth(),d.getDate());return Math.round((b-a)/86400000)}
function upcomingExpenses(){
  const items=state.categories.filter(c=>c.active&&c.dueDay).map(c=>{const date=nextDueDate(c.dueDay);return {c,date,days:daysUntil(date)}}).filter(x=>x.days>=0&&x.days<=5).sort((a,b)=>a.date-b.date);
  if(!items.length)return `<div class="empty">Nessuna spesa imminente.</div>`;
  return items.map(({c,date,days})=>`<div class="row upcoming-row"><div class="upcoming-date">${fmtDate(date.toISOString().slice(0,10))}</div><b class="upcoming-name">${esc(c.name)}</b><span class="upcoming-amount">${money(c.budget)}</span><span class="muted upcoming-days">${days===0?"oggi":days===1?"domani":`-${days} giorni`}</span></div>`).join("");
}

function expensesPage(){const month=monthKey().slice(0,7);const list=state.expenses.filter(e=>e.date?.slice(0,7)===month);return `${monthNav()}<div class="section"><h2>Spese</h2><div class="actions"><button class="primary" onclick="addExpense()">+ Aggiungi spesa</button><button class="secondary" onclick="exportCSV()">Esporta CSV</button></div>${list.length?list.map(e=>{let c=state.categories.find(x=>x.id===e.categoryId);return `<div class="expense"><div class="desc">${esc(e.description||"Spesa")}</div><div class="amount">${money(e.amount)}</div><div class="meta">${fmtDate(e.date)} · ${esc(c?.name||"Categoria archiviata")} <button class="secondary" style="padding:3px 7px;margin-left:6px" onclick="deleteExpense('${e.id}')">Elimina</button></div></div>`}).join(""):`<div class="empty">Nessuna spesa registrata per ${esc(monthLabel())}.</div>`}</div>`}
function budgetPage(){const active=state.categories.filter(c=>c.active),archived=state.categories.filter(c=>!c.active);const activeHtml=active.map(c=>`<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">Attiva · speso ${money(spent(c.id))}${c.dueDay?` · ricorrente il ${String(c.dueDay).padStart(2,"0")} del mese`:""}</div></div><span>${money(c.budget)}</span><button class="secondary" onclick="editCategory('${c.id}')">Modifica</button></div>`).join("")||`<div class="empty">Nessuna categoria attiva.</div>`;const archivedHtml=archived.length?`<div class="section"><details><summary class="muted" style="cursor:pointer">Categorie archiviate (${archived.length})</summary><div style="margin-top:12px">${archived.map(c=>`<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">Archiviata · speso ${money(spent(c.id))}${c.dueDay?` · ricorrente il ${String(c.dueDay).padStart(2,"0")} del mese`:""}</div></div><span>${money(c.budget)}</span><button class="secondary" onclick="editCategory('${c.id}')">Riattiva</button></div>`).join("")}</div></details></div>`:"";return `${monthNav()}<div class="section"><div class="actions"><button class="primary" onclick="addCategory()">+ Categoria</button></div><div class="section">${activeHtml}</div>${archivedHtml}</div>`}
function annualPage(){return `<div class="section"><h2>Spese annuali</h2><p class="muted">Queste spese non entrano nel budget mensile.</p>${state.annual.map(a=>`<div class="row"><div><b>${esc(a.name)}</b><div class="muted">${a.date?fmtDate(a.date):"Data da inserire"} · ${esc(a.note)}</div></div><b>${money(a.amount)}</b></div>`).join("")}</div>`}
function settingsPage(){return `${monthNav()}<div class="section"><h2>Impostazioni</h2><div class="form settings"><div class="field"><label>Entrate di ${esc(monthLabel())}</label><input id="income" type="number" step="0.01" value="${state.income}"></div><div class="field"><label>Risparmio di ${esc(monthLabel())}</label><input id="savings" type="number" step="0.01" value="${state.savings}"></div><button class="primary" onclick="saveSettings()">Salva impostazioni</button><div class="actions"><button class="secondary" onclick="exportJSON()">Backup JSON</button><button class="secondary" onclick="document.getElementById('importFile').click()">Importa JSON</button><input id="importFile" type="file" accept=".json" hidden onchange="importJSON(event)"></div></div><div class="section"><h2>Abbonamenti</h2>${state.subscriptions.map(s=>`<div class="row"><div><b>${esc(s.name)}</b><div class="muted">${s.active?"Attivo":"Disdetto"} · ${esc(s.frequency)}</div></div><span>${money(s.amount)}</span></div>`).join("")}</div></div>`}
function go(p){page=p;render()}
async function selectMonth(value){
  const [year,month]=value.split("-").map(Number);
  currentMonth=new Date(year,month-1,1);
  try{await loadFromDB();render()}catch(e){alert(e.message)}
}
function addExpense(){const active=state.categories.filter(c=>c.active);document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Aggiungi spesa</h2><div class="form"><div class="field"><label>Data</label><input id="fdate" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Categoria</label><select id="fcat">${active.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><div class="field"><label>Descrizione</label><input id="fdesc" placeholder="Es. supermercato"></div><div class="field"><label>Importo €</label><input id="famount" type="number" min="0" step="0.01" placeholder="0,00"></div><div class="actions"><button class="primary" onclick="confirmExpense()">Salva</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)}
async function confirmExpense(){const amount=Number(document.getElementById("famount").value);if(!amount||amount<0)return alert("Inserisci un importo valido.");const row={id:crypto.randomUUID(),user_id:currentUser.id,date:document.getElementById("fdate").value,category_id:document.getElementById("fcat").value,description:document.getElementById("fdesc").value.trim(),amount};const {error}=await db.from("expenses").insert(row);if(error)return alert(error.message);closeModal();await loadFromDB();render()}
async function deleteExpense(id){if(!confirm("Eliminare questa spesa?"))return;const {error}=await db.from("expenses").delete().eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);await loadFromDB();render()}
function addCategory(){document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Nuova categoria</h2><div class="form"><div class="field"><label>Nome</label><input id="cname"></div><div class="field"><label>Budget mensile €</label><input id="cbudget" type="number" step="0.01"></div><div class="field"><label>Ricorrente il giorno del mese</label><input id="cday" type="number" min="1" max="31" placeholder="Es. 1"></div><div class="actions"><button class="primary" onclick="confirmCategory()">Crea</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)}
async function confirmCategory(){let n=document.getElementById("cname").value.trim(),b=Number(document.getElementById("cbudget").value),day=Number(document.getElementById("cday").value)||null;if(!n||b<0)return alert("Inserisci nome e budget.");if(day!==null&&(day<1||day>31))return alert("Il giorno deve essere tra 1 e 31.");const {error}=await db.from("categories").insert({id:crypto.randomUUID(),user_id:currentUser.id,name:n,budget:b,active:true,due_day:day});if(error)return alert(error.message);closeModal();await loadFromDB();render()}
function editCategory(id){let c=state.categories.find(x=>x.id===id);document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Modifica categoria</h2><div class="form"><div class="field"><label>Nome</label><input id="cname" value="${esc(c.name)}"></div><div class="field"><label>Budget mensile €</label><input id="cbudget" type="number" step="0.01" value="${c.budget}"></div><div class="field"><label>Ricorrente il giorno del mese</label><input id="cday" type="number" min="1" max="31" value="${c.dueDay||""}" placeholder="Es. 1"></div><div class="actions"><button class="primary" onclick="updateCategory('${id}')">Salva</button><button class="secondary" onclick="archiveCategory('${id}')">${c.active?"Archivia":"Riattiva"}</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)}
async function updateCategory(id){let c=state.categories.find(x=>x.id===id),name=document.getElementById("cname").value.trim()||c.name,budget=Number(document.getElementById("cbudget").value)||0,day=Number(document.getElementById("cday").value)||null;if(day!==null&&(day<1||day>31))return alert("Il giorno deve essere tra 1 e 31.");const {error}=await db.from("categories").update({name,budget,due_day:day}).eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);closeModal();await loadFromDB();render()}
async function archiveCategory(id){let c=state.categories.find(x=>x.id===id);const {error}=await db.from("categories").update({active:!c.active}).eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);closeModal();await loadFromDB();render()}
async function saveSettings(){const income=Number(document.getElementById("income").value)||0,savings=Number(document.getElementById("savings").value)||0;const {error}=await db.from("monthly_settings").upsert({user_id:currentUser.id,month:monthKey(),income,savings},{onConflict:"user_id,month"});if(error)return alert(error.message);await loadFromDB();render()}
function closeModal(){document.getElementById("modal")?.remove()}
function exportJSON(){download("regolatore-backup.json",JSON.stringify(state,null,2),"application/json")}
async function importJSON(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=async()=>{try{const imported=JSON.parse(r.result);if(!confirm("Sostituire i dati attuali con il backup?"))return;await replaceAllData(imported);await loadFromDB();render()}catch(err){alert("Backup non valido: "+err.message)}};r.readAsText(f)}
async function replaceAllData(s){const uid=currentUser.id;for(const table of ["expenses","annual_expenses","subscriptions","categories"]){const {error}=await db.from(table).delete().eq("user_id",uid);if(error)throw error}await db.from("monthly_settings").delete().eq("user_id",uid);await db.from("monthly_settings").insert({user_id:uid,month:monthKey(),income:Number(s.income)||0,savings:Number(s.savings)||0});if(s.categories?.length)await db.from("categories").insert(s.categories.map(c=>({id:c.id,user_id:uid,name:c.name,budget:Number(c.budget)||0,active:!!c.active,due_day:Number(c.dueDay)||null})));if(s.expenses?.length)await db.from("expenses").insert(s.expenses.map(e=>({id:e.id,user_id:uid,date:e.date,category_id:e.categoryId,description:e.description||"",amount:Number(e.amount)||0})));if(s.annual?.length)await db.from("annual_expenses").insert(s.annual.map(a=>({id:a.id,user_id:uid,name:a.name,amount:Number(a.amount)||0,date:a.date||null,note:a.note||""})));if(s.subscriptions?.length)await db.from("subscriptions").insert(s.subscriptions.map(x=>({id:x.id,user_id:uid,name:x.name,amount:Number(x.amount)||0,frequency:x.frequency||"",active:!!x.active}))) }
function exportCSV(){let lines=[["Data","Categoria","Descrizione","Importo"].join(";")];state.expenses.filter(e=>e.date?.slice(0,7)===monthKey().slice(0,7)).forEach(e=>{let c=state.categories.find(x=>x.id===e.categoryId);lines.push([e.date,c?.name||"Categoria archiviata",e.description,e.amount].map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";"))});download("spese.csv","\uFEFF"+lines.join("\n"),"text/csv")}
function download(name,data,type){let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
async function resetData(){if(!confirm("Ripristinare i dati iniziali? Le spese attuali verranno cancellate."))return;try{await replaceAllData({income:3000,savings:1000,categories:defaultCategories.map(([name,budget])=>({id:crypto.randomUUID(),name,budget,active:true,dueDay:null})),expenses:[],annual:[{id:crypto.randomUUID(),name:"Prime Video",amount:49,date:"",note:"Pagamento unico annuale"}],subscriptions:defaultSubscriptions.map(([name,amount,frequency,active])=>({id:crypto.randomUUID(),name,amount,frequency,active}))});await loadFromDB();render()}catch(e){alert(e.message)}}

startApp();