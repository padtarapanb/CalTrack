// แจ้งเตือนสอบเทียบเข้ากลุ่ม LINE ทุกวัน 08:00 (เวลาไทย) — Vercel Cron เรียก GET /api/notify
// ตั้ง CRON_SECRET ใน Vercel เพื่อกันคนอื่นเรียกเอง (Vercel จะแนบ Authorization: Bearer ให้ cron อัตโนมัติ)
// ส่งเข้า: กลุ่มหลัก (LINE_GROUP_ID) + ทุกกลุ่มที่เปิด "แจ้งรายวัน" ในหน้าแจ้งเตือน LINE (กลุ่มที่ระบุกลุ่มงาน จะได้เฉพาะเครื่องของกลุ่มงานนั้น)
// ทุกวัน: เครื่องเกินกำหนด + เครื่องที่จะครบใน 30 / 14 / 7 วันพอดี · วันจันทร์: เพิ่มการ์ดสรุปสถานะ
const { sbConf, rpc, equipment, rows: mk, buildFlex, linePushTo, siteOf } = require("./_caltrack");

module.exports = async (req, res) => {
  const { CRON_SECRET: cs, LINE_GROUP_ID: gid } = process.env;
  if (cs && req.headers.authorization !== `Bearer ${cs}`) return res.status(401).send("unauthorized");
  try {
    const all0 = mk(await equipment(req)), monday = new Date(Date.now() + 7 * 36e5).getUTCDay() === 1, site = siteOf(req);
    const targets = gid ? [{ group_id: gid, unit: "", name: "กลุ่มหลัก" }] : [];
    const c = await sbConf(req);
    if (c) try { (await rpc(c, "line_targets")).forEach((t) => { if (!targets.some((x) => x.group_id === t.group_id)) targets.push(t); }); } catch (e) {}
    if (!targets.length) return res.status(200).send("ยังไม่มีกลุ่ม LINE");
    const log = [];
    for (const t of targets) {
      const all = t.unit ? all0.filter((r) => r.group === t.unit) : all0;
      const items = all.filter((r) => r.days < 0 || [30, 14, 7].includes(r.days));
      if (!items.length && !monday) { log.push(`${t.name}: ไม่มีรายการ`); continue; }
      const msg = buildFlex({ kind: monday ? "summary" : "daily", items: monday ? all.filter((r) => r.days <= 30) : items, all, site, unit: t.unit });
      if (!msg) { log.push(`${t.name}: ไม่มีรายการ`); continue; }
      try { await linePushTo(t.group_id, [msg]); log.push(`${t.name}: ส่งแล้ว`); } catch (e) { log.push(`${t.name}: ${e.message}`); }
    }
    res.status(200).send(log.join("\n"));
  } catch (e) { res.status(200).send("ส่งไม่สำเร็จ: " + e.message); }
};
