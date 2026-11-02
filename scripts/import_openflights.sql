-- Nạp toàn bộ danh mục sân bay có mã IATA từ OpenFlights (~6.000 sân bay).
-- 1. Tải https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat
-- 2. Đặt airports.dat ở thư mục đang đứng, chạy:
--      psql -d flight_booking -f scripts/import_openflights.sql
-- Sân bay đã có trong DB (dữ liệu mẫu tiếng Việt) được giữ nguyên.
CREATE TEMP TABLE of_airports (
    id int, name text, city text, country text, iata text, icao text,
    lat numeric, lon numeric, altitude int, utc_offset text, dst text,
    tz text, type text, source text
);

\copy of_airports FROM 'airports.dat' WITH (FORMAT csv, NULL '\N', ENCODING 'UTF8')

INSERT INTO airports (iata_code, icao_code, name, city, country, latitude, longitude, timezone)
SELECT iata, icao, name, city, country, lat, lon, tz
FROM of_airports
WHERE iata ~ '^[A-Z]{3}$'
ON CONFLICT (iata_code) DO NOTHING;
