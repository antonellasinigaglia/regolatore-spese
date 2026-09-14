(function(){
  let startY=0,pulling=false,indicator=null;
  function getIndicator(){
    if(indicator)return indicator;
    indicator=document.createElement('div');
    indicator.id='pullRefreshIndicator';
    indicator.innerHTML='<span class="pull-spinner"></span><span class="pull-text">Trascina per aggiornare</span>';
    Object.assign(indicator.style,{position:'fixed',top:'0',left:'50%',transform:'translate(-50%,-100%)',zIndex:'9999',display:'flex',alignItems:'center',gap:'8px',padding:'9px 14px',borderRadius:'0 0 12px 12px',background:'#fff',boxShadow:'0 2px 10px rgba(0,0,0,.12)',fontSize:'14px',fontFamily:'inherit',color:'#353535',transition:'transform .18s ease'});
    const style=document.createElement('style');
    style.textContent='#pullRefreshIndicator .pull-spinner{width:16px;height:16px;border:2px solid #ddd;border-top-color:#353535;border-radius:50%;display:none;animation:pullSpin .7s linear infinite}@keyframes pullSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);document.body.appendChild(indicator);return indicator;
  }
  document.addEventListener('touchstart',e=>{if(window.scrollY===0&&e.touches.length===1){startY=e.touches[0].clientY;pulling=true;}},{passive:true});
  document.addEventListener('touchmove',e=>{if(!pulling||window.scrollY!==0)return;const d=e.touches[0].clientY-startY,el=getIndicator();if(d>20){el.style.transform=`translate(-50%,${Math.min(d-20,70)-100}px)`;el.querySelector('.pull-text').textContent=d>80?'Rilascia per aggiornare':'Trascina per aggiornare';el.querySelector('.pull-spinner').style.display='none';}},{passive:true});
  document.addEventListener('touchend',e=>{if(!pulling)return;const d=e.changedTouches[0].clientY-startY;pulling=false;const el=getIndicator();if(d>80&&window.scrollY===0){el.style.transform='translate(-50%,0)';el.querySelector('.pull-text').textContent='Aggiornamento...';el.querySelector('.pull-spinner').style.display='inline-block';setTimeout(()=>window.location.reload(),350);}else el.style.transform='translate(-50%,-100%)';},{passive:true});
})();