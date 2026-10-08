// ผู้ดูแลระบบกดส่งแจ้งเตือนเข้ากลุ่ม LINE จากหน้าเว็บ
// GET  /api/line-send            → { default: true/false } (มีกลุ่มหลักใน Vercel หรือไม่)
// POST /api/line-send  body: { token, kind: "pick"|"overdue"|"soon"|"summary", ids: [...], groups: [0, 3, ...], by }
//   groups: 0 = กลุ่มหลัก (LINE_GROUP_ID ใน Vercel) · ตัวเลขอื่น = กลุ่มที่เพิ่มในหน้า "แจ้งเตือน LINE"
// ข้อความสร้างจากข้อมูลจริงบนเซิร์ฟเวอร์เท่านั้น · ต้องเป็นผู้ดูแลระบบ
const { sbConf, rpc, rest, equipment, rows: mk, buildFlex, linePushTo, siteOf } = require("./_caltrack");

module.exports = async (req, res) => {
  if (req.method === "GET") return res.status(200).json({ default: !!process.env.LINE_GROUP_ID, token: !!process.env.LINE_CHANNEL_ACCESS_TOKEN });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const c = await sbConf(req);
    if (!c) return res.status(500).json({ error: "ยังไม่ได้ตั้งค่า Supabase" });
    if (!b.token || (await rpc(c, "is_admin", b.token)) !== true) return res.status(403).json({ error: "ต้องเป็นผู้ดูแลระบบ" });
    // กลุ่มปลายทาง
    const want = [...new Set((Array.isArray(b.groups) && b.groups.length ? b.groups : [0]).map(Number))].slice(0, 20), to = [];
    for (const g of want) {
      if (g === 0) { if (process.env.LINE_GROUP_ID) to.push({ id: process.env.LINE_GROUP_ID, name: "กลุ่มหลัก", unit: "" }); continue; }
      const x = (await rest(c, `line_groups?id=eq.${g}&active=is.true&select=group_id,name,unit`, b.token))[0];
      if (x) to.push({ id: x.group_id, name: x.name, unit: x.unit || "" });
    }
    if (!to.length) return res.status(200).json({ error: "ยังไม่ได้เลือกกลุ่ม LINE ที่ใช้งานได้" });
    // รายการเครื่องมือ
    const all = mk(await equipment(req)), kind = ["pick", "overdue", "soon", "summary"].includes(b.kind) ? b.kind : "overdue";
    let items;
    if (kind === "pick") { const ids = new Set((b.ids || []).map(String).slice(0, 100)); items = all.filter((r) => ids.has(String(r.id))); }
    else if (kind === "overdue") items = all.filter((r) => r.days < 0);
    else items = all.filter((r) => r.days <= 30 && (kind === "summary" || r.days >= 0));
    if (!items.length && kind !== "summary") return res.status(200).json({ error: "ไม่มีรายการที่ต้องแจ้ง (เครื่องที่เลือกไม่มีวันครบกำหนด หรือจำหน่ายแล้ว)" });
    // กลุ่มที่ผูกกับกลุ่มงาน ได้เฉพาะเครื่องของกลุ่มงานนั้น (ยกเว้น “เครื่องที่เลือก” ส่งตามที่เลือก)
    const done = [], fail = [], site = siteOf(req), by = b.by ? String(b.by).slice(0, 60) : "";
    for (const t of to) {
      const its = kind !== "pick" && t.unit ? items.filter((r) => r.group === t.unit) : items, al = t.unit && kind !== "pick" ? all.filter((r) => r.group === t.unit) : all;
      if (!its.length && kind !== "summary") { fail.push(`${t.name}: ไม่มีรายการของกลุ่มงาน ${t.unit}`); continue; }
      const msg = buildFlex({ kind, items: its, all: al, site, by, unit: kind !== "pick" ? t.unit : "" });
      try { await linePushTo(t.id, [msg]); done.push(t.name); } catch (e) { fail.push(`${t.name}: ${e.message}`); }
    }
    res.status(200).json(done.length ? { ok: true, sent: items.length, groups: done, fail } : { error: fail.join(" · ") });
  } catch (e) { res.status(200).json({ error: e.message }); }
};
