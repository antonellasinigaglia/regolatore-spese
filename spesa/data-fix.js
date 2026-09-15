(function(){
  const LEGACY=new Set(['Non alimentare','Altro alimentare']);

  async function fixLegacyData(){
    if(!window.db||!window.user)return false;
    const uid=window.user.id;
    const {data:cats,error:ce}=await db.from('spesa_categories').select('id,name').eq('user_id',uid);
    if(ce)throw ce;
    const allCats=cats||[];
    const legacyIds=new Set(allCats.filter(c=>LEGACY.has(c.name)).map(c=>c.id));
    if(!legacyIds.size){
      await normalizeReceipts(uid);
      return false;
    }

    const validCats=new Map(allCats.filter(c=>!LEGACY.has(c.name)).map(c=>[c.name,c]));
    const {data:items,error:ie}=await db.from('spesa_receipt_items').select('id,product_id,raw_description,category_id,is_food').eq('user_id',uid);
    if(ie)throw ie;

    let changed=false;
    for(const item of items||[]){
      if(!legacyIds.has(item.category_id))continue;
      const guessed=typeof window.guessCategory==='function'?window.guessCategory(item.raw_description||''):'Altro';
      const target=validCats.get(guessed)||validCats.get('Altro');
      if(!target)continue;
      const {error}=await db.from('spesa_receipt_items').update({category_id:target.id,is_food:true}).eq('id',item.id).eq('user_id',uid);
      if(error)throw error;
      if(item.product_id){
        const {error:pe}=await db.from('spesa_products').update({category_id:target.id,is_food:true}).eq('id',item.product_id).eq('user_id',uid);
        if(pe)throw pe;
      }
      changed=true;
    }

    await normalizeReceipts(uid);
    return changed;
  }

  async function normalizeReceipts(uid){
    const {data:receipts,error}=await db.from('spesa_receipts').select('id,total_amount,food_amount,non_food_amount').eq('user_id',uid);
    if(error)throw error;
    for(const r of receipts||[]){
      const total=Number(r.total_amount||0);
      if(Number(r.food_amount||0)!==total||Number(r.non_food_amount||0)!==0){
        const {error:e}=await db.from('spesa_receipts').update({food_amount:total,non_food_amount:0}).eq('id',r.id).eq('user_id',uid);
        if(e)throw e;
      }
    }
  }

  async function run(){
    for(let i=0;i<20;i++){
      if(window.user){
        try{
          const changed=await fixLegacyData();
          if(changed&&typeof window.go==='function')window.go('dashboard');
        }catch(e){console.error('Data migration error:',e)}
        return;
      }
      await new Promise(r=>setTimeout(r,500));
    }
  }

  run();
})();
