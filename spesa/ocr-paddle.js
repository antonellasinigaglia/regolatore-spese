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

  function boxOf(poly){
    const pts=Array.isArray(poly)?poly:[];
    const xs=pts.map(p=>Array.isArray(p)?p[0]:p?.x).filter(Number.isFinite);
    const ys=pts.map(p=>Array.isArray(p)?p[1]:p?.y).filter(Number.isFinite);
    return xs.length?{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}:{x0:0,x1:0,y0:0,y1:0};
  }

  function textItems(result){
    const arr=result?.items||result?.parragraphs||result?.paragraphs||[];
    return arr.flatMap(x=>{
      if(typeof x==='string')return [{text:clean(x),score:1,poly:null}];
      if(x?.text)return [{text:clean(x.text),score:Number(x.score||1),poly:x.poly||x.box}];
      return [];
    }).filter(x=>x.text);
  }

  function parseItems(result){
    const all=textItems(result).map(x=>({...x,...boxOf(x.poly)})).filter(x=>x.score>=0.25);
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
        const mod=await import('https://esm.sh/@paddleocr/paddleocr-js@0.4.2?bundle&target=es2022');
        const PaddleOCR=mod.PaddleOCR||mod.default?.PaddleOCR||mod.default;
        if(!PaddleOCR?.create)throw new Error('PaddleOCR.js non disponibile');
        return PaddleOCR.create({
          lang:'it',
          ocrVersion:'PP-OCRv5',
          worker:false,
          textDetectionBatchSize:1,
          textRecognitionBatchSize:4,
          ortOptions:{backend:'wasm',wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/'}
        });
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
      const [result]=await ocr.predict(file,{textRecScoreThresh:0.25,textDetBoxThresh:0.30,textDetThresh:0.20,textDetLimitSideLen:2400,textDetLimitType:'max',textDetMaxSideLimit:4000});
      const raw=rawText(result);
      const items=parseItems(result);

      if(!items.length){
        box.innerHTML='<div class="notice error"><strong>Nessuna riga prodotto riconosciuta.</strong><br><span class="small">OCR completato, ma il parser non ha trovato righe con un prezzo valido.</span><pre style="white-space:pre-wrap;margin-top:12px;max-height:320px;overflow:auto">'+esc(raw||JSON.stringify(result,null,2))+'</pre></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
        return;
      }

      const url=URL.createObjectURL(file);
      window.receiptDraft={imageFile:file,imageUrl:url,raw,date:window.extractDate(raw)||window.today(),supermarket:window.guessSupermarket(raw),total:totalFromResult(result),items};
      await window.renderReview();
    }catch(e){
      console.error('PaddleOCR.js',e);
      box.innerHTML='<div class="notice error"><strong>Errore OCR.</strong><br><span class="small">'+esc(e?.message||String(e))+'</span></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
    }
  };
})();
