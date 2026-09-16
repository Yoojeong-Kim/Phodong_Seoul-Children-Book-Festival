import { env } from "cloudflare:workers";
import { ensureStoryTables } from "../../../../lib/story-store";

export async function POST(req: Request) {
  try {
    await ensureStoryTables();
    const body = await req.json() as any;
    const id = String(body.id || "").trim();
    const guardianName = String(body.guardianName || "").trim().slice(0, 50);
    const guardianPhone = String(body.guardianPhone || "").trim().slice(0, 50);
    const guardianEmail = String(body.guardianEmail || "").trim().slice(0, 100);

    if (!/^[0-9a-f-]{36}$/.test(id)) {
      return Response.json({ error: "잘못된 동화 식별자야." }, { status: 400 });
    }
    if (!guardianPhone && !guardianEmail) {
      return Response.json({ error: "연락처(휴대폰) 또는 이메일 주소 중 하나는 꼭 입력해 줘." }, { status: 400 });
    }
    if (guardianEmail && !guardianEmail.includes("@")) {
      return Response.json({ error: "올바른 이메일 주소를 입력해 줘." }, { status: 400 });
    }

    await env.DB.prepare(
      "UPDATE stories SET guardian_contact_name=?, guardian_phone=?, guardian_email=? WHERE id=?"
    ).bind(guardianName, guardianPhone, guardianEmail, id).run();

    return Response.json({ saved: true });
  } catch (e) {
    console.error("contact_save_failed", e);
    return Response.json({ error: "연락처를 저장하지 못했어." }, { status: 500 });
  }
}
