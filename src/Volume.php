<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

/**
 * User CSS files (main.css + anything it imports), stored flat in
 * uploads/insightx-tailwind/data/. Compiled in the browser, never executed.
 */
final class Volume
{
    private const NAME_PATTERN = '/^[a-z0-9][a-z0-9._-]{0,63}\.css$/i';
    private const MAX_TOTAL_BYTES = 1024 * 1024;

    public static function dir(): string
    {
        return trailingslashit(wp_upload_dir(null, false)['basedir']) . 'insightx-tailwind/data';
    }

    public static function is_valid_name(string $name): bool
    {
        return (bool) preg_match(self::NAME_PATTERN, $name);
    }

    /** @return array<string, string> name => content */
    public static function all(): array
    {
        return self::read_dir(self::dir());
    }

    /**
     * Replace the whole volume with $files (files not listed are deleted).
     *
     * @param array<mixed, mixed> $files
     * @return true|\WP_Error
     */
    public static function save(array $files)
    {
        $clean = [];
        $total = 0;
        foreach ($files as $name => $content) {
            $name = (string) $name;
            if (!self::is_valid_name($name) || !is_string($content)) {
                return new \WP_Error('insightx_tailwind_bad_file', sprintf(
                    /* translators: %s: file name */
                    __('Invalid file name: %s (use letters, numbers, dot, dash; must end with .css)', 'insightx-tailwind'),
                    $name
                ), ['status' => 400]);
            }
            $total += strlen($content);
            $clean[$name] = $content;
        }
        if ($total > self::MAX_TOTAL_BYTES) {
            return new \WP_Error('insightx_tailwind_too_large', __('CSS files exceed 1 MB in total.', 'insightx-tailwind'), ['status' => 413]);
        }
        if (!wp_mkdir_p(self::dir())) {
            return new \WP_Error('insightx_tailwind_write_failed', __('Could not create the data folder in uploads/.', 'insightx-tailwind'), ['status' => 500]);
        }

        foreach (array_diff(array_keys(self::all()), array_keys($clean)) as $removed) {
            wp_delete_file(self::dir() . '/' . $removed);
        }
        foreach ($clean as $name => $content) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- local data file
            if (file_put_contents(self::dir() . '/' . $name, $content, LOCK_EX) === false) {
                return new \WP_Error('insightx_tailwind_write_failed', __('Could not write CSS files.', 'insightx-tailwind'), ['status' => 500]);
            }
        }
        return true;
    }

    public static function windpress_dir(): string
    {
        return trailingslashit(wp_upload_dir(null, false)['basedir']) . 'windpress/data';
    }

    /** @return array<string, string> WindPress volume files (flat .css only) */
    public static function windpress_files(): array
    {
        return self::read_dir(self::windpress_dir());
    }

    /** @return array<string, string> */
    private static function read_dir(string $dir): array
    {
        $files = [];
        foreach (glob($dir . '/*.css') ?: [] as $path) {
            $name = basename($path);
            if (self::is_valid_name($name) && is_file($path)) {
                // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local file
                $content = file_get_contents($path);
                if ($content !== false) {
                    $files[$name] = $content;
                }
            }
        }
        ksort($files);
        return $files;
    }
}
