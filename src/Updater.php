<?php

declare(strict_types=1);

namespace InsightX\Tailwind;

/**
 * Updates from GitHub Releases, same setup as InsightX AllHub.
 *
 * The plugin isn't on wordpress.org, so nothing else tells WordPress a newer
 * version exists. enableReleaseAssets() makes the checker install the zip
 * attached to each GitHub Release (built by .github/workflows/release.yml,
 * including the compiled dist/), not a tarball of the branch, which has no
 * dist/ and would not run. The repository is public; no token involved.
 */
final class Updater
{
    public const REPOSITORY = 'https://github.com/InsightX-th/insightx-tailwind';

    public static function boot(): void
    {
        require_once INSIGHTX_TAILWIND_DIR . '/libs/plugin-update-checker/plugin-update-checker.php';

        $checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
            self::REPOSITORY,
            INSIGHTX_TAILWIND_FILE,
            PluginInfo::SLUG
        );
        $checker->getVcsApi()->enableReleaseAssets();

        // The checker answers "View details" itself; keep our banner, icon and copy
        // while its version / download URL come from the latest release.
        $checker->addFilter('pre_inject_info', [PluginInfo::class, 'decorate']);
    }
}
