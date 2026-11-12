<?php
/**
 * Self-check for CommonBlock::render() without WordPress: php tests/common-block-render.php
 */
declare(strict_types=1);

define('ABSPATH', __DIR__);
// WordPress esc_attr() preserves existing entities instead of double-encoding them.
function esc_attr(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8', false); }
require __DIR__ . '/../src/Integration/CommonBlock.php';

use InsightX\Tailwind\Integration\CommonBlock;

$cases = [
    'container with class + align' => [['tagName' => 'section', 'className' => 'p-4', 'align' => 'full'], '<b>x</b>', '<section class="p-4 alignfull"><b>x</b></section>'],
    'text content keeps markup' => [['tagName' => 'p', 'contentType' => 'text', 'content' => '<span class="a"></span> A &amp; B'], '', '<p><span class="a"></span> A &amp; B</p>'],
    'text node' => [['tagName' => 'cb-text-node', 'contentType' => 'text', 'content' => 'สวัสดี'], '', 'สวัสดี'],
    'void element, boolean attr' => [['tagName' => 'input', 'globalAttrs' => ['type' => 'checkbox', 'checked' => '']], '', '<input type="checkbox" checked>'],
    'self closing br' => [['tagName' => 'br', 'selfClosing' => true], '', '<br>'],
    'drops event handlers and javascript: urls' => [['tagName' => 'a', 'globalAttrs' => ['href' => ' JavaScript:alert(1)', 'onclick' => 'x()', 'aria-label' => 'Go "now"']], '', '<a aria-label="Go &quot;now&quot;"></a>'],
    'drops entity encoded javascript URL' => [['tagName' => 'a', 'globalAttrs' => ['href' => 'java&#x73;cript:alert(1)']], '', '<a></a>'],
    'drops double encoded javascript URL' => [['tagName' => 'a', 'globalAttrs' => ['href' => 'java&amp;#x73;cript:alert(1)']], '', '<a></a>'],
    'keeps ordinary HTTPS URL' => [['tagName' => 'a', 'globalAttrs' => ['href' => 'https://example.org/help']], '', '<a href="https://example.org/help"></a>'],
    'drops SVG animation attributes' => [['tagName' => 'svg', 'globalAttrs' => ['attributeName' => 'href', 'to' => 'javascript:alert(1)', 'values' => 'x;y']], '', '<svg></svg>'],
    'blocks SVG animation tag' => [['tagName' => 'animate', 'globalAttrs' => ['attributeName' => 'href', 'to' => 'javascript:alert(1)']], '', '<div></div>'],
    'drops srcset URLs' => [['tagName' => 'img', 'globalAttrs' => ['srcset' => 'javascript:alert(1) 1x']], '', '<img>'],
    'blocked tag becomes div' => [['tagName' => 'script', 'contentType' => 'html', 'content' => 'x'], '', '<div>x</div>'],
    'class attr merges' => [['tagName' => 'div', 'className' => 'a', 'globalAttrs' => ['class' => 'b', 'id' => 'i']], '', '<div class="a b" id="i"></div>'],
    'escapes attribute values' => [['tagName' => 'img', 'globalAttrs' => ['alt' => '"><script>', 'src' => 'data:image/png;base64,AA']], '', '<img alt="&quot;&gt;&lt;script&gt;" src="data:image/png;base64,AA">'],
];

$failed = 0;
foreach ($cases as $name => [$attrs, $content, $expected]) {
    $got = CommonBlock::render($attrs, $content);
    if ($got !== $expected) {
        $failed++;
        echo "FAIL {$name}\n  expected: {$expected}\n  got:      {$got}\n";
    }
}
echo $failed === 0 ? 'OK ' . count($cases) . " cases\n" : "{$failed} failed\n";
exit($failed === 0 ? 0 : 1);
