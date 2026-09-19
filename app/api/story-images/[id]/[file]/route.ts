import { env } from "cloudflare:workers";

export const dynamic = 'force-dynamic';

export async function GET(_:Request,{params}:{params:Promise<{id:string,file:string}>}){
 const {id,file}=await params;
 // cover-v1, page-1-v1, page-2-v1, photo-0, photo-1 등 허용
 if(!/^[0-9a-f-]{36}$/.test(id)||!/^(?:cover-v\d+|page-[0-9]-v\d+|photo-\d+)\.(png|jpg|jpeg)$/.test(file))return new Response("Not found",{status:404});
 const key=`stories/${id}/${file}`;
 const row=await env.DB.prepare("SELECT b64 FROM story_images WHERE key=?").bind(key).first<{b64:string}>();
 if(!row?.b64)return new Response("Not found",{status:404});
 const bin=atob(row.b64);
 const bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++){bytes[i]=bin.charCodeAt(i);}
 const isJpg=file.endsWith(".jpg")||file.endsWith(".jpeg");
 // 이미지는 변경되지 않으므로 CDN/브라우저 캐싱 최대화
 return new Response(bytes.buffer,{headers:{"Content-Type":isJpg?"image/jpeg":"image/png","Cache-Control":"public, max-age=86400, immutable","Access-Control-Allow-Origin":"*"}});
}
