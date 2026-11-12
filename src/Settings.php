<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

/** Plugin options. CSS files live in Volume; the default main.css lives in JS. */
final class Settings
{
    public const OPTION = 'insightx_tailwind';
    public const STALE_OPTION = 'insightx_tailwind_stale';
    public const THEME_JSON_MODES = ['off', 'custom', 'all'];
    /** Sources that existed when v0.2 stored the *enabled* list (used to migrate it). */
    private const LEGACY_SOURCES = ['posts', 'theme', 'plugins', 'acf', 'elementor'];

    /** @return array{sources: list<string>, plugins: list<string>, theme_json: string, mirror_frontend: bool} */
    public static function get(): array
    {
        $saved = get_option(self::OPTION, []);
        $saved = is_array($saved) ? $saved : [];

        // Store what's switched OFF, so sources added in later versions start enabled.
        if (isset($saved['sources_off']) && is_array($saved['sources_off'])) {
            $off = $saved['sources_off'];
        } elseif (isset($saved['sources']) && is_array($saved['sources'])) {
            $off = array_diff(self::LEGACY_SOURCES, $saved['sources']);
        } else {
            $off = [];
        }

        return [
            'sources'    => array_values(array_diff(array_keys(Scanner::available_sources()), $off)),
            'plugins'    => isset($saved['plugins']) && is_array($saved['plugins'])
                ? array_values(array_intersect($saved['plugins'], array_keys(self::installed_plugins())))
                : [],
            'theme_json' => in_array($saved['theme_json'] ?? null, self::THEME_JSON_MODES, true) ? $saved['theme_json'] : 'custom',
            'mirror_frontend' => (bool) ($saved['mirror_frontend'] ?? true),
        ];
    }

    /**
     * @param mixed $sources
     * @param mixed $plugins
     */
    public static function save($sources, $plugins, string $theme_json, bool $mirror_frontend = true): void
    {
        $sources = is_array($sources) ? array_map('strval', $sources) : [];
        $plugins = is_array($plugins) ? array_map('strval', $plugins) : [];

        update_option(self::OPTION, [
            'sources_off' => array_values(array_diff(array_keys(Scanner::available_sources()), $sources)),
            'plugins'    => array_values(array_intersect($plugins, array_keys(self::installed_plugins()))),
            'theme_json' => in_array($theme_json, self::THEME_JSON_MODES, true) ? $theme_json : 'custom',
            'mirror_frontend' => $mirror_frontend,
        ], false);
    }

    /** @return array<string, string> plugin file => name (excluding ourselves) */
    public static function installed_plugins(): array
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $out = [];
        foreach (get_plugins() as $file => $data) {
            if ($file !== plugin_basename(INSIGHTX_TAILWIND_FILE)) {
                $out[$file] = (string) $data['Name'];
            }
        }
        return $out;
    }

    public static function is_stale(): bool
    {
        return (bool) get_option(self::STALE_OPTION, false);
    }

    public static function set_stale(bool $stale): void
    {
        update_option(self::STALE_OPTION, $stale, false);
    }
}
