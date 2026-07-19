<?php
// 服务端逆地理编码代理（Nominatim / LocationIQ）
// GET sphotography/v1/reverse-geocode?lat=&lng=&lang=
// 返回 { name: '<display name>'|'', lat, lng }

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'SPHOTOGRAPHY_GEOCODE_CACHE_TTL' ) ) {
	// 地名相对稳定，缓存一个月。坐标不同即新 key。
	define( 'SPHOTOGRAPHY_GEOCODE_CACHE_TTL', MONTH_IN_SECONDS );
}
if ( ! defined( 'SPHOTOGRAPHY_GEOCODE_DEFAULT_ENDPOINT' ) ) {
	define( 'SPHOTOGRAPHY_GEOCODE_DEFAULT_ENDPOINT', 'https://nominatim.openstreetmap.org/reverse' );
}

// 后台配置的逆地理编码端点（空则用 Nominatim 默认）
function sphotography_geocode_endpoint() {
	$ep = trim( (string) sphotography_get_mod( 'reverse_geocode_endpoint' ) );
	return '' !== $ep ? $ep : SPHOTOGRAPHY_GEOCODE_DEFAULT_ENDPOINT;
}

// 可选 API key（LocationIQ 等需要）
function sphotography_geocode_api_key() {
	return trim( (string) sphotography_get_mod( 'reverse_geocode_key' ) );
}

// 目标语言 → accept-language 值
function sphotography_geocode_accept_language( $lang ) {
	switch ( $lang ) {
		case 'en':
			return 'en';
		case 'ja':
			return 'ja';
		default:
			return 'zh-CN,zh';
	}
}

function sphotography_geocode_register_routes() {
	register_rest_route( 'sphotography/v1', '/reverse-geocode', array(
		'methods'             => WP_REST_Server::READABLE,
		'callback'            => 'sphotography_geocode_rest_reverse',
		'permission_callback' => '__return_true', // 公开读；按坐标缓存 + 取整约束请求量
		'args'                => array(
			'lat'  => array( 'required' => true ),
			'lng'  => array( 'required' => true ),
			'lang' => array( 'required' => false ),
		),
	) );
}
add_action( 'rest_api_init', 'sphotography_geocode_register_routes' );

// REST 回调：坐标 → 详细地名
function sphotography_geocode_rest_reverse( WP_REST_Request $request ) {
	$lat = (float) $request->get_param( 'lat' );
	$lng = (float) $request->get_param( 'lng' );
	$lang = (string) $request->get_param( 'lang' );
	if ( ! in_array( $lang, array( 'zh', 'en', 'ja' ), true ) ) {
		$lang = 'zh';
	}

	// 合法坐标范围校验；(0,0) 视为无效。
	if ( $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 || ( 0.0 === $lat && 0.0 === $lng ) ) {
		return rest_ensure_response( array( 'name' => '', 'lat' => $lat, 'lng' => $lng ) );
	}

	// 取到小数点后 5 位（约 1m）做缓存 key —— 同一张图坐标固定，命中率高。
	$key = 'sp_geo_' . $lang . '_' . md5( number_format( $lat, 5, '.', '' ) . ',' . number_format( $lng, 5, '.', '' ) );
	$cached = get_transient( $key );
	if ( false !== $cached ) {
		return rest_ensure_response( array( 'name' => (string) $cached, 'lat' => $lat, 'lng' => $lng ) );
	}

	$name = sphotography_geocode_lookup( $lat, $lng, $lang );
	if ( is_wp_error( $name ) ) {
		// 上游失败不缓存，前端会退化为只显示经纬度。
		return rest_ensure_response( array( 'name' => '', 'lat' => $lat, 'lng' => $lng ) );
	}
	set_transient( $key, $name, SPHOTOGRAPHY_GEOCODE_CACHE_TTL );
	return rest_ensure_response( array( 'name' => $name, 'lat' => $lat, 'lng' => $lng ) );
}

// 请求上游逆地理编码服务
function sphotography_geocode_lookup( $lat, $lng, $lang ) {
	$endpoint = sphotography_geocode_endpoint();
	$args_url = array(
		'format'          => 'jsonv2',
		'lat'             => number_format( $lat, 7, '.', '' ),
		'lon'             => number_format( $lng, 7, '.', '' ),
		'accept-language' => sphotography_geocode_accept_language( $lang ),
		'zoom'            => 18,
		'addressdetails'  => 1,
	);
	$api_key = sphotography_geocode_api_key();
	if ( '' !== $api_key ) {
		// LocationIQ 等兼容端点用 `key` 参数鉴权。
		$args_url['key'] = $api_key;
	}
	$url = $endpoint . '?' . http_build_query( $args_url );

	$response = wp_remote_get( $url, array(
		'timeout'    => 15,
		'user-agent' => 'Sphotography-Theme/' . ( defined( 'SPHOTOGRAPHY_VERSION' ) ? SPHOTOGRAPHY_VERSION : '1.0' ) . ' (' . home_url( '/' ) . ')',
		'headers'    => array( 'Accept' => 'application/json' ),
	) );

	if ( is_wp_error( $response ) ) {
		return $response;
	}
	$code = (int) wp_remote_retrieve_response_code( $response );
	if ( $code < 200 || $code >= 300 ) {
		return new WP_Error( 'geocode_http', 'Reverse geocode HTTP ' . $code );
	}
	$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $data ) ) {
		return new WP_Error( 'geocode_parse', 'Reverse geocode: bad response' );
	}

	// 优先 display_name（最详细），否则用 name，否则由 address 组装。
	if ( ! empty( $data['display_name'] ) ) {
		return sphotography_geocode_trim_name( (string) $data['display_name'] );
	}
	if ( ! empty( $data['name'] ) ) {
		return sphotography_geocode_trim_name( (string) $data['name'] );
	}
	if ( ! empty( $data['address'] ) && is_array( $data['address'] ) ) {
		$parts = array();
		foreach ( array( 'road', 'neighbourhood', 'suburb', 'city_district', 'city', 'town', 'village', 'county', 'state', 'country' ) as $f ) {
			if ( ! empty( $data['address'][ $f ] ) ) {
				$parts[] = (string) $data['address'][ $f ];
			}
		}
		if ( ! empty( $parts ) ) {
			return sphotography_geocode_trim_name( implode( ', ', array_slice( $parts, 0, 6 ) ) );
		}
	}
	return new WP_Error( 'geocode_empty', 'Reverse geocode: no name' );
}

// 归一化地名
function sphotography_geocode_trim_name( $name ) {
	$name = trim( preg_replace( '/\s+/u', ' ', (string) $name ) );
	if ( mb_strlen( $name ) > 160 ) {
		$name = rtrim( mb_substr( $name, 0, 160 ) ) . '…';
	}
	return $name;
}
