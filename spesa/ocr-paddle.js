import { PaddleOcrService } from 'https://cdn.jsdelivr.net/npm/ppu-paddle-ocr@6.6.0/web/index.js';

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

  function boxOf(box){
    if(!box)return {x0:0,x1:0,y0:0,y1:0};
    return {x0:Number(box.x||0),x1:Number(box.x||0)+Number(box.width||0),y0:Number(box.y||0),y1:Number(box.y||0)+Number(box.height||0)};
  }

  function textItems(result){
    const arr=result?.results||[];
    return arr.map(x=>({text:clean(x?.text),score:Number(x?.confidence||1),box:x?.box||null})).filter(x=>x.text);
  }

  function parseItems(result){
    const all=textItems(result).map(x=>({...x,...boxOf(x.box)})).filter(x=>x.score>=0.25);
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
      out.push({raw_description:name,quantity,unit_price:p/quantity,line_total:p,package_amount:amount,package_unit:unitName,price_per_base_unit:amount?p/(quantity*amount):null,category,is_food:category!=='Non alimentare',brand:window.guessBrand(name),ocr_score:row.score});
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

  async function getEngine(){
    if(!enginePromise){
      enginePromise=(async()=>{
        const ocr=new PaddleOcrService({
          detection:{
            maxSideLength:1920,
            minimumAreaThreshold:12,
            paddingVertical:0.25,
            paddingHorizontal:0.35
          },
          recognition:{
            strategy:'per-line',
            minimumConfidence:0.30,
            recBatchSize:6,
            maxCropSourceSideLength:2400,
            spaceRecovery:true
          },
          session:{executionProviders:['wasm'],graphOptimizationLevel:'all'},
          debugging:{verbose:false}
        });
        await ocr.initialize();
        return ocr;
      })();
    }
    return enginePromise;
  }

  window.scanReceipt=async function(file){
    if(!file)return;
    const box=document.getElementById('importbox');
    box.innerHTML='<div class="card"><p>Carico il lettore OCR…</p><div class="muted small">Elaborazione locale nel browser. Il primo caricamento può richiedere qualche secondo.</div></div>';
    try{
      const ocr=await getEngine();
      box.querySelector('p').textContent='Leggo lo scontrino…';
      const buffer=await file.arrayBuffer();
      const result=await ocr.recognize(buffer,{flatten:true});
      const raw=rawText(result);
      const items=parseItems(result);

      if(!items.length){
        box.innerHTML='<div class="notice error"><strong>Nessuna riga prodotto riconosciuta.</strong><br><span class="small">OCR completato, ma il parser non ha trovato righe con un prezzo valido.</span><pre style="white-space:pre-wrap;margin-top:12px;max-height:320px;overflow:auto">'+esc(raw||result?.text||JSON.stringify(result,null,2))+'</pre></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
        return;
      }

      const url=URL.createObjectURL(file);
      window.receiptDraft={imageFile:file,imageUrl:url,raw,date:window.extractDate(raw)||window.today(),supermarket:window.guessSupermarket(raw),total:totalFromResult(result),items};
      await window.renderReview();
    }catch(e){
      console.error('Paddle OCR',e);
      box.innerHTML='<div class="notice error"><strong>Errore OCR.</strong><br><span class="small">'+esc(e?.message||String(e))+'</span></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
    }
  };
})();
