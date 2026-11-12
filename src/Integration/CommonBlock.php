<?php

declare(strict_types=1);

namespace InsightX\Tailwind\Integration;

use InsightX\Tailwind\Assets;

/**
 * Drop-in for WindPress's `windpress/common-block`: one generic block that
 * renders any HTML element from its attributes. Same name + attribute schema,
 * so content built with WindPress keeps working without migration.
 */
final class CommonBlock
{
    public const NAME = 'windpress/common-block';

    private const VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];
    /** Never rendered from block attributes: they would execute or restyle the whole page. */
    private const BLOCKED_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'foreignobject', 'animate', 'animatemotion', 'animatetransform', 'set'];
    private const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'xlink:href'];
    private const BLOCKED_ATTRS = ['srcset', 'imagesrcset', 'attributename', 'from', 'to', 'by', 'values', 'begin', 'end'];

    public static function register_hooks(): void
    {
        add_action('init', [self::class, 'register']);
    }

    public static function register(): void
    {
        if (\WP_Block_Type_Registry::get_instance()->is_registered(self::NAME)) {
            return; // WindPress (or another drop-in) already provides it.
        }
        register_block_type(self::NAME, [
            'api_version'     => 3,
            'title'           => __('Common Block', 'insightx-tailwind'),
            'category'        => 'design',
            'attributes'      => [
                'tagName'     => ['type' => 'string', 'default' => 'div'],
                'contentType' => ['type' => 'string', 'default' => 'empty'],
                'content'     => ['type' => 'string', 'default' => ''],
                'selfClosing' => ['type' => 'boolean', 'default' => false],
                'globalAttrs' => ['type' => 'object', 'default' => []],
                'className'   => ['type' => 'string'],
                'align'       => ['type' => 'string'],
                'metadata'    => ['type' => 'object'],
            ],
            'supports'        => ['className' => false, 'customClassName' => true, 'align' => ['wide', 'full'], 'html' => false],
            'render_callback' => [self::class, 'render'],
            'editor_script_handles' => is_admin() ? [Assets::register('common-block', ['wp-blocks', 'wp-block-editor', 'wp-components', 'wp-element', 'wp-data'])] : [],
        ]);
    }

    /**
     * @param array<string, mixed> $attributes
     * @param \WP_Block|null $block
     */
    public static function render(array $attributes, string $content = '', $block = null): string
    {
        // Join children directly: the "\n\n" between blocks in post_content is serialization,
        // not content, and would add spaces between inline siblings (<span>a</span><span>b</span>).
        if ($block instanceof \WP_Block) {
            $content = '';
            foreach ($block->inner_blocks as $child) {
                $content .= $child->render();
            }
        }

        $tag = strtolower((string) ($attributes['tagName'] ?? 'div'));
        $type = (string) ($attributes['contentType'] ?? 'empty');
        $inner = (string) ($attributes['content'] ?? '');

        // A bare text node between siblings (e.g. "foo <br> bar").
        if ($tag === 'cb-text-node') {
            return $inner;
        }
        if (!preg_match('/^[a-z][a-z0-9-]*$/', $tag) || in_array($tag, self::BLOCKED_TAGS, true)) {
            $tag = 'div';
        }

        $html = '<' . $tag . self::attributes($attributes) . '>';
        if (!empty($attributes['selfClosing']) || in_array($tag, self::VOID_TAGS, true)) {
            return $html;
        }
        // Content is author-entered HTML, like the core Custom HTML block; $content is the rendered inner blocks.
        $body = ($type === 'text' || $type === 'html') ? $inner : '';
        return $html . $body . $content . '</' . $tag . '>';
    }

    /** @param array<string, mixed> $attributes */
    private static function attributes(array $attributes): string
    {
        $out = '';
        $classes = trim((string) ($attributes['className'] ?? ''));
        if (!empty($attributes['align']) && in_array($attributes['align'], ['wide', 'full'], true)) {
            $classes = trim($classes . ' align' . $attributes['align']);
        }

        $global = is_array($attributes['globalAttrs'] ?? null) ? $attributes['globalAttrs'] : [];
        foreach ($global as $name => $value) {
            $name = strtolower((string) $name);
            if ($name === 'class') {
                $classes = trim($classes . ' ' . (string) $value);
                continue;
            }
            if (!self::is_safe_attribute($name, $value)) {
                continue;
            }
            $out .= $value === '' || $value === true
                ? ' ' . $name
                : ' ' . $name . '="' . esc_attr((string) $value) . '"';
        }

        return ($classes !== '' ? ' class="' . esc_attr($classes) . '"' : '') . $out;
    }

    /** @param mixed $value */
    private static function is_safe_attribute(string $name, $value): bool
    {
        if (!preg_match('/^[a-z_:][a-z0-9_.:-]*$/', $name) || strpos($name, 'on') === 0 || in_array($name, self::BLOCKED_ATTRS, true)) {
            return false; // invalid name or inline event handler
        }
        if (!is_scalar($value) || $value === false) {
            return false;
        }
        if (in_array($name, self::URL_ATTRS, true)) {
            $decoded = (string) $value;
            // esc_attr() preserves existing entities; validate the URL the browser will see.
            for ($i = 0; $i < 6; $i++) {
                $next = html_entity_decode($decoded, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                if ($next === $decoded) {
                    break;
                }
                $decoded = $next;
            }
            if ($i === 6 && html_entity_decode($decoded, ENT_QUOTES | ENT_HTML5, 'UTF-8') !== $decoded) {
                return false;
            }
            $url = strtolower((string) preg_replace('/[\s\x00-\x1f\x7f]+/', '', $decoded));
            if (preg_match('/^([a-z][a-z0-9+.-]*):/', $url, $matches)) {
                if (in_array($matches[1], ['http', 'https', 'mailto', 'tel'], true)) {
                    return true;
                }
                return $matches[1] === 'data' && $name === 'src'
                    && preg_match('#^data:image/(?:png|gif|jpeg|webp|avif);base64,#', $url) === 1;
            }
        }
        return true;
    }
}
