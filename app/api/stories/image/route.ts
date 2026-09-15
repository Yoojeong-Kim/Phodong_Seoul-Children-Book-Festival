import { env } from "cloudflare:workers";
import { ensureStoryTables, openAIKey, rowToStory } from "../../../../lib/story-store";

export async function POST(req:Request){
 let lockId:string|undefined,lockPage:number|undefined,slotAcquired=false;
 try{
  await ensureStoryTables();
  const {id,page}=await req.json() as {id:string,page:number};
  lockId=id;lockPage=page;
  if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isInteger(page)||page<0||page>4)return Response.json({error:"잘못된 요청이야."},{status:400});
  const row=await env.DB.prepare("SELECT * FROM stories WHERE id=?").bind(id).first();
  if(!row)return Response.json({error:"동화를 찾지 못했어."},{status:404});
  const story=rowToStory(row),target=story.pages[page];

  // 표지(page 0)만 이미지 생성, 나머지 페이지는 바로 complete 처리
  if(page>0){
   const complete=story.pages.every((p,i)=>i===0?!!p.image_url?.includes("cover-v1"):true);
   if(complete&&story.status!=="complete"){
    await env.DB.prepare("UPDATE stories SET status='complete' WHERE id=?").bind(id).run();
   }
   return Response.json({image_url:null,complete});
  }

  // 표지 캐시 확인
  if(target.image_url?.includes("cover-v1"))return Response.json({image_url:target.image_url,complete:story.status==="complete"});
  const key=`stories/${id}/cover-v1.png`;
  const existing=await env.DB.prepare("SELECT 1 FROM story_images WHERE key=?").bind(key).first();
  if(existing){
   target.image_url=`/api/story-images/${id}/cover-v1.png`;
   await env.DB.prepare("UPDATE stories SET pages_json=?, status='complete' WHERE id=?").bind(JSON.stringify(story.pages),id).run();
   return Response.json({image_url:target.image_url,complete:true});
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
Create an ultra-polished, premium 3D animated children's book cover illustration with a warm, magical, emotionally comforting tone. The image should feel like a high-end feature-film still from a luxurious family animation.
Human characters should be stylized as adorable figures with large expressive eyes, softly rounded cheeks, tiny delicate noses, small softly smiling mouths, smooth skin, subtle blush on the cheeks. Crystal-clear glossy bright eyes that catch warm catchlights. Hair should appear soft, fluffy, and delicately sculpted.
Lighting: Radiant golden hour sunlight. Warm golden rim lighting on characters' hair and shoulders. Soft, flattering facial lighting.
Color Palette: Warm peach, apricot, warm blush pink, creamy honey-beige, ivory, glowing amber — bathed in a clear golden-rosy glow.
Rendering Quality: High-end cinematic 3D CGI (global illumination, ambient occlusion, soft reflections, subsurface scattering).
Camera: Slightly above eye level, both subjects prominently framed together in a warm embracing or smiling composition.
Absolutely NO text, letters, words, logos, subtitles, or watermarks anywhere in the image.`;

  const coverPrompt=`[Family Storybook Cover - Children's Book Festival]

[CRITICAL - Two characters ONLY, exactly 2 people, no duplicates, no extras]:
1. ${childDesc}
2. ${guardianDesc}

[Scene]: A warm, heartwarming cover scene showing both characters together — facing each other or side by side — with joyful, loving expressions radiating happiness and family bond. Their emotions and facial expressions are the most important element. Capture the warmth and tenderness between them clearly.

[Emotion Focus]: The hand-drawn faces in the reference photos show specific emotional expressions (joy, laughter, tenderness, curiosity). Translate those emotional essences into the 3D stylized characters — especially their eye shapes, smile curves, and eyebrow positions.

[Story context]: "${story.title}" — a gentle family story about: ${(story as any).answer||(story as any).question||"family love and togetherness"}.

[Art Style]:
${STYLE}

[Composition]: Book cover format. Both characters prominently centered, warm bokeh background suggesting a cozy home or nature setting. Magical soft glow around them.`;

  const response=await fetch("https://api.openai.com/v1/images/generations",{
   method:"POST",
   headers:{Authorization:`Bearer ${openAIKey()}`,"Content-Type":"application/json"},
   body:JSON.stringify({model:"gpt-image-2",prompt:coverPrompt.substring(0,4000),size:"1024x1024",quality:"medium"})
  });

  if(!response.ok){const detail=await response.text();console.error("image_api",response.status,detail.slice(0,500));throw new Error(`이미지 API 오류 ${response.status}`)}
  const data=await response.json() as any;
  let b64=data.data?.[0]?.b64_json;
  if(!b64&&data.data?.[0]?.url){
   const res=await fetch(data.data[0].url);
   if(res.ok){const buf=await res.arrayBuffer();let binary='';const bytes=new Uint8Array(buf);for(let i=0;i<bytes.byteLength;i++){binary+=String.fromCharCode(bytes[i]);}b64=btoa(binary);}
  }
  if(!b64)throw new Error("이미지 데이터 없음");

  await env.DB.prepare("INSERT INTO story_images (key,b64,created_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET b64=excluded.b64").bind(key,b64,Date.now()).run();
  target.image_url=`/api/story-images/${id}/cover-v1.png`;
  await env.DB.prepare("UPDATE stories SET pages_json=?, status='complete' WHERE id=?").bind(JSON.stringify(story.pages),id).run();
  return Response.json({image_url:target.image_url,complete:true});
 }catch(e){console.error("image_gen_failed",e instanceof Error?e.message:String(e));return Response.json({error:"표지를 만드는 데 실패했어."},{status:500})}
 finally{try{if(slotAcquired&&lockId&&Number.isInteger(lockPage))await env.DB.prepare("UPDATE image_slots SET story_id=NULL,page=NULL,locked_until=0 WHERE story_id=? AND page=?").bind(lockId,lockPage).run()}catch{}}
}

