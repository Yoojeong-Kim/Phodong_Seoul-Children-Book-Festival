import { env } from "cloudflare:workers";
import { ensureStoryTables, geminiKey, openAIKey, rowToStory } from "../../../../lib/story-store";

async function generateWithGoogleGeminiImage(apiKey: string, prompt: string, refB64?: string | null): Promise<string> {
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "").trim();

  // 1. 모델 자동 탐색 (행사 현장 쾌속 생성을 위해 초고속 Flash 모델 최우선)
  let candidateModels = [
    "gemini-3.1-flash-image"
  ];

  console.log("[Gemini Image Trying Candidate Models]:", candidateModels.join(", "));

  let lastError = "";

  // 1K 표준 해상도 (2~3초 초고속 생성 + D1 2MB 행 한도 완벽 준수)
  const imageConfigFast = {
    imageSize: "1k",
    aspectRatio: "1:1"
  };


  // 참조 이미지가 있는 경우(1쪽, 2쪽)와 텍스트 전용(표지 등) 페이로드 준비
  const payloadsStr: string[] = [];
  if (refB64) {
    payloadsStr.push(JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: refB64 } },
          { text: `[Maintain consistent character appearance, faces, hair, and art style with the reference cover image attached above]\n\n${prompt}` }
        ]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: imageConfigFast
      }
    }));
    payloadsStr.push(JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: refB64 } },
          { text: `[Maintain consistent character appearance, faces, hair, and art style with the reference cover image attached above]\n\n${prompt}` }
        ]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    }));
  }

  payloadsStr.push(JSON.stringify({
    contents: [{
      role: "user",
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: imageConfigFast
    }
  }));

  payloadsStr.push(JSON.stringify({
    contents: [{
      role: "user",
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  }));

  for (const model of candidateModels) {
    for (const ver of ["v1beta"]) {
      for (const pStr of payloadsStr) {
        const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${cleanKey}`;
        try {
          let res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: pStr
          });

          // 일시적 Rate Limit(429) 또는 서버 과부하(503) 시 3초 대기 후 1회 자동 재시도
          if (res.status === 429 || res.status === 503) {
            console.warn(`[Gemini Image Rate Limit/Busy ${ver} ${model}]: 3초 후 재시도...`);
            await new Promise(r => setTimeout(r, 3000));
            res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: pStr
            });
          }

          if (res.ok) {
            const data = await res.json() as any;
            const candidate = data.candidates?.[0];
            if (candidate?.finishReason === "SAFETY") {
              console.warn(`[Gemini Image Safety Block ${ver} ${model}]`);
              continue;
            }
            const imgPart = candidate?.content?.parts?.find((part: any) => part.inlineData?.data);
            if (imgPart?.inlineData?.data) {
              console.log(`[Gemini Image Success]: ${ver}/${model} 성공!`);
              return imgPart.inlineData.data;
            }
          } else {
            const errText = await res.text();
            console.warn(`[Gemini Image ${ver} ${model} Error]:`, res.status, errText.slice(0, 200));
            lastError = `${res.status}: ${errText.slice(0, 150)}`;
            if (res.status === 400 && errText.includes("User location is not supported")) {
              throw new Error("LOCATION_NOT_SUPPORTED");
            }
          }
        } catch (callErr: any) {
          console.warn(`[Gemini Image Exception ${ver} ${model}]:`, callErr?.message);
          lastError = callErr?.message || String(callErr);
          if (lastError.includes("LOCATION_NOT_SUPPORTED")) throw callErr;
        }
      }
    }
  }

  throw new Error(`Google Gemini 이미지 생성 실패: ${lastError}`);
}

export async function POST(req: Request) {
  let acquiredSlot: number | null = null;
  try {
    await ensureStoryTables();
    const { id, page } = await req.json() as { id: string; page: number };
    if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(page) || page < 0 || page > 2) {
      return Response.json({ error: "잘못된 요청이야." }, { status: 400 });
    }
    const row = await env.DB.prepare("SELECT * FROM stories WHERE id=?").bind(id).first();
    if (!row) return Response.json({ error: "동화를 찾지 못했어." }, { status: 404 });
    const story = rowToStory(row);
    const target = story.pages[page];
    if (!target) return Response.json({ error: "해당 페이지가 없어." }, { status: 404 });

    // 페이지별 캐시 키
    const pageKey = page === 0 ? "cover-v1" : `page-${page}-v1`;

    // 캐시 확인
    if (target.image_url?.includes(pageKey)) {
      return Response.json({ image_url: target.image_url, complete: story.status === "complete" });
    }
    const key = `stories/${id}/${pageKey}.png`;
    const existing = await env.DB.prepare("SELECT 1 FROM story_images WHERE key=?").bind(key).first();
    if (existing) {
      target.image_url = `/api/story-images/${id}/${pageKey}.png`;
      await env.DB.prepare("UPDATE stories SET pages_json=? WHERE id=?").bind(JSON.stringify(story.pages), id).run();
      const refreshed = rowToStory(await env.DB.prepare("SELECT * FROM stories WHERE id=?").bind(id).first() as any);
      const allDone = refreshed.pages.every((p: any, i: number) => !!p.image_url?.includes(i === 0 ? "cover-v1" : `page-${i}-v1`));
      if (allDone && refreshed.status !== "complete") {
        await env.DB.prepare("UPDATE stories SET status='complete' WHERE id=?").bind(id).run();
      }
      return Response.json({ image_url: target.image_url, complete: allDone });
    }

    // 슬롯 획득
    const slot = await env.DB.prepare(
      `UPDATE image_slots SET story_id=?,page=?,locked_until=? WHERE slot=(SELECT slot FROM image_slots WHERE locked_until<? ORDER BY slot LIMIT 1) RETURNING slot`
    ).bind(id, page, Date.now() + 240000, Date.now()).first<{ slot: number }>();

    if (!slot) return Response.json({ queued: true }, { status: 202 });
    acquiredSlot = slot.slot;

    // 캐릭터 외형 추출
    const characters = story.characters || [];
    const child = characters.find((c: any) => c.role === "child") || characters[0];
    const guardian = characters.find((c: any) => c.role === "guardian") || characters[1];

    const childDesc = child ? `Child (${child.name}): ${child.appearance}` : "A young child with a warm smile";
    const guardianDesc = guardian ? `Guardian (${guardian.name}): ${guardian.appearance}` : "A loving parent with a warm smile";

    // 페이지별 image_prompt 사용 (AI가 생성한 장면 설명)
    const pagePrompt = target.image_prompt || "";

    const fullPrompt = `A breathtaking, warm, and tender children's picture book illustration for page ${page + 1}.
The scene portrays a deeply loving family moment featuring exactly two characters:
1. Child (${child?.name || "Child"}): ${childDesc}. The child has large, bright, sparkling expressive eyes filled with curiosity, softly rounded blushing cheeks, cute smiling expression, and soft delicately detailed hair.
2. Guardian (${guardian?.name || "Guardian"}): ${guardianDesc}. The guardian is looking at the child with profound warmth, gentle affection, and a loving smile.

Scene Action and Environment:
${pagePrompt}

Artistic Direction & Style:
Premium storybook illustration blending high-end animated feature film aesthetics with the painterly warmth of beloved family picture books. Soft golden-hour sunlight pours across the scene, casting warm rim lighting on their hair and clothes. Rich, cozy pastel color palette of warm peach, apricot, blush pink, soft cream, and honey amber. Heartwarming emotional depth, mutually loving interaction, and comfortable composition. Clean and uncluttered, strictly no text, letters, watermarks, frames, or borders.`;

    // 참조 이미지 (1쪽, 2쪽일 때 0쪽 표지 이미지 참조)
    let coverRefB64: string | null = null;
    if (page > 0) {
      const coverRow = await env.DB.prepare("SELECT b64 FROM story_images WHERE key=?").bind(`stories/${id}/cover-v1.png`).first<{ b64: string }>();
      if (coverRow?.b64) {
        coverRefB64 = coverRow.b64;
      }
    }

    const gKey = geminiKey();
    const oKey = openAIKey();

    if (!gKey && !oKey) {
      return Response.json({ error: "API 키가 설정되지 않았어. Cloudflare 대시보드에서 GEMINI_API_KEY를 확인해 줘." }, { status: 500 });
    }

    let b64: string | null = null;

    // 1순위: Google Gemini 이미지 생성 (gemini-3.1-flash-image, gemini-2.5-flash-image)
    if (gKey) {
      try {
        b64 = await generateWithGoogleGeminiImage(gKey, fullPrompt.substring(0, 4000), coverRefB64);
      } catch (gErr: any) {
        console.error("google_gemini_image_failed:", gErr?.message || String(gErr));
        if (!oKey) throw gErr;
        console.warn("[Fallback] Google Gemini Image failed, attempting OpenAI (gpt-image-2)...");
      }
    }

    // 2순위: OpenAI 폴백 (Google 키가 없거나 Google 실패 시 백업)
    if (!b64 && oKey) {
      let response: Response;
      if (page > 0) {
        if (!coverRefB64) {
          return Response.json({ error: "표지 그림이 아직 없습니다. 순서대로 만들어주세요." }, { status: 409 });
        }
        const bin = atob(coverRefB64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const form = new FormData();
        form.append("model", "gpt-image-2");
        form.append("prompt", fullPrompt.substring(0, 4000));
        form.append("size", "1024x1024");
        form.append("quality", "medium");
        form.append("output_format", "png");
        form.append("image", new Blob([bytes], { type: "image/png" }), "reference.png");

        response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${oKey}` },
          body: form,
        });
      } else {
        response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${oKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-image-2",
            prompt: fullPrompt.substring(0, 4000),
            size: "1024x1024",
            quality: "medium",
          }),
        });
      }

      if (!response.ok) {
        const detail = await response.text();
        console.error("image_api", response.status, detail.slice(0, 500));
        throw new Error(`이미지 API 오류 ${response.status}`);
      }
      const data = await response.json() as any;
      b64 = data.data?.[0]?.b64_json;
      if (!b64 && data.data?.[0]?.url) {
        const res = await fetch(data.data[0].url);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          let binary = "";
          const byteArr = new Uint8Array(buf);
          for (let i = 0; i < byteArr.byteLength; i++) {
            binary += String.fromCharCode(byteArr[i]);
          }
          b64 = btoa(binary);
        }
      }
    }

    if (!b64) throw new Error("이미지 데이터가 생성되지 않았습니다.");

    await env.DB.prepare("INSERT INTO story_images (key,b64,created_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET b64=excluded.b64").bind(key, b64, Date.now()).run();
    target.image_url = `/api/story-images/${id}/${pageKey}.png`;
    await env.DB.prepare("UPDATE stories SET pages_json=? WHERE id=?").bind(JSON.stringify(story.pages), id).run();
    const refreshed2 = rowToStory(await env.DB.prepare("SELECT * FROM stories WHERE id=?").bind(id).first() as any);
    const allDone2 = refreshed2.pages.every((p: any, i: number) => !!p.image_url?.includes(i === 0 ? "cover-v1" : `page-${i}-v1`));
    if (allDone2) await env.DB.prepare("UPDATE stories SET status='complete' WHERE id=?").bind(id).run();
    return Response.json({ image_url: target.image_url, complete: allDone2 });
  } catch (e) {
    console.error("image_gen_failed", e instanceof Error ? e.message : String(e));
    return Response.json({ error: e instanceof Error ? e.message : "이미지를 만드는 데 실패했어." }, { status: 500 });
  } finally {
    try {
      if (acquiredSlot !== null) {
        await env.DB.prepare("UPDATE image_slots SET story_id=NULL,page=NULL,locked_until=0 WHERE slot=?").bind(acquiredSlot).run();
      }
    } catch {}
  }
}
