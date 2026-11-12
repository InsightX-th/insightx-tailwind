<?php

declare(strict_types=1);

namespace InsightX\Tailwind\Integration;

use InsightX\Tailwind\Assets;
use InsightX\Tailwind\Settings;

final class Gutenberg
{
    public static function register_hooks(): void
    {
        // Sidebar panel + autocomplete, in the editor's top window.
        add_action('enqueue_block_editor_assets', static function (): void {
            Assets::enqueue('gutenberg', ['wp-hooks', 'wp-element', 'wp-compose', 'wp-block-editor', 'wp-components', 'wp-data']);
            $css = INSIGHTX_TAILWIND_DIR . '/assets/editor-sidebar.css';
            wp_enqueue_style('insightx-tailwind-editor-sidebar', plugins_url('assets/editor-sidebar.css', INSIGHTX_TAILWIND_FILE), ['wp-components'], (string) filemtime($css));
        });

        // The canvas copies the real frontend CSS (app/src/mirror.ts), so the theme's
        // editor-only stylesheet (add_editor_style) would only fight it. Empty it rather
        // than remove it: with no theme styles the editor falls back to its default
        // editor styles (body { font-size: 18px; … }).
        add_filter('block_editor_settings_all', static function (array $settings): array {
            if (Settings::get()['mirror_frontend'] && isset($settings['styles']) && is_array($settings['styles'])) {
                foreach ($settings['styles'] as $i => $style) {
                    if (is_array($style) && ($style['__unstableType'] ?? '') === 'theme') {
                        $settings['styles'][$i]['css'] = '';
                    }
                }
            }
            return $settings;
        });

        // Live compiler inside the canvas iframe (WP copies enqueue_block_assets into it).
        add_action('enqueue_block_assets', static function (): void {
            if (is_admin()) {
                Assets::enqueue('runtime');
                $css = INSIGHTX_TAILWIND_DIR . '/assets/editor-canvas.css';
                wp_enqueue_style('insightx-tailwind-editor-canvas', plugins_url('assets/editor-canvas.css', INSIGHTX_TAILWIND_FILE), [], (string) filemtime($css));
            }
        });
    }
}
