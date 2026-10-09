// ===== ตั้งค่าการเชื่อมต่อ CalTrack =====
// ระบบสมาชิก + ข้อมูลเครื่องมือ = Supabase · ไฟล์ใบรับรอง/แบบฟอร์ม = Google Drive (ผ่าน Apps Script)

window.CALTRACK_SUPABASE = {
  url: "https://eyylnmvrismymskjfhzi.supabase.co",  // ← วาง Project URL เช่น "https://abcdefgh.supabase.co"
  key: "sb_publishable_Lve_nohG0PTNI5FRTbtRVA_qxqgKj57"   // ← วาง Publishable key (ขึ้นต้น sb_publishable_) — ห้ามใช้ secret / service_role
};

// ที่เก็บไฟล์ (Apps Script เดิม ลิงก์เดิม) — ใช้อัปโหลด/เปิดดูใบรับรองและแบบฟอร์มเท่านั้น
window.CALTRACK_FILES = "https://script.google.com/macros/s/AKfycbxIwbGu6SHC3D8AaJ6ScsR84v5iJ3LWixlQJp-nxUzEO7TuNvt-TDNUvHzbCVLj_9-X5A/exec";

// ระบบเดิม (เก็บข้อมูลใน Google) — ไม่ใช้แล้ว เว้นว่างไว้
window.CALTRACK_API = "";
