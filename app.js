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
let state={income:3000,savings:1000,categories:[],expenses:[],annual:[],subscriptions:[]};
let page="dashboard";
let currentUser=null;

const money=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(n)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function spent(id){return state.expenses.filter(x=>x.categoryId===id).reduce((a,x)=>a+Number(x.amount),0)}
function totalBudget(){return state.categories.filter(c=>c.active).reduce((a,c)=>a+Number(c.budget),0)}
function totalSpent(){return state.expenses.reduce((a,x)=>a+Number(x.amount),0)}
function cushion(){return state.income-state.savings-totalBudget()}
function fmtDate(d){return d?new Date(d+"T12:00:00").toLocaleDateString("it-IT"):""}
function cache(){localStorage.setItem(KEY,JSON.stringify(state))}
function nav(){return `<div class="nav">${["dashboard","spese","budget","annuali","impostazioni"].map(p=>`<button class="${page===p?"active":""}" onclick="go('${p}')">${({dashboard:"Dashboard",spese:"Spese",budget:"Budget",annuali:"Annuali",impostazioni:"Impostazioni"})[p]}</button>`).join("")}</div>`}

function loginPage(message=""){
  return `<main class="shell"><div class="top"><div class="brand">Regolatore spese</div></div>
  <div class="section" style="max-width:520px;margin:50px auto">
    <h2>Accedi al tuo regolatore</h2>
    <p class="muted">Usa lo stesso account su Mac e telefono. I dati vengono salvati nel database.</p>
    ${message?`<div class="empty" style="margin:16px 0">${esc(message)}</div>`:""}
    <div class="form">
      <div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="La tua email"></div>
      <div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="current-password" placeholder="Almeno 6 caratteri"></div>
      <div class="actions"><button class="primary" onclick="signIn()">Accedi</button><button class="secondary" onclick="signUp()">Crea account</button></div>
      <button class="secondary" onclick="anonymousLogin()">Continua senza account, solo su questo dispositivo</button>
    </div>
  </div></main>`;
}

async function signIn(){
  const email=document.getElementById("authEmail").value.trim();
  const password=document.getElementById("authPassword").value;
  if(!email||!password)return renderLogin("Inserisci email e password.");
  const {error}=await db.auth.signInWithPassword({email,password});
  if(error)return renderLogin(error.message);
  await startApp();
}
async function signUp(){
  const email=document.getElementById("authEmail").value.trim();
  const password=document.getElementById("authPassword").value;
  if(!email||password.length<6)return renderLogin("Inserisci un'email e una password di almeno 6 caratteri.");
  const {data,error}=await db.auth.signUp({email,password});
  if(error)return renderLogin(error.message);
  if(!data.session)return renderLogin("Account creato. Controlla la tua email per confermare l'account, poi accedi.");
  await startApp();
}
async function anonymousLogin(){
  const {error}=await db.auth.signInAnonymously();
  if(error)return renderLogin(error.message);
  await startApp();
}
async function signOut(){await db.auth.signOut();currentUser=null;renderLogin("Sessione chiusa.")}
function renderLogin(message=""){document.getElementById("app").innerHTML=loginPage(message)}

async function startApp(){
  const {data}=await db.auth.getUser();
  currentUser=data.user;
  if(!currentUser)return renderLogin();
  try{await loadFromDB();render()}catch(e){console.error(e);renderLogin("Non riesco a caricare i dati dal database: "+e.message)}
}

