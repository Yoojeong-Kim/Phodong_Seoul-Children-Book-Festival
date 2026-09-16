import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfStoryPage {
  title: string;
  text: string;
  image_url?: string;
}

export interface PdfStoryCharacter {
  name: string;
  role: string;
  appearance?: string;
  photo?: string;
  photo_url?: string;
}

export interface PdfStoryData {
  title: string;
  child_name: string;
  genre?: string;
  object_name?: string;
  question?: string;
  answer?: string;
  pages: PdfStoryPage[];
  characters?: PdfStoryCharacter[];
}

export interface InitialItem {
  photo: string;
  name: string;
  reason: string;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function imgTag(url: string | undefined, alt: string) {
  if (!url) return `<div class="img-placeholder">🖼</div>`;
  return `<img src="${esc(url)}" alt="${esc(alt)}" crossorigin="anonymous" />`;
}

export async function downloadStoryPdf(story: PdfStoryData) {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  const pagesHtml: string[] = [];

  // 표지
  pagesHtml.push(`
    <div class="pdf-page cover-page">
      <div class="img-side">
        ${imgTag(story.pages[0]?.image_url, '표지')}
      </div>
      <div class="text-side cover-text-side">
        <div class="cover-content">
          <small>${esc(story.child_name)}의 동화</small>
          <h1>${esc(story.title)}</h1>
          ${story.question ? `<p class="cover-sub">${esc(story.question)}</p>` : story.object_name ? `<p class="cover-sub">소중한 물건: ${esc(story.object_name)}</p>` : ''}
        </div>
      </div>
    </div>`);

  // 스토리 본문 5쪽
  story.pages.forEach((p, i) => {
    const pageTitle = i === 0 ? story.title : p.title;
    if (!p.image_url) {
      pagesHtml.push(`
        <div class="pdf-page story-page text-only-pdf-page">
          <div class="text-side text-only-side">
            <span class="page-num">${i + 1} / 5</span>
            <small>${esc(story.child_name)}의 동화</small>
            <h2>${esc(pageTitle)}</h2>
            <hr/>
            <p>${esc(p.text)}</p>
          </div>
        </div>`);
    } else {
      pagesHtml.push(`
        <div class="pdf-page story-page">
          <div class="img-side">
            ${imgTag(p.image_url, pageTitle)}
          </div>
          <div class="text-side">
            <small>${esc(story.child_name)}의 동화</small>
            <span class="page-num">${i + 1} / 5</span>
            <h2>${esc(pageTitle)}</h2>
            <hr/>
            <p>${esc(p.text)}</p>
          </div>
        </div>`);
    }
  });

  // 마지막 6번째 장: 폴라로이드 사진 카드 페이지
  const chars = story.characters || [];
  const child = chars.find(c => c.role === "child") || chars[0];
  const guardian = chars.find(c => c.role === "guardian") || chars[1];

  let polaroidsHtml = '';
  if (child || guardian) {
    polaroidsHtml = `<div class="pdf-polaroid-gallery">`;
    if (child) {
      const childSrc = child.photo || child.photo_url || '';
      polaroidsHtml += `
        <figure class="pdf-polaroid-card pdf-tilt-left">
          <div class="pdf-photo-box">
            ${childSrc ? `<img src="${esc(childSrc)}" alt="${esc(child.name)}" crossorigin="anonymous" />` : `<div class="img-placeholder">👧</div>`}
          </div>
          <figcaption>
            <strong>👧 ${esc(child.name)}</strong>
            <span>${child.role === "child" ? "우리 아이 카드" : "주인공"}</span>
          </figcaption>
        </figure>
      `;
    }
    if (guardian) {
      const guardianSrc = guardian.photo || guardian.photo_url || '';
      polaroidsHtml += `
        <figure class="pdf-polaroid-card pdf-tilt-right">
          <div class="pdf-photo-box">
            ${guardianSrc ? `<img src="${esc(guardianSrc)}" alt="${esc(guardian.name)}" crossorigin="anonymous" />` : `<div class="img-placeholder">👨</div>`}
          </div>
          <figcaption>
            <strong>👨 ${esc(guardian.name)}</strong>
            <span>${guardian.role === "guardian" ? "엄마·아빠 카드" : "주인공"}</span>
          </figcaption>
        </figure>
      `;
    }
    polaroidsHtml += `</div>`;
  }

  pagesHtml.push(`
    <div class="pdf-page story-page pdf-polaroid-page-wrap">
      <div class="pdf-polaroid-full">
        <small>${esc(story.child_name)}의 특별한 순간 📸</small>
        <h2>우리가 함께 그린 얼굴</h2>
        <p class="pdf-polaroid-desc">서로를 바라보며 정성껏 그린 마음이 이 책에 영원히 담겼어요 ✨</p>
        ${polaroidsHtml}
      </div>
    </div>`);

  const W = 1122;
  const H = 793;

  container.innerHTML = `
    <style>
      .pdf-wrapper {
        font-family: 'Noto Sans KR', sans-serif;
        background: #fff;
        width: ${W}px;
      }
      .pdf-page {
        width: ${W}px;
        height: ${H}px;
        display: flex;
        overflow: hidden;
        background: #fff;
      }
      .img-side {
        width: ${W / 2}px;
        height: ${H}px;
        background: #f5d6df;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }
      .img-side img {
        width: 100%;
        height: auto;
        object-fit: contain;
        display: block;
      }
      .text-side {
        width: ${W / 2}px;
        height: ${H}px;
        padding: 50px 40px 40px 45px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        background: #fffdfb;
        position: relative;
        box-sizing: border-box;
      }
      .text-side small {
        font-size: 16px;
        color: #f55f91;
        font-weight: 700;
      }
      .page-num {
        position: absolute;
        top: 30px;
        right: 40px;
        font-size: 16px;
        color: #f55f91;
        font-weight: 700;
      }
      .text-side h2 {
        font-size: 28px;
        font-weight: 900;
        color: #3d2940;
        line-height: 1.35;
        word-break: keep-all;
        margin: 0;
      }
      .text-side hr {
        border: none;
        border-top: 2px solid #ffe2ec;
        margin: 5px 0;
      }
      .text-side p {
        font-size: 19px;
        line-height: 1.85;
        color: #432e3a;
        word-break: keep-all;
        margin: 0;
      }
      .text-only-pdf-page {
        display: flex !important;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at 50% 30%, #ffffff 0%, #fffdfb 60%, #fff8f3 100%) !important;
      }
      .text-only-side {
        width: 82% !important;
        max-width: 880px;
        padding: 50px 30px !important;
        text-align: center;
        margin: auto;
      }
      .text-only-side h2 {
        font-size: 36px !important;
        margin: 12px 0 16px !important;
      }
      .text-only-side hr {
        width: 120px;
        margin: 0 auto 24px !important;
        border-top: 3px solid #ffb3cc;
      }
      .text-only-side p {
        font-size: 27px !important;
        line-height: 2.15 !important;
        color: #3d2940 !important;
      }
      .cover-text-side {
        background: linear-gradient(160deg, #fff7fa, #ffe8f0);
        justify-content: center;
        align-items: center;
        text-align: center;
        padding: 40px;
      }
      .cover-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }
      .cover-content h1 {
        font-size: 36px;
        font-weight: 900;
        color: #3d2940;
        line-height: 1.3;
        word-break: keep-all;
        margin: 0;
      }
      .cover-sub {
        font-size: 18px;
        color: #8d5f70;
      }
      .back-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(to top, rgba(0,0,0,.75), transparent);
        padding: 40px 30px 30px;
        color: #fff;
        text-align: center;
      }
      .back-overlay p {
        font-size: 26px;
        font-weight: 900;
        line-height: 1.4;
        color: #fff;
        margin: 0;
      }
      .back-overlay small {
        font-size: 16px;
        color: rgba(255,255,255,.85);
        margin-top: 8px;
        display: block;
      }
      
      /* 폴라로이드 스타일 추가 */
      .polaroids-container {
        display: flex;
        flex-direction: column;
        gap: 30px;
        width: 100%;
        max-width: 400px;
      }
      .polaroid {
        margin: 0;
        background: #fff;
        padding: 16px 16px 24px;
        border-radius: 20px;
        box-shadow: 0 12px 30px rgba(120,60,80,0.15);
      }
      .tilt-left { transform: rotate(-1.5deg); }
      .tilt-right { transform: rotate(1.2deg); }
      .polaroid img {
        width: 100%;
        height: 200px;
        object-fit: cover;
        border-radius: 12px;
        display: block;
        margin-bottom: 16px;
      }
      .polaroid figcaption {
        display: flex;
        flex-direction: column;
        gap: 6px;
        text-align: left;
      }
      .polaroid figcaption strong {
        font-size: 22px;
        color: #3d2940;
        font-weight: 700;
      }
      .polaroid figcaption span {
        font-size: 16px;
        color: #8d6874;
        line-height: 1.4;
      }
      .pdf-polaroid-page-wrap {
        display: flex !important;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at 50% 30%, #ffffff 0%, #fffbfd 60%, #fff3f7 100%) !important;
      }
      .pdf-polaroid-full {
        width: 100%;
        text-align: center;
        padding: 40px 50px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .pdf-polaroid-full small {
        font-size: 18px;
        color: #f55f91;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .pdf-polaroid-full h2 {
        font-size: 34px;
        font-weight: 900;
        color: #3d2940;
        margin: 4px 0 10px;
      }
      .pdf-polaroid-desc {
        font-size: 20px;
        color: #8d6874;
        margin: 0 0 34px;
      }
      .pdf-polaroid-gallery {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 50px;
        width: 100%;
      }
      .pdf-polaroid-card {
        margin: 0;
        background: #ffffff;
        padding: 16px 16px 26px;
        border-radius: 24px;
        box-shadow: 0 16px 40px rgba(120, 60, 80, 0.14);
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 320px;
        border: 1px solid #f6e6ee;
      }
      .pdf-tilt-left { transform: rotate(-3deg); }
      .pdf-tilt-right { transform: rotate(3deg); }
      .pdf-photo-box {
        width: 100%;
        height: 290px;
        background: #faf2f6;
        border-radius: 14px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .pdf-photo-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .pdf-polaroid-card figcaption {
        margin-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        text-align: center;
      }
      .pdf-polaroid-card figcaption strong {
        font-size: 22px;
        color: #3d2940;
        font-weight: 800;
      }
      .pdf-polaroid-card figcaption span {
        font-size: 15px;
        color: #946e7c;
        font-weight: 600;
      }
    </style>
    <div class="pdf-wrapper">
      ${pagesHtml.join('')}
    </div>
  `;

  await new Promise((resolve) => setTimeout(resolve, 500));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pages = container.querySelectorAll('.pdf-page');

  for (let i = 0; i < pages.length; i++) {
    const pageEl = pages[i] as HTMLElement;
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    
    if (i > 0) {
      doc.addPage();
    }
    
    doc.addImage(imgData, 'JPEG', 0, 0, 297, 210);
  }

  document.body.removeChild(container);

  const safeName = story.title.replace(/\s+/g, '_') || 'story';
  doc.save(`${safeName}_동화.pdf`);
}
