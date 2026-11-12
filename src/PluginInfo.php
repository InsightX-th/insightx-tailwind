<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

/**
 * "View details" modal on the Plugins screen. There's no update server, so we
 * answer WordPress's plugins_api request for our slug ourselves; WordPress then
 * renders its standard modal (banner, tabs, meta sidebar).
 */
final class PluginInfo
{
    public const SLUG = 'insightx-tailwind';

    public static function register_hooks(): void
    {
        add_filter('plugins_api', [self::class, 'info'], 10, 3);
    }

    /**
     * @param false|object|array<string, mixed> $result
     * @param object $args
     * @return false|object|array<string, mixed>
     */
    public static function info($result, string $action, $args)
    {
        if ($action !== 'plugin_information' || !is_object($args) || ($args->slug ?? '') !== self::SLUG) {
            return $result;
        }
        global $wp_version;
        $asset = static fn(string $file): string => add_query_arg(
            'ver',
            (string) filemtime(INSIGHTX_TAILWIND_DIR . '/assets/branding/' . $file),
            plugins_url('assets/branding/' . $file, INSIGHTX_TAILWIND_FILE)
        );

        return (object) [
            'name'          => 'InsightX Tailwind',
            'slug'          => self::SLUG,
            'version'       => Plugin::VERSION,
            'author'        => '<a href="https://www.insightx.in.th">InsightX</a>',
            'homepage'      => 'https://insightx.in.th/',
            'requires'      => '6.5',
            'tested'        => (string) $wp_version,
            'requires_php'  => '7.4',
            'last_updated'  => gmdate('Y-m-d H:i:s', (int) filemtime(INSIGHTX_TAILWIND_FILE)),
            'sections'      => self::sections(),
            'banners'       => ['low' => $asset('banner.svg'), 'high' => $asset('banner.svg')],
            'icons'         => ['svg' => $asset('icon.svg')],
            'external'      => true, // no "Install Now" for a plugin that isn't on wordpress.org
        ];
    }

    /**
     * Merge our presentation into the update checker's release info.
     *
     * @param object|null $info \YahnisElsts\PluginUpdateChecker\v5p6\Plugin\PluginInfo
     * @return object|null
     */
    public static function decorate($info)
    {
        if (!is_object($info)) {
            return $info;
        }
        $ours = (array) self::info(false, 'plugin_information', (object) ['slug' => self::SLUG]);
        foreach (['name', 'author', 'homepage', 'requires', 'tested', 'requires_php', 'sections', 'banners', 'icons'] as $key) {
            $info->{$key} = $ours[$key];
        }
        return $info;
    }

