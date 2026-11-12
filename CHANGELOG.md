**[0.1.0] - 2026-11-12**

เวอร์ชันแรกที่เผยแพร่ ใช้แทน WindPress ได้ทันที

- **Tailwind CSS 4.3:** compile ใน browser ของผู้ดูแล เก็บเป็นไฟล์ CSS ไฟล์เดียวให้ผู้เข้าชม ไม่ต้องมี Node.js บนเซิร์ฟเวอร์ · main.css ค่าเริ่มต้นใส่ utilities แบบไม่อยู่ใน layer และโหลดท้ายสุดของ `<head>` จึงชนะ CSS ของธีม
- **หลายไฟล์ + CSS เฉพาะหน้า:** ไฟล์ที่ `main.css` import ใช้ทุกหน้า ไฟล์อื่นเลือกใช้เป็นรายหน้าจากแผง "CSS เฉพาะหน้า" ในหน้าแก้ไข · นำเข้าไฟล์จาก WindPress ได้ในคลิกเดียว · `@import url(...)` (เช่น Google Fonts) ในไฟล์ย่อยถูกยกไปไว้บนสุดให้อัตโนมัติ
- **Gutenberg:** live preview, ใช้ CSS ของหน้าเว็บจริงใน editor (หน้าตาตรงกับหน้าเว็บ), แผง Tailwind classes (autocomplete, เรียง class, ดู CSS), ส่งสีและฟอนต์จาก `@theme` เข้า palette (theme.json), build ใหม่อัตโนมัติหลังบันทึก
- **Common Block:** ลงทะเบียน `windpress/common-block` เนื้อหาที่สร้างด้วย WindPress ใช้ต่อได้โดยไม่ต้องแปลง พร้อมแผง Element ใน sidebar
- **Elementor:** live preview และ autocomplete ในช่อง CSS Classes
- **สแกนครบ:** เนื้อหา, ไฟล์ธีม, ปลั๊กอินที่เลือก, ACF, Widget/เมนู/ค่าของธีม, Elementor · ปุ่มตรวจหน้าเว็บบอก class ที่ขาดในแต่ละหน้า
- **หน้าตั้งค่า:** แบบ app (เมนู, Explorer, editor CodeMirror) โทนเดียวกับ InsightX AllHub · ภาษาไทย/อังกฤษ · หน้า "ดูรายละเอียด" พร้อม banner
- **อัปเดตอัตโนมัติจาก GitHub Releases**
