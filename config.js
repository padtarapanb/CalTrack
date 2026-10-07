// ===== ตั้งค่าการเชื่อมต่อ CalTrack =====
// เว็บจริง (caltrack-rmsc2.vercel.app)  = ระบบเดิม (Google) ทำงานเหมือนเดิมทุกอย่าง
// ลิงก์อื่นทั้งหมด (เว็บทดลองของ Vercel)   = ระบบสมาชิกใหม่ (Supabase) · ไม่เชื่อม Google · ไม่แตะข้อมูลจริง
(function () {
  var PROD = location.hostname === "caltrack-rmsc2.vercel.app";

  window.CALTRACK_API = PROD
    ? "https://script.google.com/macros/s/AKfycbyfCs-3aiVyNb2Tm2Rr8ng4pXiCwGeqTrpaSDhAb1qea-WYpv71WG7_edOynB_OsQ05XQ/exec"
    : "";

  window.CALTRACK_SUPABASE = PROD ? null : {
    url: "",  // ← วาง Project URL ระหว่างเครื่องหมายคำพูด เช่น "https://abcdefgh.supabase.co"
    key: ""   // ← วาง Publishable key (ขึ้นต้น sb_publishable_) หรือ anon public key
  };
})();
