<?php

declare(strict_types=1);

namespace InsightX\Tailwind\Integration;

use InsightX\Tailwind\Cache;

/** Adds @theme colors/fonts (captured at build time) to the theme's presets. */
final class ThemeJson
{
    public static function register_hooks(): void
    {
        add_filter('wp_theme_json_data_theme', [self::class, 'merge']);
    }

    /**
     * @param \WP_Theme_JSON_Data $theme_json
     * @return \WP_Theme_JSON_Data
     */
    public static function merge($theme_json)
    {
        $preset = Cache::theme_preset();
        if ($preset['palette'] === [] && $preset['fontFamilies'] === []) {
            return $theme_json;
        }

        $data = $theme_json->get_data();
        $settings = [];
        if ($preset['palette'] !== []) {
            $settings['color']['palette'] = array_merge(self::list_at($data, ['settings', 'color', 'palette']), $preset['palette']);
        }
        if ($preset['fontFamilies'] !== []) {
            $settings['typography']['fontFamilies'] = array_merge(self::list_at($data, ['settings', 'typography', 'fontFamilies']), $preset['fontFamilies']);
        }
        return $theme_json->update_with(['version' => 3, 'settings' => $settings]);
    }

    /**
     * @param array<string, mixed> $data
     * @param list<string> $path
     * @return list<mixed>
     */
    private static function list_at(array $data, array $path): array
    {
        foreach ($path as $key) {
            if (!is_array($data) || !isset($data[$key])) {
                return [];
            }
            $data = $data[$key];
        }
        return is_array($data) ? array_values($data) : [];
    }
}
