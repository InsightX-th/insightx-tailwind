<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

final class Plugin
{
    public const VERSION = '0.1.6';

    public static function boot(): void
    {
        add_action('init', static function (): void {
            load_plugin_textdomain('insightx-tailwind', false, dirname(plugin_basename(INSIGHTX_TAILWIND_FILE)) . '/languages');
        });
        Assets::register_hooks();
        Scanner::register_hooks();
        Frontend::register_hooks();
        Admin::register_hooks();
        Rest::register_hooks();
        Integration\Gutenberg::register_hooks();
        Integration\Elementor::register_hooks();
        Integration\ThemeJson::register_hooks();
        Integration\CommonBlock::register_hooks();
        PluginInfo::register_hooks();
        Updater::boot();
        PageCss::register_hooks();
    }
}