    /**
     * Long-form copy per language (kept out of the .po file on purpose: it's
     * marketing text, not UI strings).
     *
     * @return array<string, string>
     */
    private static function sections(): array
    {
        $th = strpos(determine_locale(), 'th') === 0;

        if ($th) {
            return [
                'description'  => <<<'HTML'
<p><strong>InsightX Tailwind</strong> ใส่ Tailwind CSS 4.3 ให้ WordPress ครบทั้งหน้าเว็บและ editor โดย compile ใน browser แล้วส่งให้ผู้เข้าชมเป็นไฟล์ CSS ไฟล์เดียว ไม่ต้องมี Node.js บนเซิร์ฟเวอร์ และใช้แทน WindPress ได้ทันที</p>
<h4>CSS ชนะธีม</h4>
<ul>
<li><strong>Utilities ไม่อยู่ใน layer</strong> — โหลดท้ายสุดของ &lt;head&gt; class อย่าง <code>text-white</code> จึงชนะ CSS ของธีม</li>
<li><strong>หลายไฟล์</strong> — main.css + ไฟล์ที่ @import เข้ามา แก้ได้ใน editor ที่มี syntax highlight</li>
<li><strong>นำเข้าจาก WindPress</strong> — ย้ายไฟล์ CSS เดิมมาในคลิกเดียว</li>
</ul>
<h4>Gutenberg</h4>
<ul>
<li><strong>Live preview</strong> — เปลี่ยน class แล้วเห็นผลใน canvas ทันที</li>
<li><strong>ใช้ CSS ของหน้าเว็บจริงใน editor</strong> — หน้าตาใน editor ตรงกับหน้าเว็บ</li>
<li><strong>แผง Tailwind classes</strong> — autocomplete, เรียง class, ดู CSS ที่ได้</li>
<li><strong>Common Block</strong> — block HTML ทั่วไป ใช้กับเนื้อหาที่สร้างด้วย WindPress ได้ทันที</li>
<li><strong>theme.json</strong> — สีและฟอนต์จาก @theme ขึ้นใน palette ของ Gutenberg</li>
</ul>
<h4>สแกนแหล่งสาธารณะ</h4>
<ul>
<li>เรื่องและหน้าที่เผยแพร่, ไฟล์ธีม, ปลั๊กอินที่เลือก, เมนูที่เผยแพร่ และ Elementor; ACF กับค่า Widget/ธีมต้องอนุญาตชื่อข้อมูลก่อน</li>
<li><strong>ตรวจหน้าเว็บ</strong> — เปิดทุกหน้าที่ publish แล้วบอก class ที่ขาด</li>
<li>Build ใหม่อัตโนมัติเมื่อบันทึกใน Gutenberg</li>
</ul>
HTML,
                'installation' => <<<'HTML'
<ol>
<li>อัปโหลดโฟลเดอร์ <code>insightx-tailwind</code> ไปที่ <code>/wp-content/plugins/</code> แล้วเปิดใช้งาน</li>
<li>ถ้าเคยใช้ WindPress: ไปที่ <strong>InsightX Tailwind → ไฟล์ CSS</strong> กดปุ่มนำเข้าจาก WindPress แล้วปิด WindPress</li>
<li>กด <strong>บันทึกและ Build</strong> หนึ่งครั้ง แล้วใช้ <strong>ตรวจหน้าเว็บ</strong> ในเมนู Build และ Cache เพื่อเช็กว่าไม่มี class ขาด</li>
</ol>
<p><strong>สำคัญ:</strong> ถ้าเว็บสร้างด้วย Common Block ของ WindPress อย่าปิดปลั๊กอินนี้โดยไม่มีตัวแทน เนื้อหาจะไม่แสดง</p>
HTML,
                'changelog'    => self::changelog(true),
                'faq'          => <<<'HTML'
<h4>ต้องติดตั้ง Node.js ไหม?</h4>
<p>ไม่ต้อง Tailwind compile ใน browser ของผู้ดูแลตอนกด Build แล้วเก็บเป็นไฟล์ CSS ใน uploads</p>
<h4>ทำไม class ใหม่ไม่ขึ้นที่หน้าเว็บ?</h4>
<p>ต้อง build ใหม่หลังเพิ่ม class (Gutenberg ทำให้อัตโนมัติ) ถ้ายังไม่ขึ้น ใช้ตรวจหน้าเว็บเพื่อดูว่า class เก็บอยู่ในที่ที่ยังไม่ได้เปิดสแกน</p>
<h4>ใช้กับ Elementor ได้ไหม?</h4>
<p>ได้ มี live preview และ autocomplete ในช่อง CSS Classes</p>
HTML,
            ];
        }

        return [
            'description'  => <<<'HTML'
<p><strong>InsightX Tailwind</strong> brings Tailwind CSS 4.3 to WordPress, on the frontend and in the editor. It compiles in the browser and serves visitors a single static CSS file: no Node.js on the server. A drop-in replacement for WindPress.</p>
<h4>Utilities that beat the theme</h4>
<ul>
<li><strong>Unlayered utilities</strong>, printed last in &lt;head&gt;, so classes like <code>text-white</code> override theme CSS.</li>
<li><strong>Multiple files</strong>: main.css plus imported files, edited with syntax highlighting.</li>
<li><strong>Import from WindPress</strong> in one click.</li>
</ul>
<h4>Gutenberg</h4>
<ul>
<li><strong>Live preview</strong> of class changes in the canvas.</li>
<li><strong>Frontend CSS in the editor</strong>, so blocks look the same as on the site.</li>
<li><strong>Tailwind classes panel</strong>: autocomplete, sorting and generated CSS.</li>
<li><strong>Common Block</strong>: a generic HTML element block, compatible with content built with WindPress.</li>
<li><strong>theme.json</strong>: @theme colors and fonts in the Gutenberg palette.</li>
</ul>
<h4>Public source scanning</h4>
<ul>
<li>Published posts and pages, theme files, selected plugins, published menus and Elementor. ACF fields and widget/theme options require an explicit public allowlist.</li>
<li><strong>Check pages</strong> opens every published page and lists missing classes.</li>
<li>Rebuilds automatically after saving in Gutenberg.</li>
</ul>
HTML,
            'installation' => <<<'HTML'
<ol>
<li>Upload the <code>insightx-tailwind</code> folder to <code>/wp-content/plugins/</code> and activate it.</li>
<li>Coming from WindPress: open <strong>InsightX Tailwind → CSS files</strong>, click Import from WindPress, then deactivate WindPress.</li>
<li>Click <strong>Save &amp; Build</strong> once, then run <strong>Check pages</strong> under Build &amp; cache.</li>
</ol>
<p><strong>Important:</strong> if the site is built with WindPress's Common Block, don't deactivate this plugin without a replacement, or that content won't render.</p>
HTML,
            'changelog'    => self::changelog(false),
            'faq'          => <<<'HTML'
<h4>Do I need Node.js?</h4>
<p>No. Tailwind compiles in the admin's browser on Build and the result is stored as a CSS file in uploads.</p>
<h4>A new class doesn't show on the site. Why?</h4>
<p>Rebuild after adding classes (Gutenberg does it for you). If it's still missing, run Check pages to find content stored in a source that isn't scanned yet.</p>
<h4>Does it work with Elementor?</h4>
<p>Yes: live preview and autocomplete in the CSS Classes field.</p>
HTML,
        ];
    }

