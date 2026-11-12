<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

final class Cache
{
    private const CSS_FILE = 'cache.css';
    private const THEME_FILE = 'theme.json';
    /** Hard cap so a bad client can't fill the disk. */
    public const MAX_BYTES = 5 * 1024 * 1024;

    private static function dir(): string
    {
        return trailingslashit(wp_upload_dir(null, false)['basedir']) . 'insightx-tailwind';
    }

    public static function path(): string
    {
        return self::dir() . '/' . self::CSS_FILE;
    }

    public static function exists(): bool
    {
        return is_readable(self::path());
    }

    public static function url(): string
    {
        $url = trailingslashit(wp_upload_dir(null, false)['baseurl']) . 'insightx-tailwind/' . self::CSS_FILE;
        return set_url_scheme($url);
    }

    /** @return array{url: string, time: int, size: int}|null */
    public static function info(): ?array
    {
        if (!self::exists()) {
            return null;
        }
        clearstatcache(true, self::path());
        return ['url' => self::url(), 'time' => (int) filemtime(self::path()), 'size' => (int) filesize(self::path())];
    }

    /** @param array{palette: list<array<string, string>>, fontFamilies: list<array<string, string>>} $theme */
    public static function write(string $css, array $theme): bool
    {
        if (!wp_mkdir_p(self::dir())) {
            return false;
        }
        // phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- local cache files
        return file_put_contents(self::path(), $css, LOCK_EX) !== false
            && file_put_contents(self::dir() . '/' . self::THEME_FILE, (string) wp_json_encode($theme), LOCK_EX) !== false;
        // phpcs:enable
    }

    /** @return array{palette: list<array<string, string>>, fontFamilies: list<array<string, string>>} */
    public static function theme_preset(): array
    {
        static $preset = null;
        if ($preset === null) {
            $path = self::dir() . '/' . self::THEME_FILE;
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local file
            $data = is_readable($path) ? json_decode((string) file_get_contents($path), true) : null;
            $preset = [
                'palette'      => is_array($data['palette'] ?? null) ? $data['palette'] : [],
                'fontFamilies' => is_array($data['fontFamilies'] ?? null) ? $data['fontFamilies'] : [],
            ];
        }
        return $preset;
    }

    /**
     * Keep only well-formed preset entries; values end up in inline CSS custom properties.
     *
     * @param mixed $theme
     * @return array{palette: list<array<string, string>>, fontFamilies: list<array<string, string>>}
     */
    public static function sanitize_theme($theme): array
    {
        $clean = ['palette' => [], 'fontFamilies' => []];
        $safe = static fn($v): bool => is_string($v) && $v !== '' && strlen($v) < 300 && !preg_match('/[;{}<>]/', $v);
        foreach (['palette' => 'color', 'fontFamilies' => 'fontFamily'] as $key => $field) {
            foreach ((is_array($theme) && is_array($theme[$key] ?? null)) ? $theme[$key] : [] as $item) {
                if (is_array($item) && $safe($item['name'] ?? null) && $safe($item[$field] ?? null) && is_string($item['slug'] ?? null)) {
                    $clean[$key][] = ['name' => $item['name'], 'slug' => sanitize_title($item['slug']), $field => $item[$field]];
                }
            }
        }
        return $clean;
    }
}
