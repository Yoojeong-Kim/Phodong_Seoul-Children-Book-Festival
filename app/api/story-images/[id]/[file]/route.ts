import { env } from "cloudflare:workers";
import { ensureStoryTables } from "../../../../../lib/story-store";

export async function GET(_:Request,{params}:{params:Promise<{id:string,file:string}>}){
 const {id,file}=await params;
 if(!/^[0-9a-f-]{36}$/.test(id)||!/^(?:page-[1-7](?:-style-v[2-4])?|cover-v\d+)\.png$/.test(file))return new Response("Not found",{status:404});
 await ensureStoryTables();
 const key=`stories/${id}/${file}`;
 const row=await env.DB.prepare("SELECT b64 FROM story_images WHERE key=?").bind(key).first<{b64:string}>();
 if(!row?.b64)return new Response("Not found",{status:404});
 const bin=atob(row.b64);
 const bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++){bytes[i]=bin.charCodeAt(i);}
 return new Response(bytes.buffer,{headers:{"Content-Type":"image/png","Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
