<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

final class Rest
{
    public const NAMESPACE = 'insightx-tailwind/v1';

    public static function register_hooks(): void
    {
        add_action('rest_api_init', [self::class, 'routes']);
    }

    public static function routes(): void
    {
        $admin = static fn(): bool => current_user_can('manage_options');

        register_rest_route(self::NAMESPACE, '/tailwind-version', [
            'methods'             => 'GET',
            'permission_callback' => $admin,
            'callback'            => static fn() => rest_ensure_response(['latest' => TailwindVersion::latest()]),
        ]);

        register_rest_route(self::NAMESPACE, '/scan', [
            'methods'             => 'GET',
            'permission_callback' => $admin,
            'args'                => [
                'source' => ['type' => 'string', 'required' => true, 'enum' => array_keys(Scanner::available_sources())],
                'page'   => ['type' => 'integer', 'default' => 1, 'minimum' => 1],
            ],
            'callback'            => static fn(\WP_REST_Request $r) => rest_ensure_response(
                Scanner::scan((string) $r['source'], (int) $r['page'])
            ),
        ]);

        register_rest_route(self::NAMESPACE, '/cache', [
            'methods'             => 'POST',
            'permission_callback' => $admin,
            'args'                => [
                'css'   => ['type' => 'string', 'required' => true],
                'theme' => ['type' => 'object', 'default' => []],
            ],
            'callback'            => [self::class, 'write_cache'],
        ]);

        register_rest_route(self::NAMESPACE, '/settings', [
            'methods'             => 'POST',
            'permission_callback' => $admin,
            'args'                => [
                'files'      => ['type' => 'object', 'required' => true],
                'sources'    => ['type' => 'array', 'items' => ['type' => 'string'], 'default' => []],
                'plugins'    => ['type' => 'array', 'items' => ['type' => 'string'], 'default' => []],
                'theme_json' => ['type' => 'string', 'enum' => Settings::THEME_JSON_MODES, 'default' => 'custom'],
                'mirror_frontend' => ['type' => 'boolean', 'default' => true],
            ],
            'callback'            => static function (\WP_REST_Request $r) {
                $saved = Volume::save((array) $r['files']);
                if (is_wp_error($saved)) {
                    return $saved;
                }
                Settings::save($r['sources'], $r['plugins'], (string) $r['theme_json'], (bool) $r['mirror_frontend']);
                Settings::set_stale(true);
                return rest_ensure_response(Settings::get());
            },
        ]);

        register_rest_route(self::NAMESPACE, '/pages', [
            'methods'             => 'GET',
            'permission_callback' => $admin,
            'callback'            => [self::class, 'pages'],
        ]);

        register_rest_route(self::NAMESPACE, '/page-css', [
            'methods'             => 'GET',
            'permission_callback' => $admin,
            'callback'            => static fn() => rest_ensure_response((object) PageCss::assignments()),
        ]);

        register_rest_route(self::NAMESPACE, '/page-cache', [
            'methods'             => 'POST',
            'permission_callback' => $admin,
            'args'                => [
                'post_id' => ['type' => 'integer', 'required' => true, 'minimum' => 1],
                'css'     => ['type' => 'string', 'required' => true],
            ],
            'callback'            => static function (\WP_REST_Request $r) {
                $id = (int) $r['post_id'];
                $css = (string) $r['css'];
                if (get_post($id) === null || PageCss::files_for($id) === []) {
                    return new \WP_Error('insightx_tailwind_no_page_css', 'This post has no page CSS files.', ['status' => 400]);
                }
                if (strlen($css) > Cache::MAX_BYTES) {
                    return new \WP_Error('insightx_tailwind_too_large', __('CSS exceeds 5 MB.', 'insightx-tailwind'), ['status' => 413]);
                }
                if (!PageCss::write($id, $css)) {
                    return new \WP_Error('insightx_tailwind_write_failed', __('Could not write the cache file in uploads/.', 'insightx-tailwind'), ['status' => 500]);
                }
                return rest_ensure_response(['url' => PageCss::url($id)]);
            },
        ]);

        register_rest_route(self::NAMESPACE, '/windpress', [
            'methods'             => 'GET',
            'permission_callback' => $admin,
            'callback'            => static fn() => rest_ensure_response(['files' => (object) Volume::windpress_files()]),
        ]);
    }

    /**
     * Published URLs for the page audit (front page first).
     * ponytail: capped at 200; page it if the audit needs to cover bigger sites.
     */
    public static function pages(): \WP_REST_Response
    {
        $front = (int) get_option('page_on_front');
        $pages = [['url' => home_url('/'), 'title' => get_bloginfo('name'), 'css' => self::css_url_for($front), 'files' => $front > 0 ? PageCss::files_for($front) : []]];
        $posts = get_posts([
            'post_type'   => array_values(get_post_types(['public' => true])),
            'post_status' => 'publish',
            'numberposts' => 200,
            'orderby'     => 'menu_order date',
        ]);
        foreach ($posts as $post) {
            $url = get_permalink($post);
            if ($url && $url !== home_url('/') && $post->post_type !== 'attachment') {
                $pages[] = ['url' => $url, 'title' => get_the_title($post), 'css' => self::css_url_for($post->ID), 'files' => PageCss::files_for($post->ID)];
            }
        }
        return rest_ensure_response($pages);
    }

    /** CSS file a post is served with: its page bundle, or the global cache. */
    private static function css_url_for(int $post_id): string
    {
        if ($post_id > 0 && PageCss::files_for($post_id) !== [] && is_readable(PageCss::path($post_id))) {
            return PageCss::url($post_id);
        }
        return Cache::url();
    }

    /** @return \WP_REST_Response|\WP_Error */
    public static function write_cache(\WP_REST_Request $r)
    {
        $css = (string) $r['css'];
        if (strlen($css) > Cache::MAX_BYTES) {
            return new \WP_Error('insightx_tailwind_too_large', __('CSS exceeds 5 MB.', 'insightx-tailwind'), ['status' => 413]);
        }
        if (!Cache::write($css, Cache::sanitize_theme($r['theme']))) {
            return new \WP_Error('insightx_tailwind_write_failed', __('Could not write the cache file in uploads/.', 'insightx-tailwind'), ['status' => 500]);
        }
        Settings::set_stale(false);
        PageCss::prune();
        return rest_ensure_response(Cache::info());
    }
}
