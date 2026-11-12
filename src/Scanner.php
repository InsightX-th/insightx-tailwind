<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

/**
 * Collects raw text that may contain class names. The browser does the
 * candidate extraction + compile; this only pages through the sources.
 */
final class Scanner
{
    private const POSTS_PER_PAGE = 50;
    private const FILES_PER_PAGE = 50;
    private const ROWS_PER_PAGE = 500;
    private const MAX_FILE_BYTES = 512 * 1024;
    private const FILE_EXTENSIONS = ['php', 'html', 'js', 'twig', 'json'];
    private const SKIP_DIRS = ['node_modules', 'vendor', '.git', 'dist-dev'];

    /** Only content from publicly viewable post types may contribute to public CSS. */
    private static function public_post_types(): array
    {
        return array_values(array_diff(array_keys(get_post_types(['public' => true, 'show_in_rest' => true])), ['attachment']));
    }

    /** @return list<string> ACF keys explicitly marked safe to expose through public CSS. */
    private static function public_meta_keys(): array
    {
        $approved = apply_filters('insightx_tailwind_public_scan_meta_keys', []);
        if (!is_array($approved)) {
            return [];
        }
        $keys = array_filter($approved, static fn($name): bool => is_string($name)
            && preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,190}$/', $name) === 1);
        return array_values(array_slice(array_unique($keys), 0, 50));
    }

    /** @return array<string, string> source id => label */
    public static function available_sources(): array
    {
        $sources = [
            'posts'   => __('Post content (posts, pages, templates, patterns)', 'insightx-tailwind'),
            'theme'   => __('Theme files (active theme + parent)', 'insightx-tailwind'),
            'plugins' => __('Plugin files (choose below)', 'insightx-tailwind'),
            'site'    => __('Widgets, menus and theme settings', 'insightx-tailwind'),
        ];
        if ((class_exists('ACF') || function_exists('acf_get_field')) && self::public_meta_keys() !== []) {
            $sources['acf'] = __('ACF field values', 'insightx-tailwind');
        }
        if (did_action('elementor/loaded') || defined('ELEMENTOR_VERSION')) {
            $sources['elementor'] = __('Elementor data', 'insightx-tailwind');
        }
        return $sources;
    }

    /** @return array{contents: list<string>, has_more: bool} */
    public static function scan(string $source, int $page): array
    {
        switch ($source) {
            case 'posts':
                return self::posts($page);
            case 'theme':
                return self::files(array_unique([get_stylesheet_directory(), get_template_directory()]), $page);
            case 'plugins':
                return self::files(self::plugin_paths(), $page);
            case 'site':
                return self::site($page);
            case 'acf':
                return self::acf($page);
            case 'elementor':
                return self::meta_rows("pm.meta_key = '_elementor_data'", $page);
        }
        return ['contents' => [], 'has_more' => false];
    }

    /** @return array{contents: list<string>, has_more: bool} */
    private static function posts(int $page): array
    {
        $types = self::public_post_types();
        if ($types === []) {
            return ['contents' => [], 'has_more' => false];
        }
        $query = new \WP_Query([
            'post_type'              => $types,
            'post_status'            => 'publish',
            'has_password'           => false,
            'posts_per_page'         => self::POSTS_PER_PAGE,
            'paged'                  => $page,
            'orderby'                => 'ID',
            'order'                  => 'ASC',
            'no_found_rows'          => false,
            'update_post_meta_cache' => false,
            'update_post_term_cache' => false,
        ]);
        $contents = [];
        foreach ($query->posts as $post) {
            if ($post instanceof \WP_Post && $post->post_content !== '') {
                // Raw content: className lives in block comment JSON and in the saved HTML.
                $contents[] = $post->post_content;
            }
        }
        return ['contents' => $contents, 'has_more' => $page < (int) $query->max_num_pages];
    }

