<?php
declare(strict_types=1);

class WP_Post
{
    public string $post_content;
    public function __construct(string $content) { $this->post_content = $content; }
}

class WP_Query
{
    public static array $last_args = [];
    public array $posts = [];
    public int $max_num_pages = 1;
    public function __construct(array $args)
    {
        self::$last_args = $args;
        $this->posts = [new WP_Post('public-token')];
    }
}

class DummyDb
{
    public string $options = 'wp_options';
    public string $postmeta = 'wp_postmeta';
    public string $posts = 'wp_posts';
    public array $queries = [];
    public array $last_prepare_args = [];
    public function prepare(string $sql, ...$args): string
    {
        $this->queries[] = $sql;
        $this->last_prepare_args = $args;
        return $sql;
    }
    public function get_col(string $sql): array
    {
        $this->queries[] = $sql;
        if (str_contains($sql, 'FROM wp_options')) {
            return ['[--ixt-private-marker:dummy_secret_42]'];
        }
        if (str_contains($sql, "'_menu_item_classes'")) {
            return ['menu-public-token'];
        }
        if (str_contains($sql, 'pm.meta_key IN')) {
            return ['public-meta-token'];
        }
        return [];
    }
}

function __(string $text, string $domain = ''): string { return $text; }
function get_post_types(array $args): array {
    return !empty($args['public']) ? ['post' => 'post', 'page' => 'page'] : ['post' => 'post', 'page' => 'page', 'wp_template' => 'wp_template'];
}
function did_action(string $hook): int { return 0; }
function apply_filters(string $hook, $value) {
    global $approved_filters;
    return $approved_filters[$hook] ?? $value;
}
function get_option(string $name, $default = false) {
    return $name === 'widget_public' ? 'public-widget-token' : '[--ixt-private-marker:dummy_secret_42]';
}
function maybe_serialize($value): string { return (string) $value; }

$wpdb = new DummyDb();
$approved_filters = [];
require __DIR__ . '/../src/Scanner.php';

use InsightX\Tailwind\Scanner;

$failed = 0;
function check(bool $condition, string $label): void
{
    global $failed;
    if (!$condition) { $failed++; echo "FAIL {$label}\n"; }
    else { echo "PASS {$label}\n"; }
}

Scanner::scan('posts', 1);
check(WP_Query::$last_args['post_status'] === 'publish', 'posts limited to published');
check(WP_Query::$last_args['has_password'] === false, 'password-protected posts excluded');
check(WP_Query::$last_args['post_type'] === ['post', 'page'], 'nonpublic post types excluded');

check(Scanner::scan('acf', 1)['contents'] === [], 'ACF meta denied without public key allowlist');
$approved_filters['insightx_tailwind_public_scan_meta_keys'] = ['public_style'];
Scanner::scan('acf', 1);
$meta_sql = end($wpdb->queries);
check(str_contains($meta_sql, "p.post_status = 'publish'"), 'ACF meta limited to published posts');
check(str_contains($meta_sql, "p.post_password = ''"), 'ACF meta excludes password posts');
check(str_contains($meta_sql, 'p.post_type IN'), 'ACF meta limited to public types');
check($wpdb->last_prepare_args[0] === 'public_style', 'ACF meta limited to approved keys');

$site = Scanner::scan('site', 1);
check(!str_contains(implode(' ', $site['contents']), 'dummy_secret_42'), 'private widget/theme option stays out of public CSS inputs');
check(in_array('menu-public-token', $site['contents'], true), 'published menu class still scanned');
$approved_filters['insightx_tailwind_public_scan_options'] = ['widget_public', 'options_secret'];
$site = Scanner::scan('site', 1);
check(in_array('public-widget-token', $site['contents'], true), 'approved widget option scanned');
check(!str_contains(implode(' ', $site['contents']), 'dummy_secret_42'), 'unapproved option remains excluded');

echo $failed === 0 ? "OK scanner fixture\n" : "{$failed} scanner fixture failures\n";
exit($failed === 0 ? 0 : 1);
