import { env } from "cloudflare:workers";

export type StoryPage={page:number;title:string;text:string;image_prompt:string;image_url?:string};
export type CharacterInfo={name:string;role:string;appearance:string;photo?:string;photo_url?:string};
export type StoryRecord={id:string;child_name:string;question:string;answer:string;title:string;summary:string;pages:StoryPage[];characters?:CharacterInfo[];stickers?:unknown[];drawings?:unknown[];guardian_contact_name?:string;guardian_phone?:string;guardian_email?:string;status:string;created_at:number};

// Worker 인스턴스당 한 번만 실행 (매 요청마다 16개 쿼리 낭비 방지)
let tablesReady=false;

export async function ensureStoryTables(){
 if(tablesReady)return;
 const db=env.DB;
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, child_name TEXT NOT NULL, question TEXT NOT NULL DEFAULT '', answer TEXT NOT NULL DEFAULT '', genre TEXT NOT NULL DEFAULT '', object_name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, summary TEXT NOT NULL, pages_json TEXT NOT NULL, characters_json TEXT DEFAULT '[]', guardian_contact_name TEXT DEFAULT '', guardian_phone TEXT DEFAULT '', guardian_email TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'generating', created_at INTEGER NOT NULL)`),
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_stories_status_created ON stories(status, created_at DESC)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS image_slots (slot INTEGER PRIMARY KEY, story_id TEXT, page INTEGER, locked_until INTEGER NOT NULL DEFAULT 0)`),
  // 슬롯 6개: 5팀 동시 × 3페이지를 여유 있게 처리
  db.prepare(`INSERT OR IGNORE INTO image_slots (slot,locked_until) VALUES (1,0),(2,0),(3,0),(4,0),(5,0),(6,0)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS story_stickers (story_id TEXT PRIMARY KEY, stickers_json TEXT NOT NULL DEFAULT '[]')`),
  db.prepare(`CREATE TABLE IF NOT EXISTS story_images (key TEXT PRIMARY KEY, b64 TEXT NOT NULL, created_at INTEGER NOT NULL)`),
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_story_images_key ON story_images(key)`)
 ]);
 tablesReady=true;
}
export function rowToStory(row:any):StoryRecord{
 const saved=JSON.parse(row.stickers_json||"[]"),decoration=Array.isArray(saved)?{stickers:saved,drawings:[]}:{stickers:saved.stickers||[],drawings:saved.drawings||[]};
 let chars:CharacterInfo[]=[];
 try{
  chars=JSON.parse(row.characters_json||"[]");
  // ensure photo_url is populated for characters
  chars=chars.map((c,idx)=>({
   ...c,
   photo_url:c.photo_url || (row.id ? `/api/story-images/${row.id}/photo-${idx}.png` : c.photo || "")
  }));
 }catch{}
 return {...row,pages:JSON.parse(row.pages_json),characters:chars,question:row.question||"",answer:row.answer||"",guardian_contact_name:row.guardian_contact_name||"",guardian_phone:row.guardian_phone||"",guardian_email:row.guardian_email||"",...decoration};
}
export function geminiKey(): string | null {
 const e = (env as any) || {};
 const raw = e.GEMINI_API_KEY || e.GOOGLE_API_KEY || e.GOOGLE_AI_API_KEY || e.GEMINI_KEY
  || (globalThis as any)?.GEMINI_API_KEY || (globalThis as any)?.GOOGLE_API_KEY
  || (typeof process !== "undefined" ? (process.env?.GEMINI_API_KEY || process.env?.GOOGLE_API_KEY) : undefined);
 if (!raw) return null;
 return String(raw).trim().replace(/^["']|["']$/g, "").trim();
}

export function openAIKey(): string | null {
 const raw = (env as any)?.OPENAI_API_KEY || (globalThis as any)?.OPENAI_API_KEY || (typeof process !== "undefined" ? process.env?.OPENAI_API_KEY : undefined);
 if (!raw) return null;
 return String(raw).trim().replace(/^["']|["']$/g, "").trim();
}
