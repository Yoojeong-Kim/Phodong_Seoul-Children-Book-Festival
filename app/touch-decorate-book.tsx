"use client";
import {PointerEvent,useRef,useState} from "react";
import type {Decoration,Sticker,StoryData,Stroke} from "./story-experience";

const stickerSources=Array.from({length:9},(_,i)=>`/stickers/sticker-${String(i+1).padStart(2,"0")}.png`);
const colors=["#ef5f89","#ff9f43","#ffd43b","#57b77a","#4d91e8","#7558c9","#3d2940"];

function BookPage({story,page}:{story:StoryData;page:number}){
 const p=story.pages[page];
 return <article className="story-text-page">
  <div className="page-header">
   <small>{story.child_name}의 동화</small>
   <span className="page-indicator">{page+1} / {story.pages.length}쪽</span>
  </div>
  <h2>{p.title}</h2>
  <div className="text-divider">✦ ✦ ✦</div>
  <p>{p.text}</p>
 </article>;
}

export function TouchDecorateBook({story,finish}:{story:StoryData;finish:(d:Decoration)=>Promise<void>}){
 const [page,setPage]=useState(0),[mode,setMode]=useState<"pen"|"sticker">("pen"),[stickers,setStickers]=useState<Sticker[]>(story.stickers||[]),[drawings,setDrawings]=useState<Stroke[]>(story.drawings||[]),[color,setColor]=useState(colors[0]),[width,setWidth]=useState(18),[ghost,setGhost]=useState<{src:string;x:number;y:number}|null>(null),[saving,setSaving]=useState(false),bookRef=useRef<HTMLDivElement>(null),drawing=useRef<Stroke|null>(null),pointers=useRef(new Map<number,{id:string;x:number;y:number}>()),pinch=useRef<{id:string;distance:number;size:number}|null>(null);
 function pos(e:PointerEvent){const r=bookRef.current?.getBoundingClientRect();if(!r)return null;return {x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100)),inside:e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom}}
 function penStart(e:PointerEvent<SVGSVGElement>){if(mode!=="pen")return;e.currentTarget.setPointerCapture(e.pointerId);const p=pos(e);if(!p)return;drawing.current={id:crypto.randomUUID(),page,color,width,points:[p]};setDrawings(v=>[...v,drawing.current!])}
 function penMove(e:PointerEvent<SVGSVGElement>){if(!drawing.current||!e.currentTarget.hasPointerCapture(e.pointerId))return;const p=pos(e);if(!p)return;drawing.current={...drawing.current,points:[...drawing.current.points,p]};const next=drawing.current;setDrawings(v=>v.map(s=>s.id===next!.id?next!:s))}
 function penEnd(){drawing.current=null}
 function startNew(e:PointerEvent<HTMLButtonElement>,src:string){e.currentTarget.setPointerCapture(e.pointerId);setGhost({src,x:e.clientX,y:e.clientY})}
 function moveNew(e:PointerEvent){if(ghost)setGhost(v=>v&&({...v,x:e.clientX,y:e.clientY}))}
 function endNew(e:PointerEvent,src:string){const p=pos(e);setGhost(null);if(p?.inside)setStickers(v=>[...v,{id:crypto.randomUUID(),src,page,x:p.x,y:p.y,size:112}])}
 function stickerDown(e:PointerEvent<HTMLDivElement>,id:string){e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{id,x:e.clientX,y:e.clientY});const same=[...pointers.current.values()].filter(p=>p.id===id);if(same.length===2){const [a,b]=same;const sticker=stickers.find(s=>s.id===id);if(sticker)pinch.current={id,distance:Math.hypot(a.x-b.x,a.y-b.y),size:sticker.size}}}
 function stickerMove(e:PointerEvent<HTMLDivElement>,id:string){if(!e.currentTarget.hasPointerCapture(e.pointerId))return;pointers.current.set(e.pointerId,{id,x:e.clientX,y:e.clientY});const same=[...pointers.current.values()].filter(p=>p.id===id);if(same.length>=2){const [a,b]=same,base=pinch.current;if(base?.id===id&&base.distance>0){const size=Math.max(55,Math.min(240,base.size*Math.hypot(a.x-b.x,a.y-b.y)/base.distance));setStickers(v=>v.map(s=>s.id===id?{...s,size}:s))}}else{const p=pos(e);if(p)setStickers(v=>v.map(s=>s.id===id?{...s,x:p.x,y:p.y}:s))}}
 function stickerUp(e:PointerEvent<HTMLDivElement>,id:string){pointers.current.delete(e.pointerId);if([...pointers.current.values()].filter(p=>p.id===id).length<2)pinch.current=null}
 const pageStrokes=drawings.filter(s=>s.page===page),pageStickers=stickers.filter(s=>s.page===page);
 const hasImage=!!story.pages[page]?.image_url;
 return <section className="screen story decorator"><div className="decorate-head"><div><small>포동이의 동화책장 🎨</small><h2>내 동화책을 마음껏 꾸며 봐</h2></div><div className="mode-tabs"><button className={mode==="pen"?"on":""} onClick={()=>setMode("pen")}>✏️ 펜으로 그리기</button><button className={mode==="sticker"?"on":""} onClick={()=>setMode("sticker")}>🌟 스티커 붙이기</button></div></div>{mode==="pen"?<div className="pen-tools">{colors.map(c=><button key={c} className={color===c?"on":""} style={{background:c}} onClick={()=>setColor(c)} aria-label={`${c} 색상`}/>)}<button className={width===10?"on":""} onClick={()=>setWidth(10)}>가는 펜</button><button className={width===18?"on":""} onClick={()=>setWidth(18)}>보통 펜</button><button className={width===28?"on":""} onClick={()=>setWidth(28)}>굵은 펜</button><button onClick={()=>setDrawings(v=>v.filter(s=>s.page!==page))}>이 페이지 지우기</button></div>:<><p className="pinch-tip">한 손가락으로 옮기고, 두 손가락으로 크기를 조절해 봐.</p><div className="sticker-tray">{stickerSources.map((src,i)=><button key={src} aria-label={`${i+1}번째 스티커`} onPointerDown={e=>startNew(e,src)} onPointerMove={moveNew} onPointerUp={e=>endNew(e,src)}><img src={src} alt="" draggable={false}/></button>)}</div></>}
 <div ref={bookRef} className="book decorate-canvas text-only-book"><BookPage story={story} page={page}/><svg className={`drawing-layer ${mode==="pen"?"active":""}`} viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={penStart} onPointerMove={penMove} onPointerUp={penEnd} onPointerCancel={penEnd}>{pageStrokes.map(s=><polyline key={s.id} points={s.points.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width/2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>)}</svg>{pageStickers.map(s=><div key={s.id} className="placed-sticker" style={{left:`${s.x}%`,top:`${s.y}%`,width:s.size}} onPointerDown={e=>stickerDown(e,s.id)} onPointerMove={e=>stickerMove(e,s.id)} onPointerUp={e=>stickerUp(e,s.id)} onPointerCancel={e=>stickerUp(e,s.id)}><img src={s.src} alt="붙인 포동이 스티커" draggable={false}/><button className="remove-sticker" aria-label="스티커 삭제" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setStickers(v=>v.filter(x=>x.id!==s.id))}}>×</button></div>)}</div>
 <div className="decorate-footer"><button disabled={page===0} onClick={()=>setPage(v=>v-1)}>← 앞 페이지</button><strong>{page+1} / {story.pages.length}</strong>{page<story.pages.length-1?<button onClick={()=>setPage(v=>v+1)}>다음 페이지 →</button>:<button className="finish" disabled={saving} onClick={async()=>{setSaving(true);await finish({stickers,drawings});setSaving(false)}}>{saving?"저장 중…":"꾸미기 완료! 책장으로"}</button>}</div>{ghost&&<img className="sticker-ghost" src={ghost.src} style={{left:ghost.x,top:ghost.y}} alt=""/>}<style>{styles}</style></section>
}

