import { env } from "cloudflare:workers";
import { ensureStoryTables, openAIKey, rowToStory } from "../../../lib/story-store";
import { STORY_SYSTEM_PROMPT, storyInput } from "../../../lib/story-prompt";

export const dynamic = 'force-dynamic';

const ALLOWED_QUESTIONS = new Set([
  "하루 중 우리 가족이 제일 행복한 순간은 언제인가요?",
  "우리 가족이 함께 방문하고 싶은 장소는 어디인가요?",
  "우리 가족만의 재미있는 문화가 있다면 무엇일까요?",
  "우리 가족이 가장 좋아하는 놀이는 무엇인가요?",
  "오늘 이 자리에서 서로에게 해주고 싶은 말이 있나요?",
]);

const storySchema={type:"object",additionalProperties:false,required:["title","summary","pages"],properties:{title:{type:"string"},summary:{type:"string"},pages:{type:"array",minItems:5,maxItems:5,items:{type:"object",additionalProperties:false,required:["page","title","text","image_prompt"],properties:{page:{type:"integer"},title:{type:"string"},text:{type:"string"},image_prompt:{type:"string"}}}}}};

function outputText(data:any){for(const item of data.output||[])for(const content of item.content||[])if(content.type==="output_text")return content.text;throw new Error("동화 응답을 읽지 못했어.")}

async function openAIFetch(url:string,init:RequestInit,retries=2){let response:Response|null=null;for(let attempt=0;attempt<=retries;attempt++){response=await fetch(url,init);if(response.ok||![429,500,502,503,504].includes(response.status))return response;if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)))}return response!}

export async function GET(req:Request){
 await ensureStoryTables();
 const id=new URL(req.url).searchParams.get("id");
 if(id){const row=await env.DB.prepare("SELECT stories.*, COALESCE(story_stickers.stickers_json,'[]') AS stickers_json FROM stories LEFT JOIN story_stickers ON story_stickers.story_id=stories.id WHERE stories.id=? AND stories.status='complete'").bind(id).first();return row?Response.json(rowToStory(row)):Response.json({error:"동화를 찾지 못했어."},{status:404})}
 const result=await env.DB.prepare("SELECT stories.*, COALESCE(story_stickers.stickers_json,'[]') AS stickers_json FROM stories LEFT JOIN story_stickers ON story_stickers.story_id=stories.id WHERE stories.status='complete' ORDER BY stories.created_at DESC LIMIT 60").all();
 return Response.json({stories:(result.results||[]).map(rowToStory)});
}

