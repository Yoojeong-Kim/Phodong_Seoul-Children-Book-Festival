"use client";
import {ChangeEvent,useRef,useState,useEffect} from "react";
import {Decoration,ReaderBook,Stroke} from "./story-experience";
import {TouchDecorateBook} from "./touch-decorate-book";
import {downloadStoryPdf} from "../lib/generate-pdf";

type Page={page:number;title:string;text:string;image_prompt:string;image_url?:string};
type Sticker={id:string;src:string;page:number;x:number;y:number;size:number};
type Story={
  id:string;
  child_name:string;
  question:string;
  answer:string;
  title:string;
  summary:string;
  pages:Page[];
  characters?:any[];
  stickers?:Sticker[];
  drawings?:Stroke[];
  guardian_contact_name?:string;
  guardian_phone?:string;
  guardian_email?:string;
  status:string;
  created_at:number;
};

type CharDraft={
  photo:string;file:File|null;name:string;
  role:"child"|"guardian";kind:string;otherRole?:string;
  hair:string;hairColor:string;hairStyle?:string;favoriteColor?:string;
  openOptions?:boolean;
};

const hairOptions=["아주 짧은 머리","귀밑 머리","어깨 머리","긴 머리"];
const hairStyleOptions=["생머리","곱슬머리","묶은 머리","파마 머리"];
const hairColorOptions=["검은색","짙은 갈색","밝은 갈색","노란색","자연 갈색"];
const favoriteColorOptions=["빨강","주황","노랑","초록","파랑","보라","분홍","하늘색"];
const childKindOptions=["여자아이","남자아이"];
const guardianKindOptions=["엄마","아빠","기타"];
const otherGuardianOptions=["할머니","할아버지","이모","삼촌","친구","선생님"];

const QUESTIONS=[
  "하루 중 우리 가족이 제일 행복한 순간은 언제인가요?",
  "우리 가족이 함께 방문하고 싶은 장소는 어디인가요?",
  "우리 가족만의 재미있는 문화가 있다면 무엇일까요?",
  "우리 가족이 가장 좋아하는 놀이는 무엇인가요?",
  "오늘 이 자리에서 서로에게 해주고 싶은 말이 있나요?",
];

const QUESTION_PLACEHOLDERS: Record<string, string> = {
  "하루 중 우리 가족이 제일 행복한 순간은 언제인가요?": "예: 저녁에 다 같이 모여서 도란도란 맛있는 밥을 먹을 때가 제일 행복해요!",
  "우리 가족이 함께 방문하고 싶은 장소는 어디인가요?": "예: 푸른 바다가 한눈에 보이고 모래성을 쌓을 수 있는 제주도 해변에 가고 싶어요!",
  "우리 가족만의 재미있는 문화가 있다면 무엇일까요?": "예: 주말 아침마다 가족 노래방을 열어 신나게 춤추고 노래 부르는 문화가 있어요!",
  "우리 가족이 가장 좋아하는 놀이는 무엇인가요?": "예: 거실에서 이불로 비밀 기지를 만들고 보드게임을 하거나 숨바꼭질하는 놀이를 좋아해요!",
  "오늘 이 자리에서 서로에게 해주고 싶은 말이 있나요?": "예: 언제나 내 편이 되어주고 곁에 있어줘서 정말 고맙고 온 마음을 다해 사랑해!",
};

function newChar(role:"child"|"guardian"):CharDraft{
  return {photo:"",file:null,name:"",role,kind:"",otherRole:"",hair:"",hairColor:"",hairStyle:"",favoriteColor:"",openOptions:false};
}

function charAppearance(c:CharDraft):string{
  const roleLabel=c.role==="child"?c.kind||"아이":(c.kind==="기타"?c.otherRole||"가족":c.kind||"보호자");
  const parts=[
    roleLabel,
    c.hairStyle,
    c.hair,
    c.hairColor ? c.hairColor+" 머리" : "",
    c.favoriteColor ? `좋아하는 색: ${c.favoriteColor}` : ""
  ].filter(Boolean);
  return parts.join(", ");
}

