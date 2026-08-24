export function safeSend(ws,payload){
  if(ws?.readyState===ws?.OPEN) ws.send(JSON.stringify(payload));
}

export function cleanUsername(value=''){
  return String(value||'').trim().replace(/^@/,'');
}

export function deepValue(obj,keys,depth=0,seen=new Set()){
  if(!obj||typeof obj!=='object'||depth>6||seen.has(obj)) return '';
  seen.add(obj);
  for(const key of keys){
    const value=obj[key];
    if(typeof value==='string'&&value.trim()) return value.trim();
    if(typeof value==='number'&&Number.isFinite(value)) return String(value);
  }
  for(const value of Object.values(obj)){
    if(value&&typeof value==='object'){
      const found=deepValue(value,keys,depth+1,seen);
      if(found) return found;
    }
  }
  return '';
}

export function deepImageUrl(obj,depth=0,seen=new Set()){
  if(!obj||typeof obj!=='object'||depth>7||seen.has(obj)) return '';
  seen.add(obj);
  for(const key of ['giftPictureUrl','gift_picture_url','giftImage','gift_image','icon','image','picture','giftIcon','gift_icon']){
    const value=obj[key];
    if(typeof value==='string'&&/^https?:\/\//i.test(value)) return value;
    const list=value?.urlList||value?.url_list||value?.urls;
    if(Array.isArray(list)){
      const found=list.find(x=>typeof x==='string'&&/^https?:\/\//i.test(x));
      if(found) return found;
    }
  }
  for(const [key,value] of Object.entries(obj)){
    if(/avatar|profile|user/i.test(key)) continue;
    if(value&&typeof value==='object'){
      const found=deepImageUrl(value,depth+1,seen);
      if(found) return found;
    }
  }
  return '';
}

export function normalizeGift(data={}){
  const giftId=data.giftId??data.gift_id??data.gift?.id??null;
  return {
    type:'gift',
    user:deepValue(data,['uniqueId','unique_id','username','nickname'])||'viewer',
    gift:data.giftName||data.extendedGiftInfo?.name||data.gift?.name||`gift-${giftId??'unknown'}`,
    giftId:giftId==null?null:String(giftId),
    count:Math.max(1,Number(data.repeatCount??data.repeat_count??data.count??1)||1),
    diamondCount:Number(data.diamondCount??data.diamond_count??data.extendedGiftInfo?.diamondCount??0)||0,
    repeatEnd:data.repeatEnd??data.repeat_end??true,
    giftType:Number(data.giftType??data.gift_type??0)||0,
    icon:deepImageUrl(data)
  };
}

export function normalizeCatalog(raw,live){
  let list=Array.isArray(raw)?raw:raw?.gifts||raw?.giftList||raw?.availableGifts||live?.availableGifts||[];
  if(!Array.isArray(list)) list=[];
  const seen=new Set();
  return list.map(g=>{
    const id=g.id??g.giftId??g.gift_id??g.gift?.id??null;
    const name=g.name??g.giftName??g.gift_name??g.gift?.name??`gift-${id??'unknown'}`;
    return {
      id:id==null?null:String(id),
      name:String(name),
      diamondCount:Number(g.diamondCount??g.diamond_count??g.diamondCost??g.cost??0)||0,
      type:Number(g.type??g.giftType??g.gift_type??0)||0,
      icon:String(g.icon?.urlList?.[0]||g.icon?.url_list?.[0]||g.image?.urlList?.[0]||g.image?.url_list?.[0]||deepImageUrl(g)||'')
    };
  }).filter(g=>{
    const key=g.id||g.name.toLowerCase();
    if(!key||seen.has(key)) return false;
    seen.add(key);return true;
  }).sort((a,b)=>(a.diamondCount-b.diamondCount)||a.name.localeCompare(b.name));
}
