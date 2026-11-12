<?php

declare(strict_types=1);

namespace InsightX\Tailwind\Integration;

use InsightX\Tailwind\Assets;

final class Elementor
{
    public static function register_hooks(): void
    {
        add_action('elementor/editor/after_enqueue_scripts', static function (): void {
            Assets::enqueue('elementor');
        });
        add_action('elementor/preview/enqueue_scripts', static function (): void {
            Assets::enqueue('runtime');
        });
    }
}
