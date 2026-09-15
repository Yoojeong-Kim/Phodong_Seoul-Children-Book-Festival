import { env } from "cloudflare:workers";

export type StoryPage={page:number;title:string;text:string;image_prompt:string;image_url?:string};
export type CharacterInfo={name:string;role:string;appearance:string};
export type StoryRecord={id:string;child_name:string;question:string;answer:string;title:string;summary:string;pages:StoryPage[];characters?:CharacterInfo[];stickers?:unknown[];drawings?:unknown[];status:string;created_at:number};

export async function ensureStoryTables(){
 const db=env.DB;
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, child_name TEXT NOT NULL, question TEXT NOT NULL DEFAULT '', answer TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, summary TEXT NOT NULL, pages_json TEXT NOT NULL, characters_json TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'generating', created_at INTEGER NOT NULL)`),
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_stories_status_created ON stories(status, created_at DESC)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS image_slots (slot INTEGER PRIMARY KEY, story_id TEXT, page INTEGER, locked_until INTEGER NOT NULL DEFAULT 0)`),
  db.prepare(`INSERT OR IGNORE INTO image_slots (slot,locked_until) VALUES (1,0),(2,0),(3,0)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS story_stickers (story_id TEXT PRIMARY KEY, stickers_json TEXT NOT NULL DEFAULT '[]')`),
  db.prepare(`CREATE TABLE IF NOT EXISTS story_images (key TEXT PRIMARY KEY, b64 TEXT NOT NULL, created_at INTEGER NOT NULL)`),
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_story_images_key ON story_images(key)`)
 ]);
 try{await db.prepare("ALTER TABLE stories ADD COLUMN characters_json TEXT DEFAULT '[]'").run();}catch{}
 try{await db.prepare("ALTER TABLE stories ADD COLUMN question TEXT NOT NULL DEFAULT ''").run();}catch{}
 try{await db.prepare("ALTER TABLE stories ADD COLUMN answer TEXT NOT NULL DEFAULT ''").run();}catch{}
 try{await db.prepare("ALTER TABLE stories ADD COLUMN genre TEXT NOT NULL DEFAULT ''").run();}catch{}
 try{await db.prepare("ALTER TABLE stories ADD COLUMN object_name TEXT NOT NULL DEFAULT ''").run();}catch{}
}
export function rowToStory(row:any):StoryRecord{
 const saved=JSON.parse(row.stickers_json||"[]"),decoration=Array.isArray(saved)?{stickers:saved,drawings:[]}:{stickers:saved.stickers||[],drawings:saved.drawings||[]};
 let chars:CharacterInfo[]=[];
 try{chars=JSON.parse(row.characters_json||"[]");}catch{}
 return {...row,pages:JSON.parse(row.pages_json),characters:chars,question:row.question||"",answer:row.answer||"",...decoration};
}
export function openAIKey(){
 const key=(env as any)?.OPENAI_API_KEY||(globalThis as any)?.OPENAI_API_KEY||(typeof process!=="undefined"?process.env?.OPENAI_API_KEY:undefined);
 if(!key){
  const keys=Object.keys(env||{}).join(", ");
  throw new Error(`OPENAI_API_KEY is not configured (env keys: [${keys}])`);
 }
 return key;
}
