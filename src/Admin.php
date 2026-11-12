<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

final class Admin
{
    public const PAGE = 'insightx-tailwind';

    public static function register_hooks(): void
    {
        add_action('admin_menu', [self::class, 'menu']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueue']);
        add_action('admin_notices', [self::class, 'stale_notice']);
        add_action('save_post', [self::class, 'mark_stale'], 10, 2);
        // Widgets and theme mods (Customizer/Kirki) are scanned too (Scanner::site()).
        add_action('updated_option', [self::class, 'mark_stale_on_option']);
        add_action('added_option', [self::class, 'mark_stale_on_option']);
        add_filter('plugin_action_links_' . plugin_basename(INSIGHTX_TAILWIND_FILE), [self::class, 'action_links']);
    }

    public static function menu(): void
    {
        add_menu_page(
            __('InsightX Tailwind', 'insightx-tailwind'),
            __('InsightX Tailwind', 'insightx-tailwind'),
            'manage_options',
            self::PAGE,
            static function (): void {
                echo '<div id="insightx-tailwind-app"></div>';
            },
            'dashicons-art',
            81
        );
    }

    public static function enqueue(string $hook): void
    {
        if ($hook !== 'toplevel_page_' . self::PAGE) {
            return;
        }
        Assets::enqueue('admin');
        // Full-height app shell: drop the admin footer and content padding on this screen only.
        add_filter('admin_footer_text', '__return_empty_string', 99);
        add_filter('update_footer', '__return_empty_string', 99);
        add_filter('admin_body_class', static fn(string $classes): string => $classes . ' ixt-app-screen');
        $css = INSIGHTX_TAILWIND_DIR . '/dist/assets/admin.css';
        wp_enqueue_style('insightx-tailwind-admin', plugins_url('dist/assets/admin.css', INSIGHTX_TAILWIND_FILE), [], file_exists($css) ? (string) filemtime($css) : null);
    }

    /** Server can't compile Tailwind, so content changes only flag the cache as stale. */
    public static function mark_stale(int $post_id, \WP_Post $post): void
    {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id) || $post->post_status === 'auto-draft') {
            return;
        }
        Settings::set_stale(true);
    }

    public static function mark_stale_on_option(string $option): void
    {
        if (strpos($option, 'widget_') === 0 || strpos($option, 'theme_mods_') === 0) {
            Settings::set_stale(true);
        }
    }

    public static function stale_notice(): void
    {
        $screen = get_current_screen();
        if (!Settings::is_stale() || !current_user_can('manage_options') || ($screen && ($screen->id === 'toplevel_page_' . self::PAGE || $screen->is_block_editor()))) {
            return;
        }
        printf(
            '<div class="notice notice-warning"><p>%s <a href="%s">%s</a></p></div>',
            esc_html__('Tailwind CSS is out of date: content changed since the last build.', 'insightx-tailwind'),
            esc_url(admin_url('admin.php?page=' . self::PAGE)),
            esc_html__('Rebuild now', 'insightx-tailwind')
        );
    }

    /**
     * @param array<int|string, string> $links
     * @return array<int|string, string>
     */
    public static function action_links(array $links): array
    {
        array_unshift($links, sprintf('<a href="%s">%s</a>', esc_url(admin_url('admin.php?page=' . self::PAGE)), esc_html__('Settings', 'insightx-tailwind')));
        return $links;
    }
}
