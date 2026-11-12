<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

/** Fetch the latest stable Tailwind CSS release for the admin update notice. */
final class TailwindVersion
{
    private const TRANSIENT = 'insightx_tailwind_latest_css_version';
    private const REGISTRY_URL = 'https://registry.npmjs.org/tailwindcss/latest';

    public static function latest(): ?string
    {
        $cached = get_transient(self::TRANSIENT);
        if (is_array($cached) && array_key_exists('version', $cached)) {
            return is_string($cached['version']) ? $cached['version'] : null;
        }

        $response = wp_remote_get(self::REGISTRY_URL, [
            'timeout'             => 3,
            'redirection'         => 0,
            'limit_response_size' => 16384,
        ]);
        $version = null;
        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (is_array($body) && isset($body['version']) && is_string($body['version'])
                && preg_match('/^\d+\.\d+\.\d+$/', $body['version'])) {
                $version = $body['version'];
            }
        }

        set_transient(self::TRANSIENT, ['version' => $version], $version === null ? HOUR_IN_SECONDS : 12 * HOUR_IN_SECONDS);
        return $version;
    }
}
