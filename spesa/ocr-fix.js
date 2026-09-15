(function(){
  function makeImage(file, mode){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>{
        const maxW=2200, scale=Math.min(3, maxW/img.naturalWidth);
        const w=Math.round(img.naturalWidth*scale), h=Math.round(img.naturalHeight*scale);
        const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
        const data=ctx.getImageData(0,0,w,h), p=data.data;
        for(let i=0;i<p.length;i+=4){
          const y=.299*p[i]+.587*p[i+1]+.114*p[i+2];
          const v=mode==='threshold'?(y<178?0:255):Math.max(0,Math.min(255,(y-128)*1.65+128));
          p[i]=p[i+1]=p[i+2]=v;
        }
        ctx.putImageData(data,0,0); URL.revokeObjectURL(img.src); resolve(canvas);
      };
      img.onerror=reject; img.src=URL.createObjectURL(file);
    });
  }
  async function ocr(canvas, psm){
    const worker=await Tesseract.createWorker('ita');
    await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300'});
    const result=await worker.recognize(canvas);
    const out={text:result.data.text||'',confidence:Number(result.data.confidence||0)};
    await worker.terminate(); return out;
  }
  function score(text,confidence){
    const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    return confidence*.7+lines.filter(x=>/\d{1,3}[.,]\d{2}\b/.test(x)).length*7+lines.filter(x=>/[A-Za-zÀ-ÿ]{3,}/.test(x)).length*1.5;
  }
  function cleanLine(s){return s.replace(/\s+/g,' ').replace(/[|]{2,}/g,' ').trim()}
  function improvedItems(text){
    const excluded=/^(shopper|scontrino|totale|pagamento|contanti|carta|resto|punti|fidelity|tessera|iva|subtotale)/i;
    const bad=/sconto|coupon|buono|pagamento|contanti|resto|totale|iva|tessera|punti|fidelity|shopper|sacchetto compost|ce93[\s\/]?42/i;
    const out=[];
    for(const raw of text.split(/\r?\n/)){
      let line=cleanLine(raw); if(!line||excluded.test(line)||bad.test(line))continue;
      const prices=[...line.matchAll(/(\d{1,3}[.,]\d{2})(?!\d)/g)]; if(!prices.length)continue;
      const m=prices[prices.length-1], price=Number(m[1].replace(',','.')); if(!Number.isFinite(price)||price<=0||price>500)continue;
      let name=line.slice(0,m.index).trim().replace(/[*#@]+[a-z]?\s*$/i,'').replace(/[*#@]+/g,' ').replace(/\s+/g,' ').trim();
      if(name.length<3||!/\p{L}/u.test(name))continue;
      let quantity=1; const qm=name.match(/^([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*/i);
      if(qm){quantity=Number(qm[1].replace(',','.'));name=name.slice(qm[0].length).trim()}
      const unit=name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l)\b/i);
      let packageAmount=unit?Number(unit[1].replace(',','.')):null, packageUnit=unit?unit[2].toLowerCase():null;
      if(packageUnit==='g'||packageUnit==='gr')packageAmount/=1000; if(packageUnit==='ml')packageAmount/=1000;
      const category=window.guessCategory(name);
      out.push({raw_description:name,quantity,unit_price:price/quantity,line_total:price,package_amount:packageAmount,package_unit:packageUnit,price_per_base_unit:packageAmount?price/(quantity*packageAmount):null,category,is_food:category!=='Non alimentare',brand:window.guessBrand(name)});
    }
    return out;
  }
  const SUPABASE_URL='https://qilylafyygmxgtwgosvt.supabase.co';
  const SUPABASE_KEY='sb_publishable_45w093agTkMtioWxrvsBIQ_QjzcWKO9';
  const fixDb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const categories=['Frutta','Verdura','Latticini','Carne','Pesce','Uova','Pasta e cereali','Pane e prodotti da forno','Surgelati','Bevande','Dolci e snack','Dispensa','Condimenti','Legumi','Alternative vegetali','Altro alimentare','Non alimentare'];
  const escLocal=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function improvedTotal(text){
    const lines=text.split(/\r?\n/).map(cleanLine);
    for(let i=lines.length-1;i>=0;i--){
      if(/totale\s*(euro|€)?|totale da pagare|totale complessivo/i.test(lines[i])){
        const nums=[...lines[i].matchAll(/(\d{1,3}[.,]\d{2})/g)]; if(nums.length)return Number(nums[nums.length-1][1].replace(',','.'));
      }
    }
    return window.extractTotal(text);
  }
  async function currentUser(){const {data}=await fixDb.auth.getUser();return data.user}
  async function getMasters(uid){
    const [c,b,s,p]=await Promise.all([
      fixDb.from('spesa_categories').select('*').eq('user_id',uid).order('name'),
      fixDb.from('spesa_brands').select('*').eq('user_id',uid).order('name'),
      fixDb.from('spesa_supermarkets').select('*').eq('user_id',uid).order('name'),
      fixDb.from('spesa_products').select('*').eq('user_id',uid).order('name')
    ]); return {categories:c.data||[],brands:b.data||[],supermarkets:s.data||[],products:p.data||[]};
  }
  async function ensureMaster(table,uid,name,extra={}){const clean=(name||'').trim();if(!clean)return null;const {data}=await fixDb.from(table).select('*').eq('user_id',uid).ilike('name',clean).limit(1);if(data?.[0])return data[0];const {data:d,error}=await fixDb.from(table).insert({user_id:uid,name:clean,...extra}).select().single();if(error)throw error;return d}
  window.renderReview=async function(){
    const d=window.receiptDraft,c=document.getElementById('content'),uid=(await currentUser())?.id;if(!uid)return;
    const m=await getMasters(uid);window.__spesaMasters=m;
    c.innerHTML=`<div class="top"><div><h1 class="title">Controlla scontrino</h1><div class="muted">Correggi quello che non è stato riconosciuto bene.</div></div><div class="actions"><button class="btn secondary" onclick="go('import')">Annulla</button><button class="btn" onclick="saveReceipt()">Salva scontrino</button></div></div><div class="two"><div class="card"><img class="preview" src="${d.imageUrl}"><div class="form"><div class="field"><label>Data</label><input id="rdate" type="date" value="${d.date}"></div><div class="field"><label>Supermercato</label><input id="rmarket" list="marketList" value="${escLocal(d.supermarket||'')}"><datalist id="marketList">${m.supermarkets.map(x=>`<option>${escLocal(x.name)}</option>`).join('')}</datalist></div><div class="field"><label>Totale scontrino</label><input id="rtotal" type="number" step="0.01" value="${d.total||0}"></div></div></div><div class="card"><div class="section-head"><div class="section-title">${d.items.length} righe riconosciute</div><span class="pill">Sconti ignorati</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Prodotto</th><th>Marca</th><th>Categoria</th><th>Qtà</th><th>Prezzo</th><th>Formato</th></tr></thead><tbody>${d.items.map((it,i)=>`<tr><td><input id="n${i}" value="${escLocal(it.raw_description)}"></td><td><input id="b${i}" value="${escLocal(it.brand||'')}"></td><td><select id="c${i}">${categories.map(x=>`<option ${x===it.category?'selected':''}>${escLocal(x)}</option>`).join('')}</select></td><td><input id="q${i}" type="number" step="0.01" value="${it.quantity}"></td><td><input id="p${i}" type="number" step="0.01" value="${it.line_total}"></td><td><input id="u${i}" value="${escLocal(it.package_amount?`${it.package_amount}${it.package_unit==='kg'?' kg':it.package_unit==='l'?' l':it.package_unit||''}`:'')}"></td></tr>`).join('')}</tbody></table></div></div></div>`;
  };
  window.saveReceipt=async function(){
    const d=window.receiptDraft,uid=(await currentUser())?.id;if(!uid)return;const m=window.__spesaMasters||await getMasters(uid);
    const date=document.getElementById('rdate').value,market=document.getElementById('rmarket').value.trim(),total=Number(document.getElementById('rtotal').value||0),supermarket=await ensureMaster('spesa_supermarkets',uid,market),items=[];
    for(let i=0;i<d.items.length;i++){
      const name=document.getElementById('n'+i).value.trim(),brandName=document.getElementById('b'+i).value.trim(),catName=document.getElementById('c'+i).value,q=Number(document.getElementById('q'+i).value||1),line=Number(document.getElementById('p'+i).value||0),format=document.getElementById('u'+i).value.trim();
      const brand=await ensureMaster('spesa_brands',uid,brandName);let cat=(m.categories||[]).find(x=>x.name===catName);if(!cat)cat=await ensureMaster('spesa_categories',uid,catName,{is_food:catName!=='Non alimentare'});
      const pm=format.match(/(\d+[\.,]?\d*)\s*(kg|l)\b/i),parsed=pm?Number(pm[1].replace(',','.')):null;let product=(m.products||[]).find(x=>x.name.toLowerCase()===name.toLowerCase()&&(x.brand_id||null)===(brand?.id||null));
      if(!product){const {data,error}=await fixDb.from('spesa_products').insert({user_id:uid,name,brand_id:brand?.id||null,category_id:cat?.id||null,is_food:cat?.is_food??true,normalized_amount:parsed,normalized_unit:pm?.[2]||null}).select().single();if(error)throw error;product=data}
      items.push({user_id:uid,product_id:product.id,raw_description:name,brand_id:brand?.id||null,category_id:cat?.id||null,quantity:q,package_amount:parsed,package_unit:pm?.[2]||null,unit_price:line/q,line_total:line,price_per_base_unit:parsed?line/(q*parsed):null,is_food:cat?.is_food??true,discount_ignored:true});
    }
    const food=items.filter(x=>x.is_food).reduce((a,x)=>a+x.line_total,0),nonfood=items.filter(x=>!x.is_food).reduce((a,x)=>a+x.line_total,0),{data:r,error}=await fixDb.from('spesa_receipts').insert({user_id:uid,supermarket_id:supermarket?.id||null,purchase_date:date,total_amount:total,food_amount:food,non_food_amount:nonfood,raw_ocr:d.raw,status:'saved'}).select().single();if(error)throw error;
    const {error:ie}=await fixDb.from('spesa_receipt_items').insert(items.map(x=>({...x,receipt_id:r.id})));if(ie)throw ie;alert('Scontrino salvato.');window.go('receipts');
  };
  window.scanReceipt=async function(file){
    if(!file)return;const box=document.getElementById('importbox');box.innerHTML='<div class="card"><p>Preparo lo scontrino…</p><div class="muted small">Miglioramento immagine e OCR.</div></div>';
    try{const url=URL.createObjectURL(file),original=await makeImage(file,'contrast'),threshold=await makeImage(file,'threshold'),results=[];for(const [canvas,psm] of [[original,4],[original,6],[threshold,6],[threshold,11]]){box.querySelector('p').textContent=`Lettura OCR ${results.length+1}/4…`;results.push(await ocr(canvas,psm));}const best=results.slice().sort((a,b)=>score(b.text,b.confidence)-score(a.text,a.confidence))[0];window.receiptDraft={imageFile:file,imageUrl:url,raw:best.text,date:window.extractDate(best.text)||new Date().toISOString().slice(0,10),supermarket:window.guessSupermarket(best.text),total:improvedTotal(best.text),items:improvedItems(best.text)};await window.renderReview();}
    catch(e){console.error(e);box.innerHTML='<div class="notice error">Impossibile leggere lo scontrino. Prova con una foto verticale, ben illuminata e senza prospettiva.</div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';}
  };
})();
