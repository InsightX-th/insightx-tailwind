<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

/**
 * Enqueues Vite entries from dist/ as ES modules and prints
 * `window.insightxTailwind` (typed in app/src/config.ts).
 */
final class Assets
{
    private const PREFIX = 'insightx-tailwind-';

    public static function register_hooks(): void
    {
        add_filter('script_loader_tag', [self::class, 'module_tag'], 10, 2);
    }

    /** @param list<string> $deps */
    public static function register(string $entry, array $deps = []): string
    {
        $handle = self::PREFIX . $entry;
        if (!wp_script_is($handle, 'registered')) {
            $file = INSIGHTX_TAILWIND_DIR . "/dist/{$entry}.js";
            wp_register_script(
                $handle,
                plugins_url("dist/{$entry}.js", INSIGHTX_TAILWIND_FILE),
                $deps,
                file_exists($file) ? (string) filemtime($file) : null,
                false
            );
            wp_add_inline_script($handle, 'window.insightxTailwind = ' . wp_json_encode(self::config()) . ';', 'before');
        }
        return $handle;
    }

    /** @param list<string> $deps */
    public static function enqueue(string $entry, array $deps = []): string
    {
        $handle = self::register($entry, $deps);
        wp_enqueue_script($handle);
        return $handle;
    }

    public static function module_tag(string $tag, string $handle): string
    {
        if (strpos($handle, self::PREFIX) !== 0) {
            return $tag;
        }
        // Only the external tag becomes a module; the inline "before" config script stays classic.
        return (string) preg_replace('#<script(?![^>]*\btype=)([^>]*\bsrc=)#', '<script type="module"$1', $tag);
    }

    /** @return list<string> page CSS files attached to the post being edited (editor canvas). */
    private static function current_page_files(): array
    {
        $post = is_admin() ? get_post() : null;
        return $post instanceof \WP_Post ? PageCss::files_for($post->ID) : [];
    }

    /** Page whose <head> styles the editor canvas copies: the post being edited if public, else home. */
    private static function front_url(): string
    {
        $post = get_post();
        if ($post instanceof \WP_Post && $post->post_status === 'publish' && is_post_type_viewable($post->post_type)) {
            return (string) get_permalink($post);
        }
        return home_url('/');
    }

    /** @return array<string, mixed> */
    private static function config(): array
    {
        $config = [
            // Object, not list: an empty volume must still be `{}` in JS.
            'files'   => (object) Volume::all(),
            'restUrl' => esc_url_raw(rest_url(Rest::NAMESPACE . '/')),
            'nonce'   => wp_create_nonce('wp_rest'),
            'i18n'    => (object) I18n::strings(),
            'mirrorFrontend' => Settings::get()['mirror_frontend'],
            'frontUrl' => self::front_url(),
            'pageFiles' => self::current_page_files(),
            'themeUrls' => array_values(array_unique([trailingslashit(get_stylesheet_directory_uri()), trailingslashit(get_template_directory_uri())])),
        ];

        if (current_user_can('manage_options')) {
            $settings = Settings::get();
            $sources = [];
            foreach (Scanner::available_sources() as $id => $label) {
                $sources[] = ['id' => $id, 'label' => $label];
            }
            $plugins = [];
            foreach (Settings::installed_plugins() as $file => $name) {
                $plugins[] = ['file' => $file, 'name' => $name];
            }
            $config += [
                'canBuild'       => true,
                'sources'        => $sources,
                'enabledSources' => $settings['sources'],
                'plugins'        => $plugins,
                'enabledPlugins' => $settings['plugins'],
                'themeJson'      => $settings['theme_json'],
                'stale'          => Settings::is_stale(),
                'cache'          => Cache::info(),
                'hasWindpress'   => is_dir(Volume::windpress_dir()),
                'version'        => Plugin::VERSION,
                'manualUrl'      => plugins_url('docs/manual-th.html', INSIGHTX_TAILWIND_FILE),
                'pageFileOptions' => PageCss::page_files(),
                'globalFiles'    => PageCss::global_files(),
                'pageAssignments' => (object) PageCss::assignments(),
                'dataPath'       => ltrim(str_replace(wp_normalize_path(ABSPATH), '', wp_normalize_path(Volume::dir())), '/'),
            ];
        }

        return $config;
    }
}
