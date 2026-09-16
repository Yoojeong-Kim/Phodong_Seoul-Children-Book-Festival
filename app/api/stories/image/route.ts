import { env } from "cloudflare:workers";
import { ensureStoryTables, openAIKey, rowToStory } from "../../../../lib/story-store";

export async function POST(req:Request){
 let lockId:string|undefined,lockPage:number|undefined,slotAcquired=false;
 try{
  await ensureStoryTables();
  const {id,page}=await req.json() as {id:string,page:number};
  lockId=id;lockPage=page;
  if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isInteger(page)||page<0||page>2)return Response.json({error:"잘못된 요청이야."},{status:400});
  const row=await env.DB.prepare("SELECT * FROM stories WHERE id=?").bind(id).first();
  if(!row)return Response.json({error:"동화를 찾지 못했어."},{status:404});
  const story=rowToStory(row),target=story.pages[page];
  if(!target)return Response.json({error:"해당 페이지가 없어."},{status:404});

  // 페이지별 캐시 키
  const pageKey=page===0?"cover-v1":`page-${page}-v1`;

  // 캐시 확인
  if(target.image_url?.includes(pageKey))return Response.json({image_url:target.image_url,complete:story.status==="complete"});
  const key=`stories/${id}/${pageKey}.png`;
  const existing=await env.DB.prepare("SELECT 1 FROM story_images WHERE key=?").bind(key).first();
  if(existing){
   target.image_url=`/api/story-images/${id}/${pageKey}.png`;
   await env.DB.prepare("UPDATE stories SET pages_json=? WHERE id=?").bind(JSON.stringify(story.pages),id).run();
   const refreshed=rowToStory(await env.DB.prepare("SELECT * FROM stories WHERE id=?").bind(id).first() as any);
   const allDone=refreshed.pages.every((p:any,i:number)=>!!p.image_url?.includes(i===0?"cover-v1":`page-${i}-v1`));
   if(allDone&&refreshed.status!=="complete")await env.DB.prepare("UPDATE stories SET status='complete' WHERE id=?").bind(id).run();
   return Response.json({image_url:target.image_url,complete:allDone});
  }

  // 슬롯 획득
  const slot=await env.DB.prepare(`UPDATE image_slots SET story_id=?,page=?,locked_until=? WHERE slot=(SELECT slot FROM image_slots WHERE locked_until<? ORDER BY slot LIMIT 1) RETURNING slot`).bind(id,page,Date.now()+240000,Date.now()).first<{slot:number}>();
  if(!slot)return Response.json({queued:true},{status:202});
  slotAcquired=true;

  // 캐릭터 외형 추출
  const characters=story.characters||[];
  const child=characters.find((c:any)=>c.role==="child")||characters[0];
  const guardian=characters.find((c:any)=>c.role==="guardian")||characters[1];

  const childDesc=child?`Child (${child.name}): ${child.appearance}`:"A young child with a warm smile";
  const guardianDesc=guardian?`Guardian (${guardian.name}): ${guardian.appearance}`:"A loving parent with a warm smile";

  const STYLE=`Art Style & Rendering Specification:
Create an ultra-polished, premium 3D animated children's book illustration with a warm, magical, emotionally comforting tone. The image should feel like a high-end feature-film still from a luxurious family animation.
Human characters should be stylized as adorable figures with large expressive eyes, softly rounded cheeks, tiny delicate noses, small softly smiling mouths, smooth skin, subtle blush on the cheeks. Crystal-clear glossy bright eyes that catch warm catchlights. Hair should appear soft, fluffy, and delicately sculpted.
Lighting: Radiant golden hour sunlight. Warm golden rim lighting on characters' hair and shoulders. Soft, flattering facial lighting.
Color Palette: Warm peach, apricot, warm blush pink, creamy honey-beige, ivory, glowing amber bathed in a clear golden-rosy glow.
Rendering Quality: High-end cinematic 3D CGI (global illumination, ambient occlusion, soft reflections, subsurface scattering).
Camera: Slightly above eye level, both subjects prominently framed together in a warm embracing or smiling composition.
Absolutely NO text, letters, words, logos, subtitles, or watermarks anywhere in the image.`;

  // 페이지별 image_prompt 사용 (AI가 생성한 장면 설명)
  const pagePrompt=target.image_prompt||"";
  const fullPrompt=`[Children''s Book Illustration - Page ${page+1}]

[CRITICAL - Two characters ONLY, exactly 2 people, no duplicates, no extras]:
1. ${childDesc}
2. ${guardianDesc}

[Scene from story]: ${pagePrompt}

[Art Style]:
${STYLE}

[Composition]: Children''s book page illustration. Both characters featured in a warm, storybook scene.`;

  let response:Response;
  if (page > 0) {
    const coverRef = await env.DB.prepare("SELECT b64 FROM story_images WHERE key=?").bind(`stories/${id}/cover-v1.png`).first<{b64:string}>();
    if (!coverRef) {
      return Response.json({error:"표지 그림이 아직 없습니다. 순서대로 만들어주세요."},{status:409});
    }
    const bin = atob(coverRef.b64);
    const bytes = new Uint8Array(bin.length);
    for(let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
    
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("prompt", fullPrompt.substring(0,4000));
    form.append("size", "1024x1024");
    form.append("quality", "medium");
    form.append("response_format", "b64_json");
    form.append("image", new Blob([bytes], {type:"image/png"}), "reference.png");

    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAIKey()}` },
      body: form
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAIKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: fullPrompt.substring(0,4000),
        size: "1024x1024",
        quality: "medium",
        response_format: "b64_json"
      })
    });
  }

  if(!response.ok){const detail=await response.text();console.error("image_api",response.status,detail.slice(0,500));throw new Error(`이미지 API 오류 ${response.status}`);}
  const data=await response.json() as any;
  let b64=data.data?.[0]?.b64_json;
  if(!b64&&data.data?.[0]?.url){
   const res=await fetch(data.data[0].url);
   if(res.ok){const buf=await res.arrayBuffer();let binary='';const bytes=new Uint8Array(buf);for(let i=0;i<bytes.byteLength;i++){binary+=String.fromCharCode(bytes[i]);}b64=btoa(binary);}
  }
  if(!b64)throw new Error("이미지 데이터 없음");

  await env.DB.prepare("INSERT INTO story_images (key,b64,created_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET b64=excluded.b64").bind(key,b64,Date.now()).run();
  target.image_url=`/api/story-images/${id}/${pageKey}.png`;
  await env.DB.prepare("UPDATE stories SET pages_json=? WHERE id=?").bind(JSON.stringify(story.pages),id).run();
  const refreshed2=rowToStory(await env.DB.prepare("SELECT * FROM stories WHERE id=?").bind(id).first() as any);
  const allDone2=refreshed2.pages.every((p:any,i:number)=>!!p.image_url?.includes(i===0?"cover-v1":`page-${i}-v1`));
  if(allDone2)await env.DB.prepare("UPDATE stories SET status='complete' WHERE id=?").bind(id).run();
  return Response.json({image_url:target.image_url,complete:allDone2});
 }catch(e){console.error("image_gen_failed",e instanceof Error?e.message:String(e));return Response.json({error:"이미지를 만드는 데 실패했어."},{status:500})}
 finally{try{if(slotAcquired&&lockId&&Number.isInteger(lockPage))await env.DB.prepare("UPDATE image_slots SET story_id=NULL,page=NULL,locked_until=0 WHERE story_id=? AND page=?").bind(lockId,lockPage).run()}catch{}}
}