async function loadFromDB(){
  const uid=currentUser.id;
  const [settings,categories,expenses,annual,subscriptions]=await Promise.all([
    db.from("settings").select("income,savings").eq("user_id",uid).maybeSingle(),
    db.from("categories").select("id,name,budget,active").eq("user_id",uid).order("name"),
    db.from("expenses").select("id,date,category_id,description,amount").eq("user_id",uid).order("date",{ascending:false}),
    db.from("annual_expenses").select("id,name,amount,date,note").eq("user_id",uid).order("name"),
    db.from("subscriptions").select("id,name,amount,frequency,active").eq("user_id",uid).order("name")
  ]);
  for(const r of [settings,categories,expenses,annual,subscriptions])if(r.error)throw r.error;
  if(!settings.data&&!categories.data.length&&!expenses.data.length&&!annual.data.length&&!subscriptions.data.length){
    await seedDefaults(uid);
    return loadFromDB();
  }
  state={
    income:Number(settings.data?.income??3000),
    savings:Number(settings.data?.savings??1000),
    categories:(categories.data||[]).map(c=>({id:c.id,name:c.name,budget:Number(c.budget),active:c.active})),
    expenses:(expenses.data||[]).map(e=>({id:e.id,date:e.date,categoryId:e.category_id,description:e.description,amount:Number(e.amount)})),
    annual:(annual.data||[]).map(a=>({id:a.id,name:a.name,amount:Number(a.amount),date:a.date||"",note:a.note||""})),
    subscriptions:(subscriptions.data||[]).map(s=>({id:s.id,name:s.name,amount:Number(s.amount),frequency:s.frequency||"",active:s.active}))
  };
  cache();
}

async function seedDefaults(uid){
  const settings={user_id:uid,income:3000,savings:1000};
  const categories=defaultCategories.map(([name,budget])=>({id:crypto.randomUUID(),user_id:uid,name,budget,active:true}));
  const annual=[{id:crypto.randomUUID(),user_id:uid,name:"Prime Video",amount:49,date:null,note:"Pagamento unico annuale"}];
  const subscriptions=defaultSubscriptions.map(([name,amount,frequency,active])=>({id:crypto.randomUUID(),user_id:uid,name,amount,frequency,active}));
  for(const [table,rows] of [["settings",[settings]],["categories",categories],["annual_expenses",annual],["subscriptions",subscriptions]]){
    const {error}=await db.from(table).insert(rows);if(error)throw error;
  }
}