export default function Home(){
  const [entered,setEntered]=useState(false);
  const [entering,setEntering]=useState(false);
  const [step,setStep]=useState(0);
  const [view,setView]=useState<"make"|"gallery"|"admin">("make");
  const [chars,setChars]=useState<CharDraft[]>([newChar("child"),newChar("guardian")]);
  const [question,setQuestion]=useState("");
  const [answer,setAnswer]=useState("");
  const [story,setStory]=useState<Story|null>(null);
  const [creating,setCreating]=useState(false);
  const [progress,setProgress]=useState("");
  const [progressPercent,setProgressPercent]=useState(0);
  const [error,setError]=useState("");
  const [stories,setStories]=useState<Story[]>([]);
  const [loadingGallery,setLoadingGallery]=useState(false);
  const [isFromGallery,setIsFromGallery]=useState(false);
  const [showAdminPinModal,setShowAdminPinModal]=useState(false);
  const [adminPin,setAdminPin]=useState("");
  const [adminPinError,setAdminPinError]=useState("");
  const [pdfGeneratingId,setPdfGeneratingId]=useState<string|null>(null);

  function resetAll(){
    setEntered(false);setEntering(false);setStep(0);setView("make");
    setChars([newChar("child"),newChar("guardian")]);
    setQuestion("");setAnswer("");
    setStory(null);setError("");setCreating(false);setProgress("");setProgressPercent(0);
  }

  useEffect(()=>{
    if(typeof window!=="undefined"){
      try{sessionStorage.clear();localStorage.clear();if('scrollRestoration' in history)history.scrollRestoration='manual';}catch{}
      const handlePageShow=(e:PageTransitionEvent)=>{if(e.persisted)resetAll();};
      window.addEventListener("pageshow",handlePageShow);
      return ()=>window.removeEventListener("pageshow",handlePageShow);
    }
  },[]);

  function enter(){if(entering)return;setEntering(true);setTimeout(()=>{setEntered(true);setEntering(false)},850)}

  async function choosePhoto(e:ChangeEvent<HTMLInputElement>,index:number){
    const f=e.target.files?.[0];if(!f)return;setError("");
    try{
      const bitmap=await createImageBitmap(f);
      const max=960,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);
      bitmap.close();
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error()),"image/jpeg",.68));
      const normalized=new File([blob],`family-face-${index+1}.jpg`,{type:"image/jpeg"});
      const url=URL.createObjectURL(normalized);
      setChars(v=>v.map((c,i)=>{
        if(i!==index)return c;
        if(c.photo)URL.revokeObjectURL(c.photo);
        return {...c,photo:url,file:normalized};
      }));
    }catch{setError("이 사진은 읽기 어려워. 다시 찍거나 다른 사진을 골라 줘.")}
    finally{e.target.value=""}
  }

  function updateChar(index:number,patch:Partial<CharDraft>){
    setChars(v=>v.map((c,i)=>i===index?{...c,...patch}:c));
  }

  function charReady(c:CharDraft){
    const base = !!(c.name.trim() && c.photo && c.kind);
    if (!base) return false;
    if (c.kind === "기타") return !!(c.otherRole && c.otherRole.trim());
    return true;
  }

  function go(n:number){setView("make");setStep(n);window.scrollTo({top:0,behavior:"smooth"})}

  async function fileData(f:File){return await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(f)})}
  async function readApi(res:Response){const type=res.headers.get("content-type")||"";if(!type.includes("application/json"))throw new Error("잠시 기다려 줘.");return await res.json()}

  async function createStory(){
    if(chars.some(c=>!charReady(c))||!question||!answer.trim())return;
    setCreating(true);setError("");setProgressPercent(10);setProgress("가족 얼굴 그림을 살펴보고 있어...");
    try{
      const photos=await Promise.all(chars.map(c=>fileData(c.file!)));
      const characters=chars.map((c,i)=>({
        name:c.name.trim(),
        role:c.role,
        appearance:charAppearance(c),
        photo:photos[i],
      }));

      setProgressPercent(20);setProgress("우리 가족 동화를 쓰고 있어 ✨");
      const res=await fetch("/api/stories",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({characters,question,answer:answer.trim()}),
      });
      const data=await readApi(res);
      if(!res.ok)throw new Error(data.error||"동화를 만들지 못했어.");
      let made:Story=data.story;
      setStory(made);

      setProgressPercent(40);setProgress("표지 그림을 그리고 있어 🎨");
      // 표지(page 0)만 이미지 생성
      for(let attempt=0;attempt<60;attempt++){
        try{
          const r=await fetch("/api/stories/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:made.id,page:0})});
          const d=await readApi(r);
          if(r.status===202){setProgress("표지 그림 순서를 기다리고 있어");await new Promise(resolve=>setTimeout(resolve,5000));continue}
          if(!r.ok)throw new Error(d.error||"표지를 만들지 못했어.");
          if(d.image_url){
            made={...made,pages:made.pages.map((p,i)=>i===0?{...p,image_url:d.image_url}:p)};
            setStory(made);
          }
          break;
        }catch(e){
          if(attempt>=2)throw e;
          setProgress("표지를 정성껏 마무리하고 있어");
          await new Promise(resolve=>setTimeout(resolve,15000));
        }
      }
      // 나머지 페이지는 이미지 없이 complete 처리
      for(let i=1;i<5;i++){
        await fetch("/api/stories/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:made.id,page:i})});
      }

      setProgressPercent(100);setProgress("동화책 완성! 짜잔~ 📖");
      await new Promise(resolve=>setTimeout(resolve,600));
      made={...made,status:"complete"};setStory(made);setIsFromGallery(false);go(3);
    }catch(e){setError(e instanceof Error?e.message:"잠시 후 다시 시도해 줘.")}
    finally{setCreating(false)}
  }

  async function openGallery(){setEntered(true);setView("gallery");setLoadingGallery(true);setError("");try{const r=await fetch("/api/stories");const d=await readApi(r);if(!r.ok)throw new Error(d.error);setStories(d.stories||[])}catch(e){setError(e instanceof Error?e.message:"동화를 불러오지 못했어.")}finally{setLoadingGallery(false)}}
  async function loadAdminData(){setEntered(true);setView("admin");setLoadingGallery(true);setError("");try{const r=await fetch("/api/stories");const d=await readApi(r);if(!r.ok)throw new Error(d.error);setStories(d.stories||[])}catch(e){setError(e instanceof Error?e.message:"동화 목록을 불러오지 못했어.")}finally{setLoadingGallery(false)}}
  function openAdminModal(){setAdminPin("");setAdminPinError("");setShowAdminPinModal(true)}
  function handleAdminPinSubmit(e:React.FormEvent){e.preventDefault();if(adminPin==="2026"||adminPin==="0000"||adminPin==="admin"){setShowAdminPinModal(false);loadAdminData()}else{setAdminPinError("비밀번호가 일치하지 않습니다.")}}
  async function handleAdminDownloadPdf(s:Story){
    setPdfGeneratingId(s.id);
    try{
      await downloadStoryPdf(s as any);
    }catch(err){
      alert("PDF를 다운로드하는 중 오류가 발생했습니다.");
    }finally{
      setPdfGeneratingId(null);
    }
  }
  async function deleteStory(id:string){if(!window.confirm("이 동화를 책장에서 지울까?"))return;try{const r=await fetch(`/api/stories?id=${encodeURIComponent(id)}`,{method:"DELETE"});const d=await readApi(r);if(!r.ok)throw new Error(d.error||"동화를 지우지 못했어.");setStories(v=>v.filter(s=>s.id!==id))}catch(e){setError(e instanceof Error?e.message:"동화를 지우지 못했어.")}}
  function handleSaveStory(){alert("동화책장에 소중히 저장되었어! 📚\n언제든지 '우리 동화 책장'에서 다시 읽을 수 있어.");resetAll();}
  async function keepStory(decoration:Decoration){if(story){const res=await fetch("/api/stories",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:story.id,...decoration})});if(!res.ok){setError("꾸민 내용을 저장하지 못했어. 한 번만 다시 눌러 줘.");return}}setStory(null);await openGallery();window.scrollTo({top:0,behavior:"smooth"})}
  function openStory(s:Story){setStory(s);setIsFromGallery(true);setView("make");setStep(3)}

  if(!entered)return <main className={`entrance ${entering?"leaving":""}`}><button className="entrance-stage" onClick={enter} aria-label="우리 가족 동화 들어가기"><span className="orb"><img src="/phodong-mascot.png" alt=""/><i/><b className="sp a">✦</b><b className="sp b">✦</b></span></button><style>{css}</style></main>;

  return <main className="inside"><header><div className="header-logos"><button className="logo" onClick={resetAll} aria-label="처음으로"><img src="/phodong-logo.png" alt="포동"/></button><div className="header-divider"/><img className="library-logo" src="/library-logo.png" alt="지혜만들기 작은도서관"/></div>{view==="make"&&<div className="progress">{[0,1,2,3].map(i=><i key={i} className={i<=step?"on":""}/>)}</div>}<div className="header-right-tools"><button className="admin-secret-btn" onClick={openAdminModal} title="관리자">🔒</button></div></header>
    {view==="admin"?<AdminDashboard stories={stories} loading={loadingGallery} error={error} open={openStory} remove={deleteStory} onDownloadPdf={handleAdminDownloadPdf} pdfGeneratingId={pdfGeneratingId} onExit={resetAll}/>:view==="gallery"?<Gallery stories={stories} loading={loadingGallery} error={error} open={openStory} remove={deleteStory}/>:<>

    {/* STEP 0: 인트로 */}
    {step===0&&<section className="screen hello"><img className="phodong-enter" src="/phodong-hello.png" alt="포동이"/><div><small>안녕, 난 포동이야!</small><h1 className="sentence-reveal">나와 같이<br/>우리 가족만의<br/>동화를 만들어볼래?</h1><div className="hello-actions reveal-buttons"><button className="next" onClick={()=>go(1)}>시작하기 →</button><button onClick={openGallery}>동화 책장 보기</button></div></div></section>}

    {/* STEP 1: 가족 소개 (2장 사진 + 캐릭터 옵션) */}
    {step===1&&<section className="screen multi-step photo-step"><Title over="우리 가족을 소개해요 👨‍👩‍👧" title="얼굴 그림 사진을 올려줘!"/><div className="item-grid">{chars.map((c,i)=><article className="item-card" key={i}>
      <h3 style={{color:"var(--rose)",margin:"0 0 14px"}}>{i===0?"👧 우리 아이 카드":"👨 함께하는 가족 카드"}</h3>
      <div className={`mini-drop ${c.photo?"filled":""}`}>
        <input id={`camera-${i}`} type="file" accept="image/*" capture="environment" autoComplete="off" onChange={e=>choosePhoto(e,i)}/>
        {c.photo?(
          <>
            <img src={c.photo} alt={i===0?"우리 아이 사진":"가족 사진"}/>
            <label htmlFor={`camera-${i}`} className="camera-retake">📸 다시 찍기</label>
          </>
        ):(
          <label htmlFor={`camera-${i}`} className="camera-trigger">
            <span className="cam-icon">📸</span>
            <strong>사진 찍기</strong>
          </label>
        )}
      </div>
      <label>이름 <em>필수</em><input value={c.name} maxLength={10} autoComplete="off" spellCheck={false} onChange={e=>updateChar(i,{name:e.target.value})} placeholder={i===0?"예: 지우":"예: 엄마 또는 아빠 이름"}/></label>
      
      {/* 필수 분류 선택 */}
      <div className="option-row">
        <span>{i===0?"성별 (필수)":"함께한 사람 (필수)"}</span>
        <div>
          {(i===0?childKindOptions:guardianKindOptions).map(k=>
            <button type="button" key={k} className={c.kind===k?"picked":""} onClick={()=>updateChar(i,{kind:k,otherRole:k!=="기타"?"":c.otherRole})}>
              {k}
            </button>
          )}
        </div>
      </div>

      {/* 보호자 카드에서 '기타'를 누른 경우 세부 역할 선택 */}
      {i===1&&c.kind==="기타"&&(
        <div className="sub-role-box">
          <small className="sub-role-title">누구와 함께 동화를 만들었나요?</small>
          <div className="sub-role-buttons">
            {otherGuardianOptions.map(o=>
              <button type="button" key={o} className={c.otherRole===o?"picked":""} onClick={()=>updateChar(i,{otherRole:o})}>
                {o}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 접고 펼칠 수 있는 선택 옵션 아코디언 */}
      <div className="more-options-wrapper">
        <button type="button" className={`toggle-options-btn ${c.openOptions?"open":""}`} onClick={()=>updateChar(i,{openOptions:!c.openOptions})}>
          <span>🎨 더 자세히 꾸미기 (선택)</span>
          <span className="arrow-icon">{c.openOptions?"▲":"▼"}</span>
        </button>
        {c.openOptions&&(
          <div className="collapsible-options">
            <div className="option-row">
              <span>머리 모양</span>
              <div>
                {hairStyleOptions.map(s=>
                  <button type="button" key={s} className={c.hairStyle===s?"picked":""} onClick={()=>updateChar(i,{hairStyle:c.hairStyle===s?"":s})}>{s}</button>
                )}
              </div>
            </div>
            <div className="option-row">
              <span>머리 길이</span>
              <div>
                {hairOptions.map(h=>
                  <button type="button" key={h} className={c.hair===h?"picked":""} onClick={()=>updateChar(i,{hair:c.hair===h?"":h})}>{h}</button>
                )}
              </div>
            </div>
            <div className="option-row">
              <span>머리 색</span>
              <div>
                {hairColorOptions.map(h=>
                  <button type="button" key={h} className={c.hairColor===h?"picked":""} onClick={()=>updateChar(i,{hairColor:c.hairColor===h?"":h})}>{h}</button>
                )}
              </div>
            </div>
            <div className="option-row">
              <span>좋아하는 색깔</span>
              <div>
                {favoriteColorOptions.map(col=>
                  <button type="button" key={col} className={c.favoriteColor===col?"picked":""} onClick={()=>updateChar(i,{favoriteColor:c.favoriteColor===col?"":col})}>{col}</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </article>)}</div>
    {error&&<p className="error">{error}</p>}
    <Actions back={()=>go(0)} next={()=>go(2)} disabled={chars.some(c=>!charReady(c))} label="우리 이야기 고르기 →"/></section>}

    {/* STEP 2: 질문 선택 & 답변 */}
    {step===2&&<section className="screen multi-step"><Title over="우리 가족 이야기 💬" title="질문을 하나 골라 대답해 줘!" sub="보호자와 아이가 함께 골라 보세요"/><div style={{maxWidth:760,margin:"0 auto 32px",display:"grid",gap:14}}>{QUESTIONS.map(q=><button key={q} className={`question-btn ${question===q?"picked":""}`} onClick={()=>{setQuestion(q);setAnswer("")}}><span className="q-check">✓</span><span>{q}</span></button>)}</div>{question&&<div style={{maxWidth:760,margin:"0 auto"}}><label style={{display:"grid",gap:10,fontWeight:700}}><span>우리 가족의 대답</span><textarea key={question} className="answer-box" value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={300} rows={4} placeholder={QUESTION_PLACEHOLDERS[question] || "우리 가족만의 특별한 대답을 적어 주세요!"} spellCheck={false}/></label></div>}
    {error&&<p className="error">{error}</p>}
    <Actions back={()=>go(1)} next={createStory} disabled={!question||!answer.trim()||creating} label={creating?"만드는 중...":"동화 만들어 줘! ✨"}/></section>}

    {/* STEP 3: 동화 생성 완료 → 결과 보기 */}
    {step===3&&story&&<ReaderBook story={story} isFromGallery={isFromGallery} onSave={handleSaveStory} onDecorate={()=>go(4)}/>}
    {step===4&&story&&<TouchDecorateBook story={story} finish={keepStory}/>}
    </>}
    {creating&&<div className="loading"><div><img src="/phodong-sleepy.png" alt="동화를 상상하는 포동"/><i/><h2>{progress}</h2><p style={{fontSize:16,color:"#a27b88",margin:"4px 0 0"}}>{progressPercent}% 완성 중이에요</p><div className="loadbar"><span style={{width:`${progressPercent}%`}}/></div></div></div>}
    
    {/* 비밀 관리자 PIN 모달 */}
    {showAdminPinModal&&(
      <div className="contact-modal-overlay">
        <div className="contact-modal-card admin-pin-card">
          <button type="button" className="modal-close-btn" onClick={()=>setShowAdminPinModal(false)}>✕</button>
          <span className="modal-badge">Booth Staff Only</span>
          <h3>관리자 모드 접속</h3>
          <p className="modal-sub">부스 운영 담당자 전용 공간입니다. 비밀번호를 입력해주세요.</p>
          <form onSubmit={handleAdminPinSubmit}>
            <label className="admin-pin-label">
              <span>비밀번호 (PIN)</span>
              <input 
                type="password" 
                value={adminPin} 
                onChange={e=>setAdminPin(e.target.value)} 
                placeholder="비밀번호를 입력하세요" 
                autoFocus 
              />
            </label>
            {adminPinError&&<p className="contact-error">{adminPinError}</p>}
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={()=>setShowAdminPinModal(false)}>취소</button>
              <button type="submit" className="submit-btn next">접속하기</button>
            </div>
          </form>
        </div>
      </div>
    )}
    <style>{css}</style></main>
}

function Title({over,title,sub}:{over:string,title:string,sub?:string}){return <div className="heading"><small>{over}</small><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>}
function Actions({back,next,disabled,label}:{back:()=>void,next:()=>void,disabled:boolean,label:string}){return <div className="actions"><button onClick={back}>뒤로</button><button className="next" disabled={disabled} onClick={next}>{label}</button></div>}
function Gallery({stories,loading,error,open,remove}:{stories:Story[],loading:boolean,error:string,open:(s:Story)=>void,remove:(id:string)=>void}){return <section className="screen gallery"><Title over="📚 동화 책장" title="우리의 특별한 이야기"/>{loading?<p className="gallery-state">책장을 열고 있어…</p>:error?<p className="error">{error}</p>:stories.length===0?<p className="gallery-state">아직 첫 번째 동화를 기다리고 있어!</p>:<div className="shelf">{stories.map(s=><article key={s.id}><button className="story-card" onClick={()=>open(s)}>{s.pages[0]?.image_url&&<img src={s.pages[0].image_url} alt=""/>}<div><small>{s.child_name}</small><h3>{s.title}</h3><p>{s.question?.slice(0,28)}…</p></div></button><button className="delete-story" onClick={()=>remove(s.id)} aria-label={`${s.title} 삭제`}>삭제</button></article>)}</div>}</section>}

function AdminDashboard({
  stories,
  loading,
  error,
  open,
  remove,
  onDownloadPdf,
  pdfGeneratingId,
  onExit
}:{
  stories:Story[];
  loading:boolean;
  error:string;
  open:(s:Story)=>void;
  remove:(id:string)=>void;
  onDownloadPdf:(s:Story)=>void;
  pdfGeneratingId:string|null;
  onExit:()=>void;
}){
  const [filterText,setFilterText]=useState("");

  const filtered = stories.filter(s=>{
    if(!filterText.trim())return true;
    const t = filterText.toLowerCase();
    return (
      (s.title||"").toLowerCase().includes(t) ||
      (s.child_name||"").toLowerCase().includes(t) ||
      (s.guardian_contact_name||"").toLowerCase().includes(t) ||
      (s.guardian_phone||"").toLowerCase().includes(t) ||
      (s.guardian_email||"").toLowerCase().includes(t)
    );
  });

  return (
    <section className="screen admin-screen">
      <div className="admin-header-bar">
        <div>
          <span className="admin-tag">Staff Dashboard</span>
          <h2>비밀 관리자 대시보드 🔐</h2>
          <p>등록된 전체 가족 동화 목록과 보호자 연락처(이름, 휴대폰, 이메일) 및 PDF 다운로드를 관리합니다.</p>
        </div>
        <button className="admin-exit-btn" onClick={onExit}>대시보드 나가기 ✕</button>
      </div>

      <div className="admin-stats-row">
        <div className="admin-stat-card">
          <small>총 생성 동화</small>
          <strong>{stories.length}편</strong>
        </div>
        <div className="admin-stat-card">
          <small>연락처 수집 완료</small>
          <strong>{stories.filter(s=>s.guardian_phone || s.guardian_email).length}건</strong>
        </div>
        <div className="admin-stat-search">
          <input 
            type="text" 
            placeholder="🔍 아이 이름, 보호자 성함, 전화번호, 이메일 검색..." 
            value={filterText}
            onChange={e=>setFilterText(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="admin-empty-state">동화 데이터를 불러오는 중입니다...</div>
      ) : error ? (
        <div className="admin-empty-state error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty-state">
          {filterText ? "검색 결과가 없습니다." : "아직 생성된 동화가 없습니다."}
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>No</th>
                <th>생성 일시</th>
                <th>아이 이름</th>
                <th>동화 제목</th>
                <th>보호자 성함</th>
                <th>연락처</th>
                <th>이메일 주소</th>
                <th>동화 관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => {
                const dateStr = s.created_at ? new Date(s.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
                const isDownloading = pdfGeneratingId === s.id;
                return (
                  <tr key={s.id}>
                    <td className="center-cell">{filtered.length - idx}</td>
                    <td className="date-cell">{dateStr}</td>
                    <td className="child-cell"><strong>👧 {s.child_name}</strong></td>
                    <td className="title-cell">
                      <button className="text-link-btn" onClick={()=>open(s)} title="동화 열기">
                        {s.title}
                      </button>
                    </td>
                    <td>{s.guardian_contact_name ? `👨‍👩‍👦 ${s.guardian_contact_name}` : <span className="dash-text">-</span>}</td>
                    <td>{s.guardian_phone || <span className="dash-text">-</span>}</td>
                    <td className="email-cell">{s.guardian_email || <span className="dash-text">미등록</span>}</td>
                    <td className="action-cell">
                      <button 
                        className="admin-pdf-btn" 
                        disabled={isDownloading} 
                        onClick={()=>onDownloadPdf(s)}
                      >
                        {isDownloading ? "⏳ 생성중" : "📄 PDF"}
                      </button>
                      <button 
                        className="admin-view-btn" 
                        onClick={()=>open(s)}
                      >
                        📖 보기
                      </button>
                      <button 
                        className="admin-delete-btn" 
                        onClick={()=>remove(s.id)}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
const css=`
:root{--rose:#f55f91;--deep:#3d2940;--paper:#fffaf8}*{box-sizing:border-box}html,body{margin:0;background:var(--paper)}body,button,input,textarea{font-family:"Noto Sans KR",sans-serif!important;color:var(--deep)}button{cursor:pointer}.entrance{height:100svh;overflow:hidden;background:radial-gradient(circle at 50% 42%,#eeeeec 0,#d7d7d4 58%,#c4c4c1 100%)}.entrance-stage{width:100%;height:100%;border:0;background:none;display:grid;place-items:center;padding:clamp(18px,4vw,48px)}.orb{display:block;position:relative;width:min(76vw,76svh,720px);aspect-ratio:1;border-radius:50%;overflow:hidden;background:#f7c8d5;opacity:0;transform:scale(.08) translateY(40px) rotate(-18deg);box-shadow:inset -42px -48px 70px #8e526144,inset 28px 25px 42px #ffffffa8,0 42px 75px #4a3a3a4d,0 8px 18px #ffffff8c}.revealed .orb{animation:orb-arrive 1.05s cubic-bezier(.16,1.28,.3,1) forwards,orb-float 3.4s 1.1s ease-in-out infinite}.orb:before{content:"";position:absolute;inset:1.2%;z-index:4;border-radius:50%;border:2px solid #ffffffa3;box-shadow:inset -14px -16px 25px #632d453d;pointer-events:none}.orb:after{content:"";position:absolute;z-index:4;left:18%;top:9%;width:34%;height:16%;border-radius:50%;background:radial-gradient(ellipse,#fff9 0,#fff0 72%);transform:rotate(-18deg);filter:blur(2px);pointer-events:none}.orb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;transform:scale(1.005)}.orb i{position:absolute;inset:6%;z-index:5;border:2px solid #fff8;border-radius:50%;animation:pulse 2.4s 1.1s infinite}.sp{position:absolute;z-index:6;color:#fff;font-size:clamp(24px,4vw,46px);text-shadow:0 3px 18px #ff78a8}.sp.a{top:19%;left:7%}.sp.b{right:8%;top:29%}@keyframes orb-arrive{0%{opacity:0;transform:scale(.08) translateY(40px) rotate(-18deg)}65%{opacity:1;transform:scale(1.08) translateY(-6px) rotate(3deg)}100%{opacity:1;transform:scale(1) translateY(0) rotate(0)}}@keyframes orb-float{50%{transform:translateY(-12px) scale(1.012)}}@keyframes pulse{70%{transform:scale(1.08);opacity:0}100%{opacity:0}}
.inside{min-height:100svh}header{height:76px;padding:0 clamp(16px,4vw,60px);display:grid;grid-template-columns:auto 1fr auto;align-items:center;background:#fffaf8ed;border-bottom:1px solid #f4e1e7;position:relative;z-index:20}.header-logos{display:flex;align-items:center;gap:14px}.logo{border:0;background:none;padding:0;display:flex;align-items:center;cursor:pointer}.logo img{width:86px;height:46px;object-fit:contain}.header-divider{width:1px;height:24px;background:#e8d1d8}.library-logo{height:42px;width:auto;max-width:200px;object-fit:contain}.progress{justify-self:center;display:flex;gap:9px}.progress i{width:9px;height:9px;border-radius:50%;background:#ead8dd}.progress i.on{background:var(--rose)}.header-right-space{width:86px}@media(max-width:650px){header{height:68px;padding:0 14px}.logo img{width:68px;height:38px}.library-logo{height:32px;max-width:140px}.header-divider{height:18px}.header-right-space{display:none}}.screen{min-height:calc(100svh - 76px);padding:clamp(40px,6vw,80px) clamp(20px,6vw,90px);position:relative;overflow:hidden;animation:in .4s ease}.heading{text-align:center;margin-bottom:40px;position:relative;z-index:2}.heading small,.hello small,.heading p,.book article p{font-family:"Gowun Dodum",sans-serif}.heading small,.hello small{font-size:22px;color:var(--rose)}.heading h2{font-size:clamp(38px,5vw,62px);margin:8px 0;font-weight:600;letter-spacing:-.045em}.heading p{font-size:20px;color:#8d6874;margin:0}.hello{display:grid;grid-template-columns:.85fr 1.15fr;align-items:center;gap:5vw;background:linear-gradient(145deg,#fffaf8,#fff0f5)}.hello>img{width:100%;max-height:72svh;object-fit:contain;filter:drop-shadow(0 24px 34px #ab45692b)}.hello h1{font-size:clamp(38px,5vw,66px);line-height:1.3;letter-spacing:-.045em;margin:14px 0 34px}.hello em{font-style:normal;color:var(--rose)}.hello-actions{display:flex;gap:12px;flex-wrap:wrap}.hello-actions>button:last-child{border:1px solid #e6bdca;background:#fff;padding:15px 22px;border-radius:16px}.next{border:0;background:var(--rose);color:#fff;padding:16px 24px;border-radius:16px;font-size:18px;box-shadow:0 14px 34px #da568338}.next:disabled{background:#d8c7cc;box-shadow:none}.corner{position:absolute;width:clamp(240px,22vw,330px);z-index:0;filter:drop-shadow(0 18px 24px #ad60702b)}.corner.right{right:18px;top:135px}.corner.left{left:18px;top:135px}.choices{max-width:820px;margin:0 auto 50px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;position:relative;z-index:2}.choices button{aspect-ratio:1;border:2px solid transparent;border-radius:28px;background:#fff0f4;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}.choices button:nth-child(even){background:#fff3df}.choices button.picked{border-color:var(--rose)}.choices b{font-size:48px}.choices span{margin-top:9px}.choices i{display:none;position:absolute;right:12px;top:12px;width:24px;height:24px;border-radius:50%;background:var(--rose);color:#fff;font-style:normal}.choices .picked i{display:grid;place-items:center}.actions{max-width:760px;margin:28px auto 0;display:flex;justify-content:space-between;position:relative;z-index:3}.actions>button:first-child{border:0;background:none;color:#947984}.photo-step,.details{background:linear-gradient(145deg,#fffafb,#fff0f4)}.drop{width:min(620px,100%);height:min(55svh,550px);min-height:350px;margin:auto;border:2px dashed #e5aabe;border-radius:30px;background:#ffffffad;overflow:hidden;position:relative;z-index:2}.drop input{position:absolute;opacity:0}.drop label{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}.drop label>span{font-size:64px}.drop label strong{font-size:25px;margin-top:12px}.drop label small{color:#9b7f88;margin-top:7px}.drop img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.drop b{position:absolute;bottom:20px;background:#3d2940db;color:#fff;padding:11px 18px;border-radius:99px}.form{width:min(760px,100%);margin:auto;background:#fff;padding:34px 42px;border-radius:30px;box-shadow:0 24px 65px #8f49601a;display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;position:relative;z-index:2}.form label{font-weight:600}.form .wide,.form fieldset{grid-column:1/-1}.form input,.form textarea{display:block;width:100%;margin-top:7px;border:0;border-bottom:2px solid #f1dce3;background:#fffafb;padding:13px 11px;outline:none}.form textarea{min-height:88px;resize:vertical}.form fieldset{border:0;padding:0;margin:0}.form legend{font-weight:600;margin-bottom:10px}.genres{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.genres button{border:1px solid #edd5dd;background:#fff7f9;border-radius:14px;padding:11px 5px}.genres button b{display:block;font-size:25px;margin-bottom:4px}.genres button.picked{border-color:var(--rose);background:#ffe6ee;color:#c83f70}.form>small{text-align:center;color:#a38891}.error{text-align:center;color:#b52658}.loading{position:fixed;inset:0;z-index:50;background:#fff7f9f2;backdrop-filter:blur(12px);display:grid;place-items:center;text-align:center;padding:24px}.loading img{width:min(330px,70vw);animation:dream 2s infinite}.loading h2{font-size:clamp(24px,4vw,38px);margin:4px 0 10px}.loading p{font-family:"Gowun Dodum",sans-serif;color:#8c6874}.loadbar{width:min(440px,76vw);height:9px;background:#f0dce3;border-radius:9px;overflow:hidden;margin:20px auto}.loadbar span{display:block;height:100%;background:var(--rose);transition:.5s}.story{background:#f8dbe4}.book{max-width:1180px;margin:auto;display:grid;grid-template-columns:.9fr 1.1fr;min-height:min(670px,72svh);background:#fff;box-shadow:0 30px 90px #6834462e;border-radius:28px;overflow:hidden}.visual{position:relative;background:#f1c9d6}.visual img{width:100%;height:100%;object-fit:cover}.visual span{position:absolute;left:20px;top:20px;background:#fff;padding:8px 12px;border-radius:99px;color:var(--rose)}.image-wait{height:100%;display:grid;place-items:center}.book article{padding:clamp(36px,6vw,72px);display:flex;flex-direction:column;justify-content:center}.book article>small{color:var(--rose)}.book article h2{font-size:clamp(34px,4vw,54px);margin:14px 0 24px}.book article p{font-size:22px;line-height:1.85;color:#5f495f}.restart{display:block;margin:24px auto;border:0;background:none;border-bottom:1px solid #6e4f59}.gallery{background:linear-gradient(#fffaf8,#ffedf3)}.shelf{max-width:1180px;margin:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.shelf>button{padding:0;text-align:left;border:0;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px #8f49601a;transition:.25s}.shelf>button:hover{transform:translateY(-5px)}.shelf img{width:100%;aspect-ratio:1.25;object-fit:cover}.shelf div{padding:18px 20px 22px}.shelf small{color:var(--rose)}.shelf h3{font-size:23px;margin:7px 0}.shelf p,.gallery-state{text-align:center;color:#8b7380}.shelf p{text-align:left;margin:0}@keyframes in{from{opacity:0;transform:translateY(10px)}}@keyframes dream{50%{transform:translateY(-10px) rotate(2deg)}}
@media(min-width:1100px){.prepare,.photo-step,.details{padding-left:clamp(250px,22vw,340px);padding-right:clamp(250px,22vw,340px)}}@media(max-width:850px){.hello{grid-template-columns:1fr;text-align:center;padding-top:25px}.hello>img{max-height:36svh}.hello-actions{justify-content:center}.corner{position:relative;display:block;width:220px;margin:-20px auto -35px;top:auto!important;right:auto!important;left:auto!important}.choices{grid-template-columns:repeat(3,1fr)}.form{grid-template-columns:1fr}.form .wide,.form fieldset{grid-column:auto}.genres{grid-template-columns:repeat(3,1fr)}.book{grid-template-columns:1fr}.visual{min-height:420px}.shelf{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){header{height:66px;padding:0 15px}.logo img{width:80px}.home{font-size:12px}.screen{min-height:calc(100svh - 66px);padding:34px 14px}.hello h1{font-size:30px}.choices{grid-template-columns:repeat(2,1fr);gap:11px}.choices b{font-size:40px}.heading h2{font-size:33px}.corner{width:180px}.form{padding:24px 18px}.genres{grid-template-columns:repeat(2,1fr)}.book{border-radius:18px}.visual{min-height:320px}.book article{padding:30px 20px}.book article p{font-size:19px}.book nav>button{font-size:11px;padding:9px}.shelf{grid-template-columns:1fr}}@media print{header,.restart{display:none!important}.story{padding:0}.book{box-shadow:none}}
.guided{display:grid;grid-template-columns:minmax(250px,32%) minmax(0,1fr);gap:clamp(32px,5vw,82px);align-items:center;padding-left:clamp(28px,5vw,72px)!important;padding-right:clamp(28px,5vw,72px)!important}.guide-right{grid-template-columns:minmax(0,1fr) minmax(250px,32%)}.guide{display:grid;place-items:center;align-self:center}.guide img{display:block;width:min(100%,390px);max-height:68svh;object-fit:contain;filter:drop-shadow(0 24px 34px #ad607035)}.stage-content{min-width:0;width:100%}.drop input{position:absolute;width:1px;height:1px;opacity:0}.drop>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.photo-placeholder{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:74px}.photo-placeholder span{font-size:64px}.photo-placeholder strong{font-size:25px;margin-top:12px}.photo-actions{position:absolute;z-index:3;left:18px;right:18px;bottom:18px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.photo-actions label{display:flex;align-items:center;justify-content:center;min-height:52px;padding:12px;border-radius:16px;background:#fff;color:#583b46;font-weight:700;box-shadow:0 8px 24px #5c304333}.photo-actions label:first-child{background:var(--rose);color:#fff}@media(max-width:850px){.guided{grid-template-columns:minmax(190px,30%) minmax(0,1fr);gap:24px}.guide img{width:min(100%,270px)}.guided .heading{margin-bottom:26px}.guided .heading h2{font-size:clamp(30px,4.6vw,44px)}.guided .choices{grid-template-columns:repeat(2,1fr);gap:10px}.guided .choices button{aspect-ratio:auto;min-height:130px}.guided .form{padding:25px 24px}.guide-right{grid-template-columns:minmax(0,1fr) minmax(190px,30%)}}@media(max-width:650px){.guided,.guide-right{grid-template-columns:1fr;padding:24px 16px 36px!important;gap:8px}.guide-right .guide{order:-1}.guide img{width:min(210px,52vw);max-height:25svh}.guided .heading{margin-bottom:22px}.guided .choices{margin-bottom:26px}.drop{min-height:330px;height:48svh}.photo-actions{left:10px;right:10px;bottom:10px}.photo-actions label{font-size:14px;padding:10px 6px}.guided .actions{margin-top:18px}}
.entrance{background:radial-gradient(circle at 50% 42%,#fff8fa 0,#ffe9f1 48%,#ffcddd 100%)}.entrance .orb{opacity:1;transform:none;animation:none}.entrance .orb i{animation:none}.hello h1{max-width:18ch;text-wrap:balance;overflow-wrap:normal;word-break:keep-all}.guided,.guide-right{grid-template-columns:minmax(360px,.85fr) minmax(0,1.15fr)}.guide img{width:100%;max-width:560px;max-height:72svh;transform:none}.story{padding:clamp(10px,1.6vw,20px) clamp(10px,2vw,24px)!important}.book{height:clamp(580px,calc(100svh - 110px),820px);width:min(1420px,97vw);max-width:97vw;min-height:0;perspective:1800px;touch-action:pan-y;border-radius:28px}.visual,.book article{min-height:0}.book article{overflow:visible}.book article h2{font-size:clamp(20px,2.4vw,30px);margin:6px 0 16px}.book article p{max-height:none!important;overflow:visible!important;font-size:clamp(18px,1.8vw,22px);line-height:1.85}.turn-next article{animation:page-next .46s cubic-bezier(.22,.7,.22,1);transform-origin:right center}.turn-prev article{animation:page-prev .46s cubic-bezier(.22,.7,.22,1);transform-origin:left center}.turn-next .visual img,.turn-prev .visual img{animation:page-fade .46s ease}@keyframes page-next{0%{transform:rotateY(78deg);opacity:.25}100%{transform:rotateY(0);opacity:1}}@keyframes page-prev{0%{transform:rotateY(-78deg);opacity:.25}100%{transform:rotateY(0);opacity:1}}@keyframes page-fade{0%{opacity:.35;transform:scale(.985)}100%{opacity:1;transform:scale(1)}}@media(max-width:850px){.hello h1{margin-left:auto;margin-right:auto}.guided,.guide-right{grid-template-columns:1fr;text-align:center;padding-top:24px!important}.guide-right .guide{order:-1}.guide img{width:100%;max-width:none;max-height:36svh}.guided .stage-content{max-width:760px;margin:auto}.book{grid-template-columns:1fr;grid-template-rows:43% 57%;height:calc(100svh - 145px)}.visual{min-height:0}.book article{padding:clamp(22px,4vw,38px)}.book article h2{font-size:clamp(28px,5vw,42px);margin:8px 0 12px}.book article p{font-size:clamp(17px,2.6vw,21px);line-height:1.65;margin:0}}@media(max-width:560px){.guide img{max-height:31svh}.book{height:calc(100svh - 112px);grid-template-rows:38% 62%}.story{padding:12px 8px}.book article{padding:18px 14px}.book article p{font-size:16px;line-height:1.55;max-height:12.5em}.restart{margin:10px auto}}
.appearance{display:grid;gap:9px}.appearance-row{display:grid;grid-template-columns:82px 1fr;gap:10px;align-items:center}.appearance-row>span{font-size:14px;color:#8f6d78}.appearance-row>div{display:flex;gap:7px;flex-wrap:wrap}.appearance-row button{border:1px solid #ead2da;background:#fffafc;border-radius:99px;padding:8px 12px;font-size:13px}.appearance-row button.picked{border-color:var(--rose);background:#ffe4ed;color:#c73568;font-weight:700}@media(max-width:560px){.appearance-row{grid-template-columns:1fr;gap:5px}.appearance-row button{padding:7px 10px}}
.details-guide{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}.details-guide>img{max-height:39svh}.memory-photo{width:min(330px,92%);margin:0;background:#fff;padding:10px 10px 12px;border-radius:24px;box-shadow:0 18px 46px #7e3e551f;transform:rotate(-1.5deg)}.memory-photo img{display:block;width:100%;height:clamp(150px,22svh,230px);object-fit:cover;border-radius:17px;transform:none;filter:none}.memory-photo figcaption{text-align:center;margin-top:9px;color:#8d6874;font-family:"Gowun Dodum",sans-serif;font-size:15px}.loading>div{width:min(620px,100%);display:flex;flex-direction:column;align-items:center;justify-content:center}.loading img{display:block;margin:0 auto;object-position:center}.loading h2{width:100%;text-align:center;word-break:keep-all;overflow-wrap:break-word;text-wrap:balance;white-space:pre-line;line-height:1.45}.loading p{width:100%;text-align:center}.loading .loadbar{flex:none}@media(max-width:850px){.details-guide{display:grid;grid-template-columns:minmax(180px,1fr) minmax(230px,1.15fr);width:min(680px,100%);margin:auto;gap:18px}.details-guide>img{max-height:30svh}.memory-photo{width:100%}.memory-photo img{height:clamp(140px,20svh,210px)}}@media(max-width:560px){.details-guide{grid-template-columns:120px 1fr;gap:10px}.details-guide>img{max-height:22svh}.memory-photo{padding:7px;border-radius:18px}.memory-photo img{height:120px;border-radius:13px}.memory-photo figcaption{font-size:12px;margin-top:5px}}
.entrance.leaving{animation:portal-bg .85s ease-in forwards}.entrance.leaving .orb{animation:portal-in .85s cubic-bezier(.55,.02,.9,.45) forwards}.entrance.leaving .sp{animation:spark-out .55s ease-out forwards}@keyframes portal-in{0%{transform:scale(1) rotate(0);filter:blur(0)}55%{transform:scale(1.25) rotate(140deg);filter:blur(0)}100%{transform:scale(4.8) rotate(420deg);filter:blur(5px);opacity:0}}@keyframes portal-bg{70%{background:#ffd6e4}100%{background:#fffaf8}}@keyframes spark-out{to{transform:scale(3);opacity:0}}.sentence-reveal{opacity:0;transform:translateY(18px) scale(.985);filter:blur(5px);animation:sentence-in .8s .18s cubic-bezier(.2,.75,.25,1) forwards}.hello-actions.reveal-buttons{opacity:0;transform:translateY(12px);pointer-events:auto;animation:actions-in .5s .9s ease forwards}@keyframes sentence-in{to{opacity:1;transform:none;filter:blur(0)}}@keyframes actions-in{to{opacity:1;transform:none}}.shelf>article{position:relative;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px #8f49601a;transition:.25s}.shelf>article:hover{transform:translateY(-5px)}.story-card{display:block;width:100%;padding:0;text-align:left;border:0;background:#fff}.delete-story{position:absolute;right:12px;top:12px;border:0;border-radius:99px;background:#fff;color:#b74267;padding:8px 12px;box-shadow:0 5px 18px #71374b30;font-weight:700}
.multi-step{overflow:visible;min-height:calc(100svh - 76px)}.item-grid,.hero-grid{width:min(1180px,100%);margin:0 auto;display:flex;flex-wrap:wrap;gap:20px;justify-content:center;align-items:start}.item-card,.hero-card{background:#fff;border:1px solid #f2dce4;border-radius:28px;padding:20px;box-shadow:0 18px 50px #8f496014;position:relative;flex:1 1 min(300px,100%);max-width:380px}.mini-drop{height:250px;border-radius:20px;background:#fff1f5;overflow:hidden;position:relative;display:grid;place-items:center;margin-bottom:18px}.mini-drop>img{width:100%;height:100%;object-fit:cover}.mini-drop>div:first-child{text-align:center;display:grid;gap:8px}.mini-drop>div:first-child span{font-size:44px}.mini-drop input{display:none}.mini-drop>div:last-child{position:absolute;left:10px;right:10px;bottom:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.mini-drop label{border:0;background:rgba(255,255,255,.92);border-radius:12px;padding:10px 7px;text-align:center;font-size:14px;font-weight:700;box-shadow:0 5px 18px #71374b1f}.item-card>label,.hero-card>label{display:grid;gap:7px;margin-top:12px;font-weight:700}.item-card em,.hero-card em{font-style:normal;color:var(--rose);font-size:12px}.item-card label>span{color:#a68b94;font-size:12px}.item-card input,.item-card textarea,.hero-card input{width:100%;border:1px solid #ead2da;background:#fffafc;border-radius:14px;padding:13px;font-size:15px}.item-card textarea{min-height:80px;resize:vertical}.add-card{display:block;margin:22px auto 0;border:1.5px dashed #e68bab;background:transparent;color:#c44070;border-radius:99px;padding:11px 22px;font-weight:700;font-size:15px;transition:background .2s}.add-card:hover{background:#fff0f6}.remove-card{border:0;background:none;color:#c4858e;margin-top:12px;padding:4px 2px;font-size:13px;opacity:.75}.hero-card h3{margin:0 0 14px;color:#c44070;font-size:18px;letter-spacing:-.02em}.option-row{margin-top:14px}.option-row>span{display:block;font-size:12px;color:#8f6d78;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:7px}.option-row>div{display:flex;flex-wrap:wrap;gap:6px}.option-row button{border:1.5px solid #ead2da;background:#fffafc;border-radius:99px;padding:7px 11px;font-size:13px;transition:all .15s}.option-row button.picked{border-color:var(--rose);background:#ffe4ed;color:#c73568;font-weight:700}.genre-choices{grid-template-columns:repeat(3,1fr)}
/* step-specific backgrounds */
.photo-step{background:radial-gradient(circle at 10% 15%,#fff0f7 0,transparent 32%),radial-gradient(circle at 88% 20%,#ffe8f5 0,transparent 30%),radial-gradient(circle at 60% 85%,#fff4d6 0,transparent 30%),linear-gradient(160deg,#fffbfc,#ffeef7)!important}
.hero-step{background:radial-gradient(circle at 90% 12%,#edefff 0,transparent 30%),radial-gradient(circle at 10% 18%,#f3e8ff 0,transparent 30%),radial-gradient(circle at 55% 88%,#dff0ff 0,transparent 28%),linear-gradient(160deg,#fafbff,#f0e8ff)!important}
.prepare{background:radial-gradient(circle at 15% 20%,#e8fff5 0,transparent 30%),radial-gradient(circle at 82% 10%,#fff0e0 0,transparent 30%),radial-gradient(circle at 70% 82%,#ffe8de 0,transparent 28%),linear-gradient(160deg,#fafffc,#fff3e0)!important}
@media(max-width:700px){.multi-step{padding-top:30px}.item-grid,.hero-grid{flex-direction:column;align-items:center}.item-card,.hero-card{max-width:100%;width:100%}.mini-drop{height:220px}.genre-choices{grid-template-columns:repeat(2,1fr)}}
.phodong-choice{width:min(620px,100%);margin:24px auto 0;padding:16px 20px;border:1px solid #efcbd7;border-radius:20px;background:#fff;display:flex;align-items:center;justify-content:center;gap:13px;box-shadow:0 12px 34px #8f496012}.phodong-choice input{width:22px;height:22px;accent-color:var(--rose);flex-shrink:0}.phodong-choice span{display:grid;gap:3px}.phodong-choice b{font-size:16px}.phodong-choice small{color:#8f6d78;font-size:13px}.style-choice{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.style-choice button{border:1.5px solid #e4ccd5;background:#fffafc;border-radius:14px;padding:11px 10px;font-weight:700;font-size:14px;color:#7a5564;transition:all .18s}.style-choice button.picked{border-color:var(--rose);background:linear-gradient(145deg,#fff0f5,#ffdce8);color:#c73568;box-shadow:0 6px 18px #f55f9122}.loadbar{width:min(440px,76vw);height:10px;background:#fce6ed;border-radius:99px;overflow:hidden;box-shadow:inset 0 2px 5px #a6506d20;margin:20px auto;position:relative}.loadbar span{display:block;height:100%;background:linear-gradient(90deg,#ff80a6,#f55f91,#ff3d79);border-radius:inherit;transition:width .45s cubic-bezier(.22,.7,.22,1);box-shadow:0 2px 10px #f55f9166}
/* phodong character entrance animation */
.phodong-enter{animation:phodong-pop .7s .08s cubic-bezier(.26,1.38,.52,1) both}@keyframes phodong-pop{0%{opacity:0;transform:scale(.72) translateY(28px) rotate(-4deg)}70%{transform:scale(1.06) translateY(-6px) rotate(1.5deg)}100%{opacity:1;transform:scale(1) translateY(0) rotate(0)}}
/* heading sub size tweak */
.heading p{font-size:17px!important}
.heading small{font-size:14px!important;letter-spacing:.06em;text-transform:uppercase;font-weight:800!important}
.hello small{font-size:18px!important;letter-spacing:.04em;text-transform:uppercase;font-weight:800!important}
/* gallery screen bg */
.gallery{background:radial-gradient(circle at 18% 12%,#fff0f7 0,transparent 28%),radial-gradient(circle at 80% 8%,#e8eeff 0,transparent 25%),radial-gradient(circle at 62% 86%,#fff4d6 0,transparent 25%),linear-gradient(155deg,#fffbfc,#f4f0ff)!important}
.inside{background:linear-gradient(145deg,#fffdfb 0%,#fff4f7 48%,#ffeef4 100%);position:relative}.inside:before{content:"";position:fixed;inset:76px 0 0;pointer-events:none;background:radial-gradient(circle at 12% 18%,#ffd5e48c 0,transparent 28%),radial-gradient(circle at 88% 16%,#fff0c985 0,transparent 24%),radial-gradient(circle at 78% 82%,#e8dcff78 0,transparent 28%),radial-gradient(circle at 18% 84%,#dff5f087 0,transparent 25%);filter:saturate(.92)}header{background:linear-gradient(180deg,#fffefcf7,#fff8faf0);box-shadow:0 8px 28px #9b526314,inset 0 -1px #eecfd8;backdrop-filter:blur(14px)}.screen,.photo-step,.details,.multi-step,.gallery,.story{background:radial-gradient(circle at 14% 12%,#ffffffc9 0,transparent 30%),radial-gradient(circle at 88% 18%,#ffe2ecbd 0,transparent 33%),radial-gradient(circle at 74% 90%,#fff0ce9c 0,transparent 30%),linear-gradient(145deg,#fffafbd9,#ffeef4d9)}.hello{background:radial-gradient(circle at 20% 34%,#ffffff 0,transparent 38%),radial-gradient(circle at 82% 18%,#ffd9e6 0,transparent 38%),linear-gradient(145deg,#fffdfb,#ffeef4)}.heading h2,.hello h1{text-shadow:0 2px 0 #fff,0 12px 30px #c16d8720}.item-card,.hero-card,.form,.phodong-choice{background:linear-gradient(145deg,#ffffff,#fff8fa);border-color:#ffffff;box-shadow:inset 0 1px 0 #fff,0 24px 60px #9d536d1d,0 6px 16px #9d536d16}.item-card:before,.hero-card:before{content:"";position:absolute;inset:1px;border-radius:27px;pointer-events:none;box-shadow:inset 0 0 0 1px #f3dce4,inset 12px 14px 28px #ffffff}.mini-drop,.choices button{background:linear-gradient(145deg,#fff8fa,#ffe6ee);box-shadow:inset 5px 6px 12px #ffffff,inset -7px -8px 14px #eab8c54f,0 10px 24px #9c526917}.choices button:nth-child(even){background:linear-gradient(145deg,#fffaf1,#ffe9c9)}.choices button{transition:transform .22s ease,box-shadow .22s ease}.choices button:hover,.choices button.picked{transform:translateY(-4px);box-shadow:inset 5px 6px 12px #fff,inset -7px -8px 14px #eab8c54f,0 18px 34px #a6506d24}.next,.add-card{background:linear-gradient(145deg,#ff769f,#e8487d);box-shadow:inset 0 2px 1px #ffffff70,inset 0 -4px 8px #b9295a38,0 14px 30px #d9588644}.next:active,.add-card:active{transform:translateY(2px);box-shadow:inset 0 3px 8px #a72b5538,0 5px 14px #d9588633}.option-row button,.genres button{background:linear-gradient(145deg,#fff,#fff4f8);box-shadow:inset 0 1px #fff,0 4px 10px #9a4d6610}.option-row button.picked,.genres button.picked{background:linear-gradient(145deg,#ffedf3,#ffdce8);box-shadow:inset 0 1px #fff,0 7px 16px #d7578326}.book{border:1px solid #ffffff;box-shadow:0 38px 90px #72364a33,0 10px 24px #72364a24,inset 0 1px #fff;position:relative}.book:after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 0 0 1px #eed5dd,inset 18px 16px 35px #ffffff38}.visual{background:linear-gradient(145deg,#f5d6df,#eebaca)}.loading{background:radial-gradient(circle at 50% 38%,#ffffff 0,#fff4f8e8 45%,#f9dce7ed 100%)}.loading>div{background:linear-gradient(145deg,#ffffffd9,#fff6f9d9);border:1px solid #fff;border-radius:38px;padding:30px;box-shadow:inset 0 1px #fff,0 35px 90px #78374d2b}.shelf>article{background:linear-gradient(145deg,#fff,#fff7fa);box-shadow:inset 0 1px #fff,0 24px 55px #8f496024,0 6px 14px #8f496014}.sticker-tray,.pen-tools{background:linear-gradient(145deg,#ffffffec,#fff4f8e8)!important;box-shadow:inset 0 1px #fff,0 16px 38px #743c511c!important}@media(prefers-reduced-motion:no-preference){.item-card,.hero-card,.phodong-choice{transition:transform .25s ease,box-shadow .25s ease}.item-card:hover,.hero-card:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 #fff,0 30px 70px #9d536d25,0 8px 18px #9d536d18}}
.decorate{padding-top:22px;overflow:visible}.sticker-help{text-align:center;margin:0 auto 12px;display:flex;justify-content:center;align-items:baseline;gap:10px;flex-wrap:wrap}.sticker-help strong{font-size:20px}.sticker-help span{color:#896d76}.sticker-tray{width:min(1060px,100%);margin:0 auto 16px;padding:10px 14px;display:flex;gap:10px;overflow-x:auto;background:#fffaf7d9;border:1px solid #eccfd8;border-radius:22px;box-shadow:0 12px 30px #71374b16;touch-action:none}.sticker-tray button{width:82px;height:82px;flex:0 0 82px;border:0;background:#fff0f4;border-radius:17px;padding:5px;touch-action:none}.sticker-tray img{width:100%;height:100%;object-fit:contain;pointer-events:none}.decorate .book{position:relative}.placed-sticker{position:absolute;z-index:12;transform:translate(-50%,-50%);padding:0;border:0;background:none;touch-action:none;filter:drop-shadow(0 5px 5px #5e354b3d)}.placed-sticker img{display:block;width:100%;height:auto;pointer-events:none}.placed-sticker.selected{outline:3px dashed #ff5f91;outline-offset:5px;border-radius:12px}.sticker-tools{position:sticky;z-index:15;bottom:14px;margin:-4px auto 0;width:max-content;display:flex;gap:6px;background:#3d2940e8;padding:7px;border-radius:99px;box-shadow:0 9px 28px #3d294055}.sticker-tools button{border:0;background:#fff;color:#563f58;border-radius:99px;padding:8px 13px;font-weight:700}.sticker-tools button:last-child{color:#c52e61}.sticker-ghost{position:fixed;z-index:100;width:120px;max-height:150px;object-fit:contain;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 10px 12px #3d294055)}.item-grid{width:min(1380px,100%);grid-template-columns:repeat(3,minmax(0,1fr))}.hero-grid{width:min(1180px,100%)}@media(max-width:850px){.decorate{padding:16px 10px}.sticker-help{font-size:14px}.sticker-help strong{font-size:18px}.sticker-tray button{width:68px;height:68px;flex-basis:68px}.decorate .book{height:calc(100svh - 275px);min-height:520px}.placed-sticker{max-width:25vw}.item-grid{grid-template-columns:repeat(3,minmax(220px,1fr));overflow-x:auto;padding-bottom:10px;scroll-snap-type:x proximity}.item-card{scroll-snap-align:center}}@media(max-width:560px){.item-grid{grid-template-columns:1fr;overflow:visible}}
/* sub role selection for 기타 */
.sub-role-box{margin-top:10px;padding:12px 14px;background:#fff5f8;border:1.5px dashed #f5bccc;border-radius:18px;text-align:left}
.sub-role-title{display:block;font-size:12px;font-weight:700;color:#b93a65;margin-bottom:8px}
.sub-role-buttons{display:flex;flex-wrap:wrap;gap:6px}
.sub-role-buttons button{border:1px solid #ecc9d4;background:#fff;border-radius:99px;padding:6px 12px;font-size:13px;font-weight:600;color:#5a3f4b;transition:all .15s}
.sub-role-buttons button.picked{border-color:var(--rose);background:var(--rose);color:#fff;font-weight:700}

/* collapsible appearance options accordion */
.more-options-wrapper{margin-top:16px;border-top:1px solid #f6e1e8;padding-top:12px}
.toggle-options-btn{width:100%;border:1px solid #edd4dd;background:#fffdfd;border-radius:14px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;color:#7e5b69;transition:all .18s;cursor:pointer}
.toggle-options-btn:hover{background:#fff3f6;border-color:#f55f91;color:#c73568}
.toggle-options-btn.open{background:#fff0f5;border-color:#f55f91;color:#c73568}
.toggle-options-btn .arrow-icon{font-size:11px;color:#ba7d91}
.collapsible-options{margin-top:10px;padding:14px;background:#fffbfd;border:1px solid #f6e6ee;border-radius:16px;display:grid;gap:12px;animation:in .2s ease}

/* question selection & answer */
.question-btn{display:flex;align-items:center;gap:14px;border:2px solid #ead2da;background:#fff8fa;border-radius:18px;padding:18px 20px;text-align:left;font-size:16px;line-height:1.5;transition:all .18s}.question-btn:hover{border-color:#f09fb8;background:#fff0f5}.question-btn.picked{border-color:var(--rose);background:linear-gradient(145deg,#fff0f5,#ffdce8);font-weight:700}.q-check{width:24px;height:24px;min-width:24px;border-radius:50%;border:2px solid #ddbfca;display:grid;place-items:center;color:transparent;font-size:14px}.question-btn.picked .q-check{background:var(--rose);border-color:var(--rose);color:#fff}.answer-box{display:block;width:100%;border:2px solid #ead2da;border-radius:16px;background:#fffafc;padding:16px;font-size:16px;line-height:1.65;resize:vertical;outline:none;margin-top:4px;min-height:100px;transition:border-color .2s}.answer-box:focus{border-color:var(--rose)}
/* single camera trigger */
.camera-trigger{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;background:linear-gradient(145deg,#fff5f8,#ffeef3);transition:all .2s ease}.camera-trigger:hover{background:linear-gradient(145deg,#ffeaf1,#ffe4ed);transform:scale(1.01)}.camera-trigger .cam-icon{font-size:52px;filter:drop-shadow(0 6px 14px #e5729738)}.camera-trigger strong{font-size:19px;color:#ba3e6a;font-weight:700;letter-spacing:-.01em}.camera-retake{position:absolute;bottom:14px;background:#3d2940db;backdrop-filter:blur(6px);color:#fff;padding:9px 18px;border-radius:99px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px #00000030;transition:all .15s}.camera-retake:hover{background:#3d2940f5;transform:scale(1.04)}
/* text only storybook page layout */
.reader .book.text-only-book,.book.text-only-book{grid-template-columns:1fr!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important;background:radial-gradient(circle at 50% 30%,#ffffff 0%,#fffdfb 60%,#fff7f2 100%)!important;padding:clamp(28px,4vw,56px) clamp(24px,5vw,72px) 90px!important}
.story-text-page{width:100%;max-width:820px;margin:auto;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 0}
.story-text-page .page-header{display:flex;justify-content:space-between;width:100%;align-items:center;margin-bottom:20px}
.story-text-page .page-header small{color:#f55f91;font-weight:700;font-size:16px}
.story-text-page .page-indicator{background:#ffe6ef;color:#c73568;padding:4px 14px;border-radius:99px;font-weight:800;font-size:14px}
.story-text-page h2{font-size:clamp(26px,4vw,42px);color:#3d2940;margin:0 0 14px;font-weight:800;letter-spacing:-.02em}
.story-text-page .text-divider{color:#f9a8c4;font-size:15px;letter-spacing:8px;margin-bottom:24px}
.story-text-page p{font-size:clamp(20px,2.8vw,30px);line-height:2.05;color:#493545;word-break:keep-all;text-wrap:balance;margin:0;font-weight:500;font-family:"Gowun Dodum",sans-serif}
.cover-fallback{background:linear-gradient(145deg,#ffedf3,#ffdce8)!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.cover-fallback span{font-size:72px}
.cover-fallback strong{font-size:28px;color:#c73568}
/* balanced book navigation */
.book-nav{position:absolute;left:24px;right:24px;bottom:20px;display:flex;justify-content:space-between;align-items:center;z-index:20;pointer-events:none}
.nav-side{flex:1;display:flex;align-items:center}
.nav-side.left{justify-content:flex-start}
.nav-side.right{justify-content:flex-end}
.nav-center.dots{display:flex;justify-content:center;gap:8px;flex:0 0 auto}
.nav-btn{pointer-events:auto;border:0;background:rgba(255,255,255,0.94);backdrop-filter:blur(6px);color:#563e48;padding:12px 20px;border-radius:99px;font-size:15px;font-weight:700;box-shadow:0 6px 18px rgba(90,45,60,0.14);transition:all .18s;cursor:pointer}
.nav-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(90,45,60,0.22);background:#fff}
.nav-btn:disabled{opacity:0.35;cursor:default;box-shadow:none}
.nav-btn.save-btn{background:linear-gradient(145deg,#ff628f,#eb3e74)!important;color:#fff!important;box-shadow:0 8px 24px rgba(235,62,116,0.4)!important;animation:pulse 2.2s infinite}
.nav-center.dots button{width:10px;height:10px;padding:0;border:0;border-radius:50%;background:#e5cad3;transition:all .2s;pointer-events:auto;cursor:pointer}
.nav-center.dots button.on{background:var(--rose,#f55f91);transform:scale(1.35)}
@media(max-width:650px){.book-nav{left:12px;right:12px;bottom:12px}.nav-btn{font-size:13px;padding:9px 14px}.nav-center.dots{gap:5px}}
/* contact modal */
.contact-modal-overlay{position:fixed;inset:0;z-index:100;background:rgba(45,25,38,0.62);backdrop-filter:blur(8px);display:grid;place-items:center;padding:18px;animation:fadeIn .25s ease}
.contact-modal-card{position:relative;width:min(520px,100%);background:linear-gradient(150deg,#ffffff 0%,#fffafc 100%);border-radius:28px;padding:34px 28px;box-shadow:0 30px 80px rgba(70,25,45,0.32);border:1px solid rgba(255,255,255,0.8);animation:modalUp .3s cubic-bezier(0.16,1,0.3,1)}
.modal-close-btn{position:absolute;top:18px;right:18px;border:0;background:#f3e4ea;color:#7e5264;width:34px;height:34px;border-radius:50%;font-size:16px;cursor:pointer;display:grid;place-items:center;transition:all .15s}
.modal-close-btn:hover{background:#ead0db;color:#3d2940}
.modal-badge{display:inline-block;background:#ffe6ef;color:#c73568;padding:4px 12px;border-radius:99px;font-size:13px;font-weight:800;margin-bottom:8px}
.contact-form h3{font-size:24px;color:#3d2940;margin:0 0 6px;letter-spacing:-0.02em}
.modal-sub{font-size:14px;color:#8a6c76;line-height:1.5;margin:0 0 20px}
.contact-form label{display:grid;gap:6px;margin-bottom:14px;font-weight:700;font-size:14px;color:#4a323d;text-align:left}
.contact-form label em{color:var(--rose,#f55f91);font-style:normal;font-size:12px}
.contact-form input{width:100%;border:1.5px solid #ead2da;background:#fff8fa;border-radius:14px;padding:13px 15px;font-size:15px;outline:none;transition:border-color .2s;font-family:inherit}
.contact-form input:focus{border-color:var(--rose,#f55f91);background:#fff}
.contact-error{color:#d32f5f;font-size:13px;font-weight:700;margin:0 0 12px;text-align:left}
.modal-actions{display:flex;gap:10px;margin-top:20px}
.cancel-btn{flex:1;border:1px solid #e2c5cf;background:#fff;color:#7e5d6a;border-radius:14px;padding:14px;font-weight:700;font-size:15px;cursor:pointer}
.submit-btn{flex:2;margin:0!important;padding:14px!important;font-size:15px!important}
.contact-success-box{text-align:center;padding:10px 0}
.success-icon{font-size:54px;display:block;margin-bottom:10px}
.contact-success-box h3{font-size:26px;color:#3d2940;margin:0 0 10px}
.contact-success-box p{font-size:15px;color:#7c5b68;line-height:1.6;margin:0 0 24px}
.contact-success-box p strong{color:#c73568}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes modalUp{from{opacity:0;transform:translateY(24px) scale(0.96)}to{opacity:1;transform:none}}

/* secret admin trigger & dashboard */
.header-right-tools{display:flex;align-items:center;justify-content:flex-end;width:86px}
.admin-secret-btn{background:transparent;border:0;font-size:16px;opacity:0.25;cursor:pointer;padding:8px;border-radius:50%;transition:all .2s;color:inherit}
.admin-secret-btn:hover{opacity:0.9;background:rgba(245,95,145,0.12);transform:scale(1.1)}
.admin-pin-card{max-width:420px!important;text-align:left}
.admin-pin-label{display:grid;gap:8px;font-weight:700;font-size:14px;color:#3d2940;margin-bottom:12px}
.admin-pin-label input{border:1.5px solid #e0c8d1;border-radius:14px;padding:12px 14px;font-size:16px;outline:none}
.admin-pin-label input:focus{border-color:var(--rose)}

.admin-screen{max-width:1240px;margin:0 auto;padding:40px 24px 80px!important}
.admin-header-bar{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:28px;flex-wrap:wrap}
.admin-tag{display:inline-block;background:#3d2940;color:#fff;font-size:12px;font-weight:800;padding:4px 12px;border-radius:99px;margin-bottom:8px;letter-spacing:0.04em}
.admin-header-bar h2{font-size:clamp(26px,3.5vw,36px);margin:0 0 6px;color:#3d2940}
.admin-header-bar p{margin:0;color:#7e5d6a;font-size:15px}
.admin-exit-btn{border:1px solid #d9b8c4;background:#fff;color:#5a3f4b;padding:10px 18px;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;transition:all .18s}
.admin-exit-btn:hover{background:#fdf2f6;border-color:var(--rose);color:#c73568}

.admin-stats-row{display:flex;gap:16px;align-items:center;margin-bottom:24px;flex-wrap:wrap}
.admin-stat-card{background:#fff;border:1px solid #f2dce4;border-radius:18px;padding:14px 20px;display:grid;gap:4px;box-shadow:0 8px 24px rgba(61,41,64,0.06);min-width:140px}
.admin-stat-card small{font-size:12px;color:#9b7a86;font-weight:700}
.admin-stat-card strong{font-size:22px;color:#3d2940}
.admin-stat-search{flex:1;min-width:280px}
.admin-stat-search input{width:100%;border:1.5px solid #edd5dd;background:#fff;border-radius:18px;padding:14px 18px;font-size:14px;outline:none;box-shadow:0 4px 16px rgba(61,41,64,0.04);transition:border-color .2s}
.admin-stat-search input:focus{border-color:var(--rose)}

.admin-empty-state{background:#fff;border-radius:20px;padding:60px 20px;text-align:center;font-size:16px;color:#8d6874;border:1px dashed #e8ccd5}
.admin-table-container{background:#fff;border-radius:24px;box-shadow:0 18px 50px rgba(61,41,64,0.08);border:1px solid #f4e1e7;overflow-x:auto}
.admin-table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}
.admin-table th{background:#faf3f6;padding:14px 16px;font-weight:800;color:#5a3c49;border-bottom:1px solid #edd5dd;white-space:nowrap}
.admin-table td{padding:14px 16px;border-bottom:1px solid #f6e8ed;color:#3d2940;vertical-align:middle}
.admin-table tr:last-child td{border-bottom:none}
.admin-table tr:hover td{background:#fff8fa}
.center-cell{text-align:center;color:#997380;font-weight:700}
.date-cell{white-space:nowrap;color:#8d6874;font-size:13px}
.child-cell{white-space:nowrap;color:#c73568}
.title-cell{min-width:160px;font-weight:700}
.text-link-btn{border:0;background:none;padding:0;text-align:left;font-weight:700;color:#3d2940;font-size:14px;cursor:pointer;transition:color .15s}
.text-link-btn:hover{color:var(--rose);text-decoration:underline}
.email-cell{font-family:monospace;color:#2c5ea8;font-size:13px}
.dash-text{color:#caa9b5;font-weight:500}
.action-cell{white-space:nowrap;display:flex;gap:6px;align-items:center}
.admin-pdf-btn{border:0;background:linear-gradient(145deg,#2b72ee,#1a59cb);color:#fff;border-radius:10px;padding:7px 12px;font-weight:800;font-size:12px;box-shadow:0 4px 12px rgba(27,89,203,0.25);cursor:pointer;transition:all .15s}
.admin-pdf-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 16px rgba(27,89,203,0.35)}
.admin-pdf-btn:disabled{opacity:0.6;cursor:wait}
.admin-view-btn{border:1px solid #ebd3dc;background:#fff;color:#573d49;border-radius:10px;padding:6px 10px;font-weight:700;font-size:12px;cursor:pointer;transition:all .15s}
.admin-view-btn:hover{background:#fff0f4;border-color:var(--rose);color:#c73568}
.admin-delete-btn{border:0;background:#fdeef2;color:#ba345c;border-radius:10px;padding:6px 9px;font-size:13px;cursor:pointer;transition:all .15s}
.admin-delete-btn:hover{background:#fcdde5}
@media(max-width:768px){
  .admin-header-bar{flex-direction:column;align-items:stretch}
  .admin-stats-row{flex-direction:column;align-items:stretch}
}
`;
