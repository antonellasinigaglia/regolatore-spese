(function(){
  let enginePromise=null;
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function money(s){
    const matches=String(s||'').match(/\b(\d{1,3}[.,]\d{2})\b/g)||[];
    if(!matches.length)return null;
    const n=Number(matches[matches.length-1].replace(',','.'));
    return Number.isFinite(n)&&n>0&&n<500?n:null;
  }

  function isNoise(s){
    return /^(shopper|scontrino|totale|pagamento|contanti|carta|resto|punti|fidelity|tessera|iva|subtotale|buono|coupon|sacchetto)/i.test(s)
      || /sconto|coupon|buono|pagamento|contanti|resto|totale da pagare|tessera|punti|fidelity|sacchetto compost|ce93[\s\/]?42/i.test(s);
  }

  function textItems(result){
    const arr=result?.parragraphs||result?.paragraphs||result?.items||[];
    return arr.flatMap(x=>{
      if(typeof x==='string')return [{text:clean(x),score:1}];
      if(x?.text)return [{text:clean(x.text),score:Number(x.score||1),poly:x.poly||x.box}];
      if(x?.parse?.text)return [{text:clean(x.parse.text),score:Number(x.parse.score||1),poly:x.parse.poly||x.parse.box}];
      return [];
    }).filter(x=>x.text);
  }

  function parseItems(result){
    const all=textItems(result).filter(x=>x.score>=0.25);
    const out=[];
    for(const row of all){
      const p=money(row.text);
      if(p===null || isNoise(row.text))continue;
      let name=row.text.replace(/(?:^|\s)\d{1,3}[.,]\d{2}\s*$/,'').trim();
      name=name.replace(/\s{2,}/g,' ').trim();
      if(name.length<3 || !/[A-Za-zÀ-ÿ]/.test(name) || isNoise(name))continue;

      let quantity=1;
      const qm=name.match(/^([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*/i);
      if(qm){quantity=Number(qm[1].replace(',','.'));name=name.slice(qm[0].length).trim();}

      const unit=name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l)\b/i);
      let amount=unit?Number(unit[1].replace(',','.')):null;
      let unitName=unit?unit[2].toLowerCase():null;
      if(unitName==='g'||unitName==='gr')amount/=1000;
      if(unitName==='ml')amount/=1000;

      const category=window.guessCategory(name);
      out.push({
        raw_description:name,
        quantity,
        unit_price:p/quantity,
        line_total:p,
        package_amount:amount,
        package_unit:unitName,
        price_per_base_unit:amount?p/(quantity*amount):null,
        category,
        is_food:category!=='Non alimentare',
        brand:window.guessBrand(name),
        ocr_score:row.score
      });
    }
    return out;
  }

  function rawText(result){return textItems(result).map(x=>x.text).join('\n');}

  function totalFromResult(result){
    const items=textItems(result);
    for(const it of [...items].reverse()){
      if(/totale\s*(euro|€)?|totale da pagare|totale complessivo/i.test(it.text)){
        const p=money(it.text); if(p!==null)return p;
      }
    }
    return window.extractTotal(rawText(result));
  }

  async function waitForBrowserDeps(){
    for(let i=0;i<120;i++){
      if(window.ort && window.cv) return;
      await new Promise(r=>setTimeout(r,250));
    }
    throw new Error('Runtime OCR non disponibile nel browser');
  }

  async function getEngine(){
    if(!enginePromise){
      enginePromise=(async()=>{
        await waitForBrowserDeps();
        const Paddle=await import('https://cdn.jsdelivr.net/npm/esearch-ocr@5.1.5/dist/esearch-ocr.js');
        const assetsPath='https://cdn.jsdelivr.net/npm/paddleocr-browser@1.0.4/dist/';
        const dic=await fetch(assetsPath+'ppocr_keys_v1.txt').then(r=>{
          if(!r.ok)throw new Error('Dizionario OCR non disponibile');
          return r.text();
        });
        const init=Paddle.init||Paddle.default?.init;
        if(typeof init!=='function')throw new Error('Motore OCR browser non disponibile');
        return init({
          det:{input:assetsPath+'ppocr_det.onnx'},
          rec:{input:assetsPath+'ppocr_rec.onnx',decodeDic:dic},
          dic,
          ort:window.ort,
          node:false,
          cv:window.cv
        });
      })();
    }
    return enginePromise;
  }

  function fileToDataUrl(file){
    return new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(r.result);
      r.onerror=()=>reject(r.error||new Error('Impossibile leggere la foto'));
      r.readAsDataURL(file);
    });
  }

  window.scanReceipt=async function(file){
    if(!file)return;
    const box=document.getElementById('importbox');
    box.innerHTML='<div class="card"><p>Carico il lettore OCR…</p><div class="muted small">Elaborazione locale nel browser. Il primo caricamento può richiedere qualche secondo.</div></div>';
    try{
      const ocr=await getEngine();
      box.querySelector('p').textContent='Leggo lo scontrino…';
      const dataUrl=await fileToDataUrl(file);
      const result=await ocr.ocr(dataUrl);
      const raw=rawText(result);
      const items=parseItems(result);

      if(!items.length){
        box.innerHTML='<div class="notice error"><strong>Nessuna riga prodotto riconosciuta.</strong><br><span class="small">OCR completato, ma il parser non ha trovato righe con un prezzo valido.</span><pre style="white-space:pre-wrap;margin-top:12px;max-height:320px;overflow:auto">'+esc(raw||JSON.stringify(result,null,2))+'</pre></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
        return;
      }

      const url=URL.createObjectURL(file);
      window.receiptDraft={
        imageFile:file,
        imageUrl:url,
        raw,
        date:window.extractDate(raw)||window.today(),
        supermarket:window.guessSupermarket(raw),
        total:totalFromResult(result),
        items
      };
      await window.renderReview();
    }catch(e){
      console.error('Browser OCR',e);
      box.innerHTML='<div class="notice error"><strong>Errore OCR.</strong><br><span class="small">'+esc(e?.message||String(e))+'</span></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
    }
  };
})();