const styles=`
.decorate-head{max-width:1180px;margin:0 auto 10px;display:flex;justify-content:space-between;align-items:end;gap:20px}
.decorate-head small{color:#f55f91;font-weight:700}
.decorate-head h2{margin:3px 0;font-size:clamp(22px,2.8vw,34px);text-shadow:0 2px #fff,0 10px 24px #b9517422}
.mode-tabs,.pen-tools,.sticker-tray{background:linear-gradient(145deg,#ffffff,#fff6f9);border:1px solid #fff;box-shadow:inset 0 1px #fff,inset 0 -1px #edd5dd,0 14px 34px #7f42571c}
.mode-tabs{display:flex;padding:5px;border-radius:16px}
.mode-tabs button{border:0;background:none;padding:10px 14px;border-radius:12px;font-size:14px}
.mode-tabs button.on{background:linear-gradient(145deg,#fff0f5,#ffdbe7);color:#bd3d69;font-weight:700}
.pen-tools,.sticker-tray{max-width:1180px;margin:0 auto 10px;display:flex;align-items:center;gap:8px;overflow-x:auto;padding:8px 12px;border-radius:18px}
.pen-tools button{flex:0 0 auto;border:1px solid #ead1da;background:#fff7fa;border-radius:99px;padding:7px 11px;font-size:13px}
.pen-tools button[style]{width:28px;height:28px;padding:0;border:3px solid #fff;box-shadow:0 0 0 1px #ddc4cc}
.pen-tools button.on{box-shadow:0 0 0 3px #3d2940}
.pinch-tip{text-align:center;color:#8b6e78;margin:0 auto 6px;font-size:13px}
.sticker-tray button{width:68px;height:68px;flex:0 0 68px;border:0;background:linear-gradient(145deg,#fffafd,#ffe9f0);border-radius:15px;padding:4px;touch-action:none;box-shadow:inset 3px 4px 8px #fff,inset -4px -5px 9px #e7b4c24a,0 6px 13px #91445f15}
.sticker-tray img{width:100%;height:100%;object-fit:contain;pointer-events:none}
.decorator{padding:clamp(8px,1.4vw,16px) clamp(10px,2vw,24px)!important}
.decorate-canvas{position:relative;width:min(1420px,97vw);max-width:97vw;height:clamp(550px,calc(100svh - 180px),780px);margin:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);border-radius:28px;overflow:hidden;box-shadow:0 30px 85px rgba(61,41,64,0.18)}
.decorate-canvas article{padding:clamp(20px,3vw,40px) clamp(24px,3.5vw,50px) 70px;display:flex;flex-direction:column;justify-content:center;overflow:visible!important}
.decorate-canvas article h2{font-size:clamp(19px,2.2vw,28px);margin:4px 0 12px;font-weight:700}
.decorate-canvas article p{font-size:clamp(17px,1.7vw,21px);line-height:1.8;max-height:none!important;overflow:visible!important;margin:0}
.drawing-layer{position:absolute;inset:0;z-index:10;width:100%;height:100%;pointer-events:none}
.drawing-layer.active{pointer-events:auto;touch-action:none;cursor:crosshair}
.placed-sticker{position:absolute;z-index:12;transform:translate(-50%,-50%);touch-action:none;filter:drop-shadow(0 5px 5px #5e354b3d)}
.placed-sticker>img{display:block;width:100%;height:auto;pointer-events:none}
.remove-sticker{position:absolute;right:-8px;top:-8px;width:25px;height:25px;padding:0;border:2px solid #fff;border-radius:50%;background:#3d2940;color:#fff;font-size:17px;line-height:19px;box-shadow:0 3px 9px #442a3655;touch-action:manipulation}
.sticker-ghost{position:fixed;z-index:100;width:120px;max-height:150px;object-fit:contain;transform:translate(-50%,-50%);pointer-events:none}
.decorate-footer{max-width:760px;margin:10px auto 0;display:flex;justify-content:space-between;align-items:center;gap:10px}
.decorate-footer button{border:0;background:linear-gradient(145deg,#fff5f8,#f4dce4);padding:9px 16px;border-radius:99px;font-weight:600;box-shadow:inset 0 1px #fff,inset 0 -2px 4px #bd789020,0 6px 14px #76374d16}
.decorate-footer button:disabled{opacity:.35}
.finish{background:linear-gradient(145deg,#ff789f,#e94b7f)!important;color:#fff!important}
@media(max-width:850px){
 .decorate-head{display:block;text-align:center}
 .mode-tabs{width:max-content;margin:8px auto}
 .decorate-canvas{grid-template-columns:1fr;grid-template-rows:44% 56%;height:calc(100svh - 220px);min-height:480px}
 .placed-sticker{max-width:32vw}
}
@media(max-width:560px){
 .decorate-head h2{font-size:22px}
 .mode-tabs button{padding:8px;font-size:12px}
 .decorate-canvas{height:calc(100svh - 200px);min-height:440px}
 .decorate-footer button{font-size:12px;padding:8px 12px}
 .sticker-tray button{width:58px;height:58px;flex-basis:58px}
}
/* text only storybook layout */
.decorate-canvas.text-only-book{grid-template-columns:1fr!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important;background:radial-gradient(circle at 50% 30%,#ffffff 0%,#fffdfb 60%,#fff7f2 100%)!important;padding:clamp(28px,4vw,56px) clamp(24px,5vw,72px) 80px!important}
.story-text-page{width:100%;max-width:820px;margin:auto;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 0}
.story-text-page .page-header{display:flex;justify-content:space-between;width:100%;align-items:center;margin-bottom:20px}
.story-text-page .page-header small{color:#f55f91;font-weight:700;font-size:16px}
.story-text-page .page-indicator{background:#ffe6ef;color:#c73568;padding:4px 14px;border-radius:99px;font-weight:800;font-size:14px}
.story-text-page h2{font-size:clamp(26px,4vw,42px);color:#3d2940;margin:0 0 14px;font-weight:800;letter-spacing:-.02em}
.story-text-page .text-divider{color:#f9a8c4;font-size:15px;letter-spacing:8px;margin-bottom:24px}
.story-text-page p{font-size:clamp(20px,2.8vw,30px);line-height:2.05;color:#493545;word-break:keep-all;text-wrap:balance;margin:0;font-weight:500;font-family:"Gowun Dodum",sans-serif}
`;
