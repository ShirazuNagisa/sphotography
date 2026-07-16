<?php
/**
 * Sphotography - region_tag colour (term meta + shared resolver)
 *
 * A region_tag term can carry an explicit colour (term meta
 * `sphotography_color`). When none is set, a stable colour is derived from the
 * term slug so the map is never uncoloured once the feature is switched on.
 *
 * The colour is resolved server-side (here) so PHP is the single source of
 * truth: the frontend never hashes slugs itself, it just consumes the map
 * emitted in theme-mods-applier.php.
 *
 * @package Sphotography
 * @version 1.2.6
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

const SPHOTOGRAPHY_TAG_COLOR_META = 'sphotography_color';

/**
 * Deterministic fallback colour from a slug: a stable hue with a fixed
 * saturation/lightness tuned to stay legible on both the light (positron) and
 * dark (dark-matter) basemaps.
 *
 * @param string $slug Term slug.
 * @return string Hex colour, e.g. "#3aa6b9".
 */
function sphotography_tag_hash_color( $slug ) {
    $slug = (string) $slug;
    $hash = 0;
    $len  = strlen( $slug );
    for ( $i = 0; $i < $len; $i++ ) {
        // Simple, stable string hash (djb2-ish), kept in 32-bit range.
        $hash = ( ( $hash << 5 ) - $hash + ord( $slug[ $i ] ) ) & 0xFFFFFFFF;
    }
    $hue = $hash % 360;
    return sphotography_hsl_to_hex( $hue, 0.62, 0.55 );
}

/**
 * Resolve a term's effective marker colour: explicit override, else hash.
 *
 * @param WP_Term|int $term Term or term ID.
 * @return string Hex colour.
 */
function sphotography_tag_color( $term ) {
    $term = is_numeric( $term ) ? get_term( (int) $term, 'region_tag' ) : $term;
    if ( ! $term || is_wp_error( $term ) ) {
        return '';
    }
    $override = get_term_meta( $term->term_id, SPHOTOGRAPHY_TAG_COLOR_META, true );
    $override = sanitize_hex_color( (string) $override );
    return $override ? $override : sphotography_tag_hash_color( $term->slug );
}

/**
 * HSL (h in degrees, s/l in 0–1) → hex.
 */
function sphotography_hsl_to_hex( $h, $s, $l ) {
    $c = ( 1 - abs( 2 * $l - 1 ) ) * $s;
    $x = $c * ( 1 - abs( fmod( $h / 60, 2 ) - 1 ) );
    $m = $l - $c / 2;
    if ( $h < 60 )       { $r = $c; $g = $x; $b = 0; }
    elseif ( $h < 120 )  { $r = $x; $g = $c; $b = 0; }
    elseif ( $h < 180 )  { $r = 0; $g = $c; $b = $x; }
    elseif ( $h < 240 )  { $r = 0; $g = $x; $b = $c; }
    elseif ( $h < 300 )  { $r = $x; $g = 0; $b = $c; }
    else                 { $r = $c; $g = 0; $b = $x; }
    return sprintf(
        '#%02x%02x%02x',
        (int) round( ( $r + $m ) * 255 ),
        (int) round( ( $g + $m ) * 255 ),
        (int) round( ( $b + $m ) * 255 )
    );
}

/**
 * slug => resolved hex colour for every region_tag term. Consumed by the
 * frontend (droplets, legend, article chips) as the single colour source.
 *
 * @return array<string,string>
 */
function sphotography_all_tag_colors() {
    $terms = get_terms( array(
        'taxonomy'   => 'region_tag',
        'hide_empty' => false,
    ) );
    $map = array();
    if ( ! is_wp_error( $terms ) ) {
        foreach ( $terms as $t ) {
            $map[ $t->slug ] = array(
                'name'  => $t->name,
                'color' => sphotography_tag_color( $t ),
            );
        }
    }
    return $map;
}

// ============================================
// Term add/edit screen: colour field
// ============================================
function sphotography_region_tag_add_field() {
    ?>
    <div class="form-field term-sphotography-color-wrap">
        <label for="sphotography-term-color"><?php _e( '标记颜色', 'sphotography' ); ?></label>
        <input type="text" name="sphotography_color" id="sphotography-term-color" value="" class="sphotography-term-color-picker" data-default-color="">
        <p><?php _e( '可选。留空则按标签别名自动生成配色。仅在「地图样式 → 按地区标签分色」开启时生效。', 'sphotography' ); ?></p>
    </div>
    <?php
}
add_action( 'region_tag_add_form_fields', 'sphotography_region_tag_add_field' );

function sphotography_region_tag_edit_field( $term ) {
    $color = get_term_meta( $term->term_id, SPHOTOGRAPHY_TAG_COLOR_META, true );
    $auto  = sphotography_tag_hash_color( $term->slug );
    ?>
    <tr class="form-field term-sphotography-color-wrap">
        <th scope="row"><label for="sphotography-term-color"><?php _e( '标记颜色', 'sphotography' ); ?></label></th>
        <td>
            <input type="text" name="sphotography_color" id="sphotography-term-color" value="<?php echo esc_attr( $color ); ?>" class="sphotography-term-color-picker" data-default-color="">
            <p class="description">
                <?php
                /* translators: %s: auto-generated hex colour */
                printf( esc_html__( '留空则使用自动配色（当前：%s）。仅在「按地区标签分色」开启时生效。', 'sphotography' ), esc_html( $auto ) );
                ?>
            </p>
        </td>
    </tr>
    <?php
}
add_action( 'region_tag_edit_form_fields', 'sphotography_region_tag_edit_field' );

// ============================================
// Save the colour on create / edit
// ============================================
function sphotography_region_tag_save_color( $term_id ) {
    // The taxonomy screens nonce-check via core; only run for our field.
    if ( ! isset( $_POST['sphotography_color'] ) ) {
        return;
    }
    if ( ! current_user_can( 'manage_categories' ) ) {
        return;
    }
    $color = sanitize_hex_color( wp_unslash( $_POST['sphotography_color'] ) );
    if ( $color ) {
        update_term_meta( $term_id, SPHOTOGRAPHY_TAG_COLOR_META, $color );
    } else {
        delete_term_meta( $term_id, SPHOTOGRAPHY_TAG_COLOR_META );
    }
}
add_action( 'created_region_tag', 'sphotography_region_tag_save_color' );
add_action( 'edited_region_tag', 'sphotography_region_tag_save_color' );

// ============================================
// Enqueue the colour picker on the region_tag term screen
// ============================================
function sphotography_region_tag_admin_assets( $hook ) {
    if ( 'edit-tags.php' !== $hook && 'term.php' !== $hook ) {
        return;
    }
    $taxonomy = isset( $_GET['taxonomy'] ) ? sanitize_key( $_GET['taxonomy'] ) : '';
    if ( 'region_tag' !== $taxonomy ) {
        return;
    }
    wp_enqueue_style( 'wp-color-picker' );
    wp_enqueue_script( 'wp-color-picker' );
    wp_add_inline_script(
        'wp-color-picker',
        "jQuery(function($){ $('.sphotography-term-color-picker').wpColorPicker(); });"
    );
}
add_action( 'admin_enqueue_scripts', 'sphotography_region_tag_admin_assets' );