    /**
     * Published menu classes and explicitly approved public widget/theme options.
     * Site owners may add known-public option names with the
     * insightx_tailwind_public_scan_options filter. Reading every widget/theme
     * option could expose unpublished content through generated CSS.
     *
     * @return array{contents: list<string>, has_more: bool}
     */
    private static function site(int $page): array
    {
        global $wpdb;
        if ($page > 1) {
            return ['contents' => [], 'has_more' => false];
        }
        $options = [];
        $approved = apply_filters('insightx_tailwind_public_scan_options', []);
        if (is_array($approved)) {
            $approved = array_filter($approved, static fn($name): bool => is_string($name)
                && preg_match('/^(widget_[a-z0-9_-]+|theme_mods_[a-z0-9_-]+)$/', $name) === 1);
            foreach (array_slice(array_unique($approved), 0, 50) as $name) {
                $value = get_option($name, null);
                if ($value !== null) {
                    $options[] = maybe_serialize($value);
                }
            }
        }
        $menus = $wpdb->get_col("SELECT pm.meta_value FROM {$wpdb->postmeta} pm INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id WHERE pm.meta_key = '_menu_item_classes' AND p.post_status = 'publish'");
        return ['contents' => array_map('strval', array_merge($options, $menus)), 'has_more' => false];
    }

    /** @return array{contents: list<string>, has_more: bool} */
    private static function acf(int $page): array
    {
        $keys = self::public_meta_keys();
        if ($keys === []) {
            return ['contents' => [], 'has_more' => false];
        }
        $placeholders = implode(', ', array_fill(0, count($keys), '%s'));
        return self::meta_rows("pm.meta_key IN ({$placeholders}) AND pm.meta_value <> ''", $page, $keys);
    }

    /**
     * @param string $where trusted SQL fragment (constants and placeholders only)
     * @param list<string> $where_args values for placeholders in $where
     * @return array{contents: list<string>, has_more: bool}
     */
    private static function meta_rows(string $where, int $page, array $where_args = []): array
    {
        global $wpdb;
        $types = self::public_post_types();
        if ($types === []) {
            return ['contents' => [], 'has_more' => false];
        }
        $offset = ($page - 1) * self::ROWS_PER_PAGE;
        $type_placeholders = implode(', ', array_fill(0, count($types), '%s'));
        $rows = $wpdb->get_col($wpdb->prepare(
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $where is a constant fragment
            "SELECT pm.meta_value FROM {$wpdb->postmeta} pm
             INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
             WHERE {$where} AND p.post_status = 'publish' AND p.post_password = ''
             AND p.post_type IN ({$type_placeholders})
             ORDER BY pm.meta_id LIMIT %d OFFSET %d",
            ...array_merge($where_args, $types, [self::ROWS_PER_PAGE + 1, $offset])
        ));
        $has_more = count($rows) > self::ROWS_PER_PAGE;
        return [
            'contents' => array_map('strval', array_slice($rows, 0, self::ROWS_PER_PAGE)),
            'has_more' => $has_more,
        ];
    }

    /** @return list<string> absolute paths of selected plugins (dir, or file for single-file plugins) */
    private static function plugin_paths(): array
    {
        $paths = [];
        foreach (Settings::get()['plugins'] as $file) {
            // $file is already whitelisted against get_plugins() in Settings::get().
            $paths[] = dirname($file) === '.' ? WP_PLUGIN_DIR . '/' . $file : WP_PLUGIN_DIR . '/' . dirname($file);
        }
        return $paths;
    }

    /**
     * @param list<string> $roots
     * @return array{contents: list<string>, has_more: bool}
     */
    private static function files(array $roots, int $page): array
    {
        $files = [];
        foreach ($roots as $root) {
            if (is_file($root)) {
                $files[] = $root;
                continue;
            }
            if (!is_dir($root)) {
                continue;
            }
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveCallbackFilterIterator(
                    new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
                    static fn(\SplFileInfo $f): bool => $f->isDir()
                        ? !in_array($f->getFilename(), self::SKIP_DIRS, true)
                        : in_array(strtolower($f->getExtension()), self::FILE_EXTENSIONS, true) && $f->getSize() <= self::MAX_FILE_BYTES
                )
            );
            foreach ($iterator as $file) {
                $files[] = $file->getPathname();
            }
        }
        sort($files);

        // ponytail: re-walks the tree per page; cache the file list in a transient if themes get huge.
        $slice = array_slice($files, ($page - 1) * self::FILES_PER_PAGE, self::FILES_PER_PAGE);
        $contents = [];
        foreach ($slice as $path) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local file
            $content = file_get_contents($path);
            if ($content !== false) {
                $contents[] = $content;
            }
        }
        return ['contents' => $contents, 'has_more' => count($files) > $page * self::FILES_PER_PAGE];
    }
}
