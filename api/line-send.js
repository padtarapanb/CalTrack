// ผู้ดูแลระบบกดส่งแจ้งเตือนเข้ากลุ่ม LINE จากหน้าเว็บ — POST /api/line-send
// body: { token: <Supabase access token>, ids: ["รหัสเครื่อง", ...] }  หรือ  { token, mode: "overdue" }
// ข้อความสร้างจากข้อมูลจริงบนเซิร์ฟเวอร์เท่านั้น (พิมพ์ข้อความเองไม่ได้) · ต้องเป็นผู้ดูแลระบบ
const { sbConf, rpc, equipment, rows: mk, line1, cap, linePush } = require("./_caltrack");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const c = await sbConf(req);
    if (!c) return res.status(500).json({ error: "ยังไม่ได้ตั้งค่า Supabase" });
    if (!b.token || (await rpc(c, "is_admin", b.token)) !== true) return res.status(403).json({ error: "ต้องเป็นผู้ดูแลระบบ" });
    const all = mk(await equipment(req)), by = b.by ? ` · ส่งโดย ${String(b.by).slice(0, 60)}` : "";
    let pick, head;
    if (Array.isArray(b.ids) && b.ids.length) {
      const ids = new Set(b.ids.map(String).slice(0, 50));
      pick = all.filter((r) => ids.has(String(r.id)));
      head = `🔔 แจ้งเตือนสอบเทียบเครื่องมือ (${pick.length})`;
    } else {
      pick = all.filter((r) => r.days < 0).sort((a, b) => a.days - b.days);
      head = `🔴 เครื่องมือเกินกำหนดสอบเทียบ (${pick.length}) — ห้ามใช้งานจนกว่าจะสอบเทียบ`;
    }
    if (!pick.length) return res.status(200).json({ error: "ไม่มีรายการที่ต้องแจ้ง (เครื่องนี้ไม่มีวันครบกำหนด หรือจำหน่ายแล้ว)" });
    const site = process.env.SITE_URL || `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    await linePush(`${head}${by}\n${cap(pick.sort((a, b) => a.days - b.days).map(line1), 25)}\n\nดูรายละเอียด: ${site}`);
    res.status(200).json({ ok: true, sent: pick.length });
  } catch (e) { res.status(200).json({ error: e.message }); }
};
