# InsightX Tailwind (`insightx-tailwind`)

ปลั๊กอิน WordPress สำหรับใช้ Tailwind CSS 4.3 ทั้งหน้าเว็บและ editor โดย compile ใน browser ของผู้ดูแลแล้วส่งให้ผู้เข้าชมเป็นไฟล์ CSS ไฟล์เดียว ไม่ต้องมี Node.js บนเซิร์ฟเวอร์ และใช้แทน WindPress ได้ทันที (รองรับ Common Block ของ WindPress)

ดูประวัติการเปลี่ยนแปลงใน [CHANGELOG.md](CHANGELOG.md)

คู่มือภาษาไทยพร้อมภาพหน้าจอ: [เปิดอ่าน HTML](docs/manual-th.html) · [ต้นฉบับ Markdown](docs/manual-th.md)

## ฟีเจอร์หลัก

- **Utilities ชนะ CSS ธีม:** main.css ค่าเริ่มต้น import utilities แบบไม่อยู่ใน layer และโหลดท้ายสุดของ `<head>`
- **หลายไฟล์ + CSS เฉพาะหน้า:** ไฟล์ที่ `main.css` import ใช้ทุกหน้า ไฟล์อื่นเลือกเป็นรายหน้าในหน้าแก้ไข
- **Gutenberg:** live preview, ใช้ CSS ของหน้าเว็บจริงใน editor, แผง Tailwind classes (autocomplete, เรียง class, ดู CSS), Common Block, ส่งสี `@theme` เข้า theme.json
- **Elementor:** live preview และ autocomplete ในช่อง CSS Classes
- **สแกนแหล่งสาธารณะ:** เรื่องและหน้าที่เผยแพร่, ไฟล์ธีม, ปลั๊กอินที่เลือก, เมนูที่เผยแพร่ และ Elementor · ปุ่มตรวจหน้าเว็บ
- **อัปเดตจาก GitHub Releases** (plugin-update-checker) · ภาษาไทย/อังกฤษ

## การติดตั้ง

1. ดาวน์โหลด `insightx-tailwind-vX.Y.Z.zip` จากหน้า [Releases](https://github.com/InsightX-th/insightx-tailwind/releases) (zip นี้มี `dist/` ที่ build แล้ว — zip ของ source code จาก GitHub ใช้ติดตั้งไม่ได้)
2. ปลั๊กอิน → เพิ่มปลั๊กอินใหม่ → อัปโหลด แล้วเปิดใช้งาน
3. ถ้าเคยใช้ WindPress: InsightX Tailwind → ไฟล์ CSS → นำเข้าจาก WindPress แล้วปิด WindPress
4. กด **บันทึกและ Build** แล้ว **ตรวจหน้าเว็บ** ในเมนู Build และ Cache

> ถ้าเว็บสร้างด้วย Common Block ของ WindPress อย่าปิดปลั๊กอินนี้โดยไม่มีตัวแทน เนื้อหาจะไม่แสดง

## สำหรับผู้พัฒนา

ค่า ACF และ options ของ Widget/ธีมจะถูกสแกนต่อเมื่อผู้พัฒนาระบุชื่อฟิลด์หรือ option ที่เผยแพร่สู่ CSS สาธารณะได้เท่านั้น ตัวอย่างในโค้ดของเว็บไซต์:

```php
add_filter('insightx_tailwind_public_scan_meta_keys', static fn() => ['hero_class']);
add_filter('insightx_tailwind_public_scan_options', static fn() => ['widget_public_styles']);
```

ให้ระบุเฉพาะค่าที่เผยแพร่ได้ทั้ง option เพราะ CSS ที่ build จะเข้าถึงได้โดยผู้เข้าชมทุกคน

ต้องมี Node.js 22+, pnpm 10 และ PHP 7.4+

```bash
pnpm install
pnpm dev        # vite build --watch → dist/
pnpm build      # vue-tsc (strict) + vite build
pnpm test       # Vitest
php tests/common-block-render.php
python3 scripts/i18n.py   # อัปเดต src/I18n.php, .pot, .po, .mo (ต้องมี gettext)
```

โครงสร้าง:

- `insightx-tailwind.php`, `src/` — PHP (REST, scanner, cache, page CSS, Gutenberg/Elementor, Common Block, updater)
- `app/src/` — TypeScript/Vue (compiler, runtime, admin, Gutenberg) → build เป็น `dist/` (ไม่ commit)
- `languages/` — คำแปล · `libs/plugin-update-checker/` — ตัวเช็กอัปเดต

## ออกเวอร์ชันใหม่

1. แก้เลขเวอร์ชันให้ตรงกันใน `insightx-tailwind.php` (header `Version`) และ `src/Plugin.php` (`VERSION`)
2. เพิ่มหัวข้อ `**[X.Y.Z] - YYYY-MM-DD**` ไว้บนสุดของ `CHANGELOG.md` (ใช้เป็น release notes)
3. commit แล้ว push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

workflow `release.yml` จะเช็กว่าเลขเวอร์ชันตรงกับ tag, build `dist/`, รัน test, สร้าง zip และ GitHub Release ให้ เว็บที่ติดตั้งไว้จะเห็นอัปเดตในหน้าปลั๊กอิน

## License

GPL-3.0-or-later — ดู [LICENSE](LICENSE)