function render(){
  document.getElementById("app").innerHTML=`<main class="shell"><div class="top"><div class="brand">Regolatore spese</div><div class="actions"><span class="muted" style="font-size:12px">${esc(currentUser?.email||"Account personale")}</span><button class="secondary" onclick="signOut()">Esci</button><button class="primary" onclick="addExpense()">+ Spesa</button></div></div>${nav()}${page==="dashboard"?dashboard():page==="spese"?expensesPage():page==="budget"?budgetPage():page==="annuali"?annualPage():settingsPage()}</main>`;
}
function dashboard(){
 const available=state.income-state.savings-totalSpent();
 return `<div class="hero"><small>Budget operativo</small><h1>${money(state.income-state.savings)}</h1><span>€1.000 accantonati ogni mese</span></div>
 <div class="grid"><div class="card"><div class="label">Entrate</div><div class="value">${money(state.income)}</div></div><div class="card"><div class="label">Risparmio</div><div class="value">${money(state.savings)}</div></div><div class="card"><div class="label">Speso</div><div class="value">${money(totalSpent())}</div></div><div class="card"><div class="label">Budget residuo</div><div class="value">${money(available)}</div></div><div class="card"><div class="label">Cuscinetto</div><div class="value ${cushion()<0?"danger":""}">${money(cushion())}</div></div><div class="card"><div class="label">Spese registrate</div><div class="value">${state.expenses.length}</div></div></div>
 <div class="section"><h2>Budget categorie</h2>${state.categories.filter(c=>c.active).map(catRow).join("")||`<div class="empty">Nessuna categoria attiva.</div>`}</div>`;
}
function catRow(c){let s=spent(c.id),pct=c.budget?Math.min(100,s/c.budget*100):0;return `<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">${money(s)} di ${money(c.budget)} · residuo ${money(c.budget-s)}</div><div class="bar"><i style="width:${pct}%"></i></div></div><span>${s>c.budget?"⚠":""}</span></div>`}
function expensesPage(){return `<div class="section"><h2>Spese</h2><div class="actions"><button class="primary" onclick="addExpense()">+ Aggiungi spesa</button><button class="secondary" onclick="exportCSV()">Esporta CSV</button></div>${state.expenses.length?state.expenses.map(e=>{let c=state.categories.find(x=>x.id===e.categoryId);return `<div class="expense"><div class="desc">${esc(e.description||"Spesa")}</div><div class="amount">${money(e.amount)}</div><div class="meta">${fmtDate(e.date)} · ${esc(c?.name||"Categoria archiviata")} <button class="secondary" style="padding:3px 7px;margin-left:6px" onclick="deleteExpense('${e.id}')">Elimina</button></div></div>`}).join(""):`<div class="empty">Nessuna spesa registrata.</div>`}</div>`}
function budgetPage(){const active=state.categories.filter(c=>c.active),archived=state.categories.filter(c=>!c.active);const activeHtml=active.map(c=>`<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">Attiva · speso ${money(spent(c.id))}</div></div><span>${money(c.budget)}</span><button class="secondary" onclick="editCategory('${c.id}')">Modifica</button></div>`).join("")||`<div class="empty">Nessuna categoria attiva.</div>`;const archivedHtml=archived.length?`<div class="section"><details><summary class="muted" style="cursor:pointer">Categorie archiviate (${archived.length})</summary><div style="margin-top:12px">${archived.map(c=>`<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">Archiviata · speso ${money(spent(c.id))}</div></div><span>${money(c.budget)}</span><button class="secondary" onclick="editCategory('${c.id}')">Riattiva</button></div>`).join("")}</div></details></div>`:"";return `<div class="section"><div class="actions"><button class="primary" onclick="addCategory()">+ Categoria</button></div><div class="section">${activeHtml}</div>${archivedHtml}</div>`}
function annualPage(){return `<div class="section"><h2>Spese annuali</h2><p class="muted">Queste spese non entrano nel budget mensile.</p>${state.annual.map(a=>`<div class="row"><div><b>${esc(a.name)}</b><div class="muted">${a.date?fmtDate(a.date):"Data da inserire"} · ${esc(a.note)}</div></div><b>${money(a.amount)}</b></div>`).join("")}</div>`}
function settingsPage(){return `<div class="section"><h2>Impostazioni</h2><div class="form settings"><div class="field"><label>Entrate mensili</label><input id="income" type="number" step="0.01" value="${state.income}"></div><div class="field"><label>Risparmio mensile</label><input id="savings" type="number" step="0.01" value="${state.savings}"></div><button class="primary" onclick="saveSettings()">Salva impostazioni</button><div class="actions"><button class="secondary" onclick="exportJSON()">Backup JSON</button><button class="secondary" onclick="document.getElementById('importFile').click()">Importa JSON</button><input id="importFile" type="file" accept=".json" hidden onchange="importJSON(event)"></div></div><div class="section"><h2>Abbonamenti</h2>${state.subscriptions.map(s=>`<div class="row"><div><b>${esc(s.name)}</b><div class="muted">${s.active?"Attivo":"Disdetto"} · ${esc(s.frequency)}</div></div><span>${money(s.amount)}</span></div>`).join("")}</div></div>`}
function go(p){page=p;render()}
function addExpense(){const active=state.categories.filter(c=>c.active);document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Aggiungi spesa</h2><div class="form"><div class="field"><label>Data</label><input id="fdate" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Categoria</label><select id="fcat">${active.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><div class="field"><label>Descrizione</label><input id="fdesc" placeholder="Es. supermercato"></div><div class="field"><label>Importo €</label><input id="famount" type="number" min="0" step="0.01" placeholder="0,00"></div><div class="actions"><button class="primary" onclick="confirmExpense()">Salva</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)}
async function confirmExpense(){const amount=Number(document.getElementById("famount").value);if(!amount||amount<0)return alert("Inserisci un importo valido.");const row={id:crypto.randomUUID(),user_id:currentUser.id,date:document.getElementById("fdate").value,category_id:document.getElementById("fcat").value,description:document.getElementById("fdesc").value.trim(),amount};const {error}=await db.from("expenses").insert(row);if(error)return alert(error.message);closeModal();await loadFromDB();render()}
async function deleteExpense(id){if(!confirm("Eliminare questa spesa?"))return;const {error}=await db.from("expenses").delete().eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);await loadFromDB();render()}
function addCategory(){document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Nuova categoria</h2><div class="form"><div class="field"><label>Nome</label><input id="cname"></div><div class="field"><label>Budget mensile €</label><input id="cbudget" type="number" step="0.01"></div><div class="actions"><button class="primary" onclick="confirmCategory()">Crea</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)}
async function confirmCategory(){let n=document.getElementById("cname").value.trim(),b=Number(document.getElementById("cbudget").value);if(!n||b<0)return alert("Inserisci nome e budget.");const {error}=await db.from("categories").insert({id:crypto.randomUUID(),user_id:currentUser.id,name:n,budget:b,active:true});if(error)return alert(error.message);closeModal();await loadFromDB();render()}
function editCategory(id){let c=state.categories.find(x=>x.id===id);document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Modifica categoria</h2><div class="form"><div class="field"><label>Nome</label><input id="cname" value="${esc(c.name)}"></div><div class="field"><label>Budget mensile €</label><input id="cbudget" type="number" step="0.01" value="${c.budget}"></div><div class="actions"><button class="primary" onclick="updateCategory('${id}')">Salva</button><button class="secondary" onclick="archiveCategory('${id}')">${c.active?"Archivia":"Riattiva"}</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)}
async function updateCategory(id){let c=state.categories.find(x=>x.id===id),name=document.getElementById("cname").value.trim()||c.name,budget=Number(document.getElementById("cbudget").value)||0;const {error}=await db.from("categories").update({name,budget}).eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);closeModal();await loadFromDB();render()}
async function archiveCategory(id){let c=state.categories.find(x=>x.id===id);const {error}=await db.from("categories").update({active:!c.active}).eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);closeModal();await loadFromDB();render()}
async function saveSettings(){const income=Number(document.getElementById("income").value)||0,savings=Number(document.getElementById("savings").value)||0;const {error}=await db.from("settings").update({income,savings}).eq("user_id",currentUser.id);if(error)return alert(error.message);await loadFromDB();render()}
function closeModal(){document.getElementById("modal")?.remove()}
function exportJSON(){download("regolatore-backup.json",JSON.stringify(state,null,2),"application/json")}
async function importJSON(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=async()=>{try{const imported=JSON.parse(r.result);if(!confirm("Sostituire i dati attuali con il backup?"))return;await replaceAllData(imported);await loadFromDB();render()}catch(err){alert("Backup non valido: "+err.message)}};r.readAsText(f)}
async function replaceAllData(s){const uid=currentUser.id;for(const table of ["expenses","annual_expenses","subscriptions","categories","settings"]){const {error}=await db.from(table).delete().eq("user_id",uid);if(error)throw error}await db.from("settings").insert({user_id:uid,income:Number(s.income)||0,savings:Number(s.savings)||0});if(s.categories?.length)await db.from("categories").insert(s.categories.map(c=>({id:c.id,user_id:uid,name:c.name,budget:Number(c.budget)||0,active:!!c.active})));if(s.expenses?.length)await db.from("expenses").insert(s.expenses.map(e=>({id:e.id,user_id:uid,date:e.date,category_id:e.categoryId,description:e.description||"",amount:Number(e.amount)||0})));if(s.annual?.length)await db.from("annual_expenses").insert(s.annual.map(a=>({id:a.id,user_id:uid,name:a.name,amount:Number(a.amount)||0,date:a.date||null,note:a.note||""})));if(s.subscriptions?.length)await db.from("subscriptions").insert(s.subscriptions.map(x=>({id:x.id,user_id:uid,name:x.name,amount:Number(x.amount)||0,frequency:x.frequency||"",active:!!x.active})))}
function exportCSV(){let lines=[["Data","Categoria","Descrizione","Importo"].join(";")];state.expenses.forEach(e=>{let c=state.categories.find(x=>x.id===e.categoryId);lines.push([e.date,c?.name||"Categoria archiviata",e.description,e.amount].map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";"))});download("spese.csv","\uFEFF"+lines.join("\n"),"text/csv")}
function download(name,data,type){let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
async function resetData(){if(!confirm("Ripristinare i dati iniziali? Le spese attuali verranno cancellate."))return;try{await replaceAllData({income:3000,savings:1000,categories:defaultCategories.map(([name,budget])=>({id:crypto.randomUUID(),name,budget,active:true})),expenses:[],annual:[{id:crypto.randomUUID(),name:"Prime Video",amount:49,date:"",note:"Pagamento unico annuale"}],subscriptions:defaultSubscriptions.map(([name,amount,frequency,active])=>({id:crypto.randomUUID(),name,amount,frequency,active}))});await loadFromDB();render()}catch(e){alert(e.message)}}

db.auth.getSession().then(({data})=>{if(data.session)startApp();else renderLogin()});
