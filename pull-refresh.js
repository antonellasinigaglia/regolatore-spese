(function(){
  let startY=0;
  let pulling=false;
  let indicator=null;
  const THRESHOLD=90;

  function getIndicator(){
    if(indicator) return indicator;
    indicator=document.createElement('div');
    indicator.id='pullRefreshIndicator';
    indicator.innerHTML='<span class="pull-arrow">↓</span><span class="pull-spinner"></span><span class="pull-text">Trascina per aggiornare</span>';
    Object.assign(indicator.style,{
      position:'fixed',
      top:'max(8px, env(safe-area-inset-top))',
      left:'50%',
      transform:'translate(-50%, -70px)',
      zIndex:'2147483647',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      gap:'8px',
      minWidth:'220px',
      height:'42px',
      padding:'0 15px',
      borderRadius:'22px',
      background:'#fff',
      boxShadow:'0 3px 16px rgba(0,0,0,.18)',
      fontSize:'14px',
      fontWeight:'600',
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      color:'#353535',
      opacity:'0',
      transition:'transform .08s ease, opacity .08s ease',
      pointerEvents:'none'
    });

    const style=document.createElement('style');
    style.textContent=`
      #pullRefreshIndicator .pull-arrow{font-size:23px;line-height:1;display:inline-block;transition:transform .15s ease}
      #pullRefreshIndicator .pull-spinner{width:18px;height:18px;border:2px solid #ddd;border-top-color:#353535;border-radius:50%;display:none;animation:pullSpin .7s linear infinite}
      @keyframes pullSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(indicator);
    return indicator;
  }

  function update(distance){
    const el=getIndicator();
    const progress=Math.min(distance/THRESHOLD,1);
    const y=-70+(progress*78);
    el.style.transform=`translate(-50%, ${y}px)`;
    el.style.opacity=String(Math.min(.98,.15+progress*.83));
    el.querySelector('.pull-arrow').style.transform=progress>=1?'rotate(180deg)':'rotate(0deg)';
    el.querySelector('.pull-text').textContent=progress>=1?'Rilascia per aggiornare':'Trascina per aggiornare';
  }

  document.addEventListener('touchstart',function(e){
    if(window.scrollY<=0 && e.touches.length===1){
      startY=e.touches[0].clientY;
      pulling=true;
    } else {
      pulling=false;
    }
  },{passive:true});

  document.addEventListener('touchmove',function(e){
    if(!pulling || window.scrollY>0 || e.touches.length!==1) return;
    const distance=e.touches[0].clientY-startY;
    if(distance<=0) return;
    e.preventDefault();
    update(distance);
  },{passive:false});

  document.addEventListener('touchend',function(){
    if(!pulling) return;
    pulling=false;
    const el=getIndicator();
    const text=el.querySelector('.pull-text');
    const arrow=el.querySelector('.pull-arrow');
    const spinner=el.querySelector('.pull-spinner');
    const ready=parseFloat(el.style.opacity||'0')>=.9 && arrow.style.transform==='rotate(180deg)';

    if(ready){
      text.textContent='Aggiornamento...';
      arrow.style.display='none';
      spinner.style.display='inline-block';
      el.style.transform='translate(-50%, 8px)';
      el.style.opacity='1';
      setTimeout(function(){window.location.reload();},350);
    } else {
      el.style.transform='translate(-50%, -70px)';
      el.style.opacity='0';
    }
  },{passive:true});

  document.addEventListener('touchcancel',function(){
    pulling=false;
    if(indicator){
      indicator.style.transform='translate(-50%, -70px)';
      indicator.style.opacity='0';
    }
  },{passive:true});
})();
