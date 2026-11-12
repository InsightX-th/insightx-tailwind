<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

/**
 * Per-page CSS files. Files imported by main.css apply everywhere; the other
 * volume files can be attached to individual posts (post meta). Build then
 * compiles main.css + the attached files into uploads/insightx-tailwind/pages/{id}.css,
 * and the frontend serves that file instead of the global cache on those posts.
 */
final class PageCss
{
    public const META = '_ixt_css_files';

    public static function register_hooks(): void
    {
        add_action('init', [self::class, 'register_meta'], 20);
        // Attaching files changes what the page needs: flag a rebuild.
        foreach (['added_post_meta', 'updated_post_meta', 'deleted_post_meta'] as $hook) {
            add_action($hook, static function ($meta_id, $post_id, string $key): void {
                if ($key === self::META) {
                    Settings::set_stale(true);
                }
            }, 10, 3);
        }
    }

    public static function register_meta(): void
    {
        foreach (get_post_types(['show_in_rest' => true]) as $type) {
            register_post_meta($type, self::META, [
                'type'          => 'array',
                'single'        => true,
                'default'       => [],
                'show_in_rest'  => ['schema' => ['type' => 'array', 'items' => ['type' => 'string']]],
                'auth_callback' => static fn(): bool => current_user_can('edit_posts'),
                'sanitize_callback' => [self::class, 'sanitize'],
            ]);
        }
    }

    /**
     * @param mixed $value
     * @return list<string>
     */
    public static function sanitize($value): array
    {
        $value = is_array($value) ? $value : [];
        return array_values(array_unique(array_filter(array_map('strval', $value), [Volume::class, 'is_valid_name'])));
    }

    /** @return list<string> file names main.css imports (global files) */
    public static function global_files(): array
    {
        $main = Volume::all()['main.css'] ?? '';
        preg_match_all('/@import\s+(?:url\()?\s*["\']\.?\/?([a-z0-9][a-z0-9._-]*\.css)["\']/i', $main, $m);
        return array_values(array_unique($m[1]));
    }

    /** @return list<string> volume files that are not global: can be attached per page */
    public static function page_files(): array
    {
        return array_values(array_diff(array_keys(Volume::all()), array_merge(['main.css'], self::global_files())));
    }

    /** @return list<string> attached files for a post that still exist as page files */
    public static function files_for(int $post_id): array
    {
        $files = get_post_meta($post_id, self::META, true);
        return array_values(array_intersect(self::sanitize($files), self::page_files()));
    }

    /** @return array<int, array{title: string, files: list<string>}> */
    public static function assignments(): array
    {
        $ids = get_posts([
            'post_type'   => array_values(get_post_types(['show_in_rest' => true])),
            'post_status' => ['publish', 'future', 'draft', 'pending', 'private'],
            'numberposts' => -1,
            'fields'      => 'ids',
            'meta_query'  => [['key' => self::META, 'compare' => 'EXISTS']],
        ]);
        $out = [];
        foreach ($ids as $id) {
            $files = self::files_for((int) $id);
            if ($files !== []) {
                $out[(int) $id] = ['title' => get_the_title((int) $id), 'files' => $files];
            }
        }
        return $out;
    }

    private static function dir(): string
    {
        return trailingslashit(wp_upload_dir(null, false)['basedir']) . 'insightx-tailwind/pages';
    }

    public static function path(int $post_id): string
    {
        return self::dir() . '/' . $post_id . '.css';
    }

    public static function url(int $post_id): string
    {
        return set_url_scheme(trailingslashit(wp_upload_dir(null, false)['baseurl']) . 'insightx-tailwind/pages/' . $post_id . '.css');
    }

    public static function write(int $post_id, string $css): bool
    {
        if (!wp_mkdir_p(self::dir())) {
            return false;
        }
        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- local cache file
        return file_put_contents(self::path($post_id), $css, LOCK_EX) !== false;
    }

    /** Remove page caches of posts that no longer have files attached. */
    public static function prune(): void
    {
        $keep = array_keys(self::assignments());
        foreach (glob(self::dir() . '/*.css') ?: [] as $file) {
            if (!in_array((int) basename($file, '.css'), $keep, true)) {
                wp_delete_file($file);
            }
        }
    }

    /** Page cache for the current request, or null to use the global cache. */
    public static function current(): ?array
    {
        if (!is_singular()) {
            return null;
        }
        $id = (int) get_queried_object_id();
        if ($id === 0 || self::files_for($id) === [] || !is_readable(self::path($id))) {
            return null;
        }
        return ['url' => self::url($id), 'time' => (int) filemtime(self::path($id))];
    }
}
