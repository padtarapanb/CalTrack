// แจ้งเตือนสอบเทียบเข้ากลุ่ม LINE ทุกวัน 08:00 (เวลาไทย) — Vercel Cron เรียก GET /api/notify
// ตั้ง CRON_SECRET ใน Vercel เพื่อกันคนอื่นเรียกเอง (Vercel จะแนบ Authorization: Bearer ให้ cron อัตโนมัติ)
// อ่านข้อมูลเครื่องมือจาก Supabase (ค่าใน config.js) · ถ้าไม่มี จะใช้ CALTRACK_API (ระบบเดิม)
const { equipment, rows: mk, line1, cap, linePush } = require("./_caltrack");

module.exports = async (req, res) => {
  const { CRON_SECRET: cs, SITE_URL: site } = process.env;
  if (cs && req.headers.authorization !== `Bearer ${cs}`) return res.status(401).send("unauthorized");
  try {
    const rows = mk(await equipment(req)), now = new Date(Date.now() + 7 * 36e5);
    const over = rows.filter((r) => r.days < 0).sort((a, b) => a.days - b.days);
    const soon = rows.filter((r) => [30, 14, 7].includes(r.days)).sort((a, b) => a.days - b.days);
    const parts = [];
    if (now.getUTCDay() === 1) parts.push(`📊 สรุปประจำสัปดาห์\nเครื่องมือ ${rows.length} · เกินกำหนด ${over.length} · ครบกำหนดใน 30 วัน ${rows.filter((r) => r.days >= 0 && r.days <= 30).length}`);
    if (over.length) parts.push(`🔴 เกินกำหนดสอบเทียบ (${over.length}) — ห้ามใช้งานจนกว่าจะสอบเทียบ\n` + cap(over.map(line1)));
    if (soon.length) parts.push(`🟡 ใกล้ครบกำหนด (${soon.length})\n` + cap(soon.map(line1)));
    if (!parts.length) return res.status(200).send("วันนี้ไม่มีรายการแจ้งเตือน");
    parts.push("ดูทั้งหมด: " + (site || `https://${req.headers["x-forwarded-host"] || req.headers.host}`));
    res.status(200).send(`LINE push ${await linePush(parts.join("\n\n"))}`);
  } catch (e) { res.status(200).send("ส่งไม่สำเร็จ: " + e.message); }
};