export async function PUT(req:Request){
 try{
  await ensureStoryTables();
  const body=await req.json() as any,id=String(body.id||""),raw=Array.isArray(body.stickers)?body.stickers:[],rawDrawings=Array.isArray(body.drawings)?body.drawings:[];
  if(!/^[0-9a-f-]{36}$/.test(id)||raw.length>60||rawDrawings.length>300)return Response.json({error:"꾸민 내용을 저장하지 못했어."},{status:400});
  const stickers=raw.map((v:any)=>({id:String(v?.id||"").slice(0,50),src:String(v?.src||""),page:Number(v?.page),x:Number(v?.x),y:Number(v?.y),size:Number(v?.size)}));
  const drawings=rawDrawings.map((v:any)=>({id:String(v?.id||"").slice(0,50),page:Number(v?.page),color:String(v?.color||""),width:Number(v?.width),points:(Array.isArray(v?.points)?v.points:[]).slice(0,600).map((p:any)=>({x:Number(p?.x),y:Number(p?.y)}))}));
  if(stickers.some((v:any)=>!v.id||!/^\/stickers\/sticker-\d{2}\.png$/.test(v.src)||!Number.isInteger(v.page)||v.page<0||v.page>4||!Number.isFinite(v.x)||v.x<0||v.x>100||!Number.isFinite(v.y)||v.y<0||v.y>100||!Number.isFinite(v.size)||v.size<50||v.size>240))return Response.json({error:"스티커 위치를 다시 확인해 줘."},{status:400});
  if(drawings.some((v:any)=>!v.id||!Number.isInteger(v.page)||v.page<0||v.page>4||!/^#[0-9a-f]{6}$/i.test(v.color)||![4,7,10,12,18,28].includes(v.width)||v.points.length<1||v.points.some((p:any)=>!Number.isFinite(p.x)||p.x<0||p.x>100||!Number.isFinite(p.y)||p.y<0||p.y>100)))return Response.json({error:"그림을 저장하지 못했어."},{status:400});
  await env.DB.prepare("INSERT INTO story_stickers (story_id,stickers_json) VALUES (?,?) ON CONFLICT(story_id) DO UPDATE SET stickers_json=excluded.stickers_json").bind(id,JSON.stringify({stickers,drawings})).run();
  return Response.json({saved:true});
 }catch(e){console.error("sticker_save_failed",e);return Response.json({error:"스티커를 저장하지 못했어."},{status:500})}
}

export async function DELETE(req:Request){
 try{
  await ensureStoryTables();
  const id=new URL(req.url).searchParams.get("id")||"";
  if(!/^[0-9a-f-]{36}$/.test(id))return Response.json({error:"잘못된 동화야."},{status:400});
  const found=await env.DB.prepare("SELECT id FROM stories WHERE id=?").bind(id).first();
  if(!found)return Response.json({error:"이미 지워진 동화야."},{status:404});
  await env.DB.prepare("DELETE FROM story_images WHERE key LIKE ?").bind(`stories/${id}/%`).run();
  await env.DB.prepare("DELETE FROM story_stickers WHERE story_id=?").bind(id).run();
  await env.DB.prepare("DELETE FROM stories WHERE id=?").bind(id).run();
  return Response.json({deleted:true});
 }catch(e){console.error("story_delete_failed",e);return Response.json({error:"동화를 지우지 못했어."},{status:500})}
}

export async function POST(req:Request){
 let stage="start";
 try{
  stage="database";
  await ensureStoryTables();

  const body=await req.json() as any;
  const question=String(body.question||"").trim();
  const answer=String(body.answer||"").trim().slice(0,500);
  const characters=(Array.isArray(body.characters)?body.characters:[]).slice(0,2).map((v:any)=>({
   name:String(v?.name||"").trim().slice(0,20),
   role:String(v?.role||"").trim(),
   appearance:String(v?.appearance||"").trim().slice(0,300),
   photo:String(v?.photo||""),
  }));

  // Validate
  if(!ALLOWED_QUESTIONS.has(question))return Response.json({error:"질문을 다시 선택해 줘."},{status:400});
  if(!answer||answer.length<2)return Response.json({error:"가족 이야기를 입력해 줘."},{status:400});
  if(characters.length!==2)return Response.json({error:"두 명의 주인공 정보를 모두 입력해 줘."},{status:400});
  if(characters.some((v:any)=>!v.name||!v.photo))return Response.json({error:"이름과 사진을 모두 입력해 줘."},{status:400});
  if(characters.some((v:any)=>!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(v.photo)))return Response.json({error:"사진을 읽기 어려워. 다시 찍거나 다른 사진을 골라 줘."},{status:400});

  const childName=characters.map((v:any)=>v.name).join(" · ");
  const key=openAIKey();
  const userText=storyInput({characters,question,answer});

  stage="moderation";
  try{
   const moderation=await openAIFetch("https://api.openai.com/v1/moderations",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"omni-moderation-latest",input:[{type:"text",text:userText},...characters.map((v:any)=>({type:"image_url",image_url:{url:v.photo}}))]})},1);
   if(moderation.ok){const mod=await moderation.json() as any;if(mod.results?.[0]?.flagged)return Response.json({error:"다른 사진이나 이야기로 다시 시도해 줘."},{status:400})}
  }catch(e){console.warn("moderation_skipped",e instanceof Error?e.message:String(e))}

  stage="story_api";
  const response=await openAIFetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:STORY_SYSTEM_PROMPT},{role:"user",content:[{type:"text",text:userText},...characters.map((v:any)=>({type:"image_url",image_url:{url:v.photo,detail:"low"}}))]}],response_format:{type:"json_schema",json_schema:{name:"phodong_story",strict:true,schema:storySchema}},max_tokens:4096})});
  if(!response.ok){const detail=await response.text();console.error("story_api",response.status,detail.slice(0,500));if(response.status===400)return Response.json({error:"사진을 읽기 어려워. 다시 찍거나 다른 사진을 골라 줘."},{status:400});if(response.status===429)return Response.json({error:"잠깐 너무 바빠. 1분 뒤 다시 눌러 줘."},{status:429});throw new Error(`동화 API 오류 ${response.status}`)}
  const raw=await response.json() as any;
  const generated=JSON.parse(raw.choices?.[0]?.message?.content||"null");
  if(!generated||!generated.pages)throw new Error("동화 응답을 읽지 못했어.");

  stage="save";
  const id=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare("INSERT INTO stories (id,child_name,question,answer,title,summary,pages_json,characters_json,status,created_at) VALUES (?,?,?,?,?,?,?,?,'generating',?)").bind(id,childName,question,answer,generated.title,generated.summary,JSON.stringify(generated.pages),JSON.stringify(characters),now).run();

  return Response.json({story:{id,child_name:childName,question,answer,title:generated.title,summary:generated.summary,pages:generated.pages,characters,status:"generating",created_at:now}});
 }catch(e){console.error("story_create_failed",stage,e instanceof Error?e.message:String(e));return Response.json({error:stage==="save"?"동화는 만들었는데 저장하지 못했어. 한 번만 다시 눌러 줘.":"잠깐 멈췄어. 입력한 내용 그대로 두고 한 번만 다시 눌러 줘."},{status:500})}
}

