export function safeSend(ws,payload){
  if(ws?.readyState===ws?.OPEN) ws.send(JSON.stringify(payload));
}

export function cleanUsername(value=''){
  return String(value||'').trim().replace(/^@/,'');
}

export function deepValue(obj,keys,depth=0,seen=new Set()){
  if(!obj||typeof obj!=='object'||depth>7||seen.has(obj)) return '';
  seen.add(obj);
  for(const key of keys){
    const value=obj[key];
    if(typeof value==='string'&&value.trim()) return value.trim();
    if(typeof value==='number'&&Number.isFinite(value)) return String(value);
  }
  for(const value of Object.values(obj)){
    if(value&&typeof value==='object'){
      const found=deepValue(value,keys,depth+1,seen);
      if(found!=='') return found;
    }
  }
  return '';
}

export function deepNumber(obj,keys,depth=0,seen=new Set()){
  if(!obj||typeof obj!=='object'||depth>7||seen.has(obj)) return null;
  seen.add(obj);
  for(const key of keys){
    const value=obj[key];
    const number=Number(value);
    if(value!==''&&value!=null&&Number.isFinite(number)) return number;
  }
  for(const value of Object.values(obj)){
    if(value&&typeof value==='object'){
      const found=deepNumber(value,keys,depth+1,seen);
      if(found!=null) return found;
    }
  }
  return null;
}

export function deepImageUrl(obj,depth=0,seen=new Set()){
  if(!obj||typeof obj!=='object'||depth>8||seen.has(obj)) return '';
  seen.add(obj);
  const preferred=['giftPictureUrl','gift_picture_url','giftImage','gift_image','icon','image','picture','giftIcon','gift_icon','iconUrl','imageUrl'];
  for(const key of preferred){
    const value=obj[key];
    if(typeof value==='string'&&/^https?:\/\//i.test(value)) return value;
    if(value&&typeof value==='object'){
      const lists=[value.urlList,value.url_list,value.urls];
      for(const list of lists){
        if(Array.isArray(list)){
          const found=list.find(x=>typeof x==='string'&&/^https?:\/\//i.test(x));
          if(found) return found;
        }
      }
      const nested=deepImageUrl(value,depth+1,seen);
      if(nested) return nested;
    }
  }
  for(const list of [obj.urlList,obj.url_list,obj.urls]){
    if(Array.isArray(list)){
      const found=list.find(x=>typeof x==='string'&&/^https?:\/\//i.test(x));
      if(found) return found;
    }
  }
  for(const [key,value] of Object.entries(obj)){
    if(/avatar|profile|user/i.test(key)) continue;
    if(typeof value==='string'&&/^https?:\/\//i.test(value)&&/\.(?:png|jpe?g|webp)(?:\?|$)/i.test(value)) return value;
    if(value&&typeof value==='object'){
      const found=deepImageUrl(value,depth+1,seen);
      if(found) return found;
    }
  }
  return '';
}

export function userOf(data={}){
  return deepValue(data,['uniqueId','unique_id','uniqueID','userName','username','displayId','nickname','nickName'])||'viewer';
}

export function commentOf(data={}){
  return deepValue(data,['comment','content','text','message','msg'])||'';
}

export function likeCountOf(data={}){
  const raw=data.likeCount??data.like_count??data.count??1;
  const n=Number(raw);
  return Number.isFinite(n)?Math.max(1,Math.min(5000,Math.floor(n))):1;
}

export function normalizeGift(data={}){
  const giftId=data.giftId??data.gift_id??data.gift?.id??deepValue(data,['giftId','gift_id','id'])||null;
  const gift=data.giftName||data.extendedGiftInfo?.name||data.gift?.name||deepValue(data,['giftName','gift_name'])||`gift-${giftId??'unknown'}`;
  const diamondRaw=data.diamondCount??data.diamond_count??data.extendedGiftInfo?.diamondCount??data.extendedGiftInfo?.diamond_count??deepNumber(data,['diamondCount','diamond_count','diamondCost','diamond_cost','cost']);
  return {
    type:'gift',
    user:userOf(data),
    gift:String(gift),
    giftId:giftId==null?null:String(giftId),
    count:Math.max(1,Number(data.repeatCount??data.repeat_count??data.count??1)||1),
    diamondCount:Math.max(0,Number(diamondRaw)||0),
    repeatEnd:data.repeatEnd??data.repeat_end??true,
    giftType:Number(data.giftType??data.gift_type??data.extendedGiftInfo?.type??0)||0,
    icon:deepImageUrl(data)
  };
}

export function catalogGift(g={}){
  const id=g.id??g.giftId??g.gift_id??g.gift?.id??deepValue(g,['giftId','gift_id'])||null;
  const name=g.name??g.giftName??g.gift_name??g.gift?.name??deepValue(g,['giftName','gift_name','name'])??`gift-${id??'unknown'}`;
  const diamondRaw=g.diamondCount??g.diamond_count??g.diamondCost??g.cost??g.gift?.diamondCount??deepNumber(g,['diamondCount','diamond_count','diamondCost','diamond_cost','cost']);
  const type=Number(g.type??g.giftType??g.gift_type??g.gift?.type??0)||0;
  return {
    id:id==null?null:String(id),
    name:String(name),
    diamondCount:Math.max(0,Number(diamondRaw)||0),
    type,
    icon:String(g.icon?.urlList?.[0]||g.icon?.url_list?.[0]||g.image?.urlList?.[0]||g.image?.url_list?.[0]||g.iconUrl||g.imageUrl||deepImageUrl(g)||''),
    isCombo:Boolean(g.isCombo??g.combo??type===1)
  };
}

export function normalizeCatalog(raw,live){
  let list=Array.isArray(raw)?raw:raw?.gifts||raw?.giftList||raw?.availableGifts||[];
  if(!Array.isArray(list)&&Array.isArray(live?.availableGifts)) list=live.availableGifts;
  if(!Array.isArray(list)) list=[];
  const seen=new Set();
  return list.map(catalogGift).filter(g=>{
    const key=g.id||g.name.toLowerCase();
    if(!key||seen.has(key)) return false;
    seen.add(key);return true;
  }).sort((a,b)=>(a.diamondCount-b.diamondCount)||a.name.localeCompare(b.name));
}