    private static function changelog(bool $th): string
    {
        $entries = [
            '0.1.3' => [
                'preview ใน Widgets editor ตรงกับหน้าเว็บ และสแกน class จาก Widget ที่ใช้งานอยู่' => 'Widgets editor preview now matches the frontend, and classes in active widgets are scanned.',
            ],
            '0.1.2' => [
                'ลบลิงก์ “ดูรายละเอียด” ที่ซ้ำในหน้าปลั๊กอิน' => 'Removed the duplicate View details link on the Plugins screen.',
            ],
            '0.1.1' => [
                'เพิ่มคู่มือภาษาไทยแบบหัวข้อพับได้ในหน้าแอดมิน' => 'Added an accordion-style Thai manual in the admin screen.',
                'แจ้งเมื่อมี Tailwind CSS เวอร์ชันใหม่กว่าเวอร์ชันที่ปลั๊กอินใช้' => 'Shows a notice when a newer Tailwind CSS release is available.',
                'เพิ่มการกรอง URL และ SVG ใน Common Block และจำกัดแหล่งสแกนของ CSS สาธารณะ' => 'Hardened Common Block URL and SVG handling, and restricted sources used for public CSS.',
            ],
            '0.1.0' => [
                'เวอร์ชันแรก: Tailwind CSS 4.3 compile ใน browser เก็บเป็นไฟล์ CSS ไฟล์เดียว และ utilities ชนะ CSS ของธีม' => 'First release: Tailwind CSS 4.3 compiled in the browser into one static CSS file, with utilities that beat the theme.',
                'หลายไฟล์ CSS, CSS เฉพาะหน้า และนำเข้าจาก WindPress' => 'Multiple CSS files, per-page CSS and import from WindPress.',
                'Gutenberg: live preview, CSS ของหน้าเว็บจริงใน editor, แผง Tailwind classes, theme.json และ Common Block' => 'Gutenberg: live preview, frontend CSS in the editor, Tailwind classes panel, theme.json and Common Block.',
                'Elementor: live preview และ autocomplete' => 'Elementor: live preview and autocomplete.',
                'สแกนเนื้อหา ธีม ปลั๊กอิน ACF Widget และตรวจหน้าเว็บ' => 'Scanning of content, theme, plugins, ACF and widgets, plus Check pages.',
                'อัปเดตอัตโนมัติจาก GitHub Releases' => 'Automatic updates from GitHub Releases.',
            ],
        ];
        $html = '';
        foreach ($entries as $version => $items) {
            $html .= '<h4>' . esc_html($version) . '</h4><ul>';
            foreach ($items as $thText => $enText) {
                $html .= '<li>' . esc_html($th ? $thText : $enText) . '</li>';
            }
            $html .= '</ul>';
        }
        return $html;
    }
}
