<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

final class Frontend
{
    public static function register_hooks(): void
    {
        // Print as late as possible so unlayered utilities win over the theme by source order.
        add_action('wp_head', [self::class, 'print_css'], PHP_INT_MAX);
    }

    public static function print_css(): void
    {
        // A page with its own CSS files gets its own bundle (main.css + those files).
        $page = PageCss::current();
        if ($page !== null) {
            wp_register_style('insightx-tailwind', $page['url'], [], (string) $page['time']);
            wp_print_styles('insightx-tailwind');
            return;
        }

        $info = Cache::info();
        if ($info !== null) {
            wp_register_style('insightx-tailwind', $info['url'], [], (string) $info['time']);
            wp_print_styles('insightx-tailwind');
            return;
        }

        // No cache yet: compile live, but only for admins (the compiler is ~85 KB gzip).
        // ponytail: visitors get nothing until the first build; add a runtime-for-all toggle if needed.
        if (current_user_can('manage_options')) {
            wp_print_scripts(Assets::enqueue('runtime'));
        }
    }
}
