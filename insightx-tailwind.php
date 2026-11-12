<?php
/**
 * Plugin Name:       InsightX Tailwind
 * Description:       Tailwind CSS 4.3 for WordPress: utilities that override the theme, live preview in Gutenberg & Elementor, class scanning for theme, plugins, ACF and content.
 * Version:           0.1.2
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Plugin URI:        https://insightx.in.th/
 * Author:            InsightX
 * Author URI:        https://www.insightx.in.th
 * License:           GPL-3.0-or-later
 * Text Domain:       insightx-tailwind
 * Domain Path:       /languages
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

define('INSIGHTX_TAILWIND_FILE', __FILE__);
define('INSIGHTX_TAILWIND_DIR', __DIR__);

spl_autoload_register(static function (string $class): void {
    $prefix = 'InsightX\\Tailwind\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_readable($file)) {
        require $file;
    }
});

InsightX\Tailwind\Plugin::boot();
