-- US zip codes (Census ZCTAs) for typed locations (PRD §9.3): centre and box. Public domain (U.S. Census Bureau).
SELECT zip_code AS zip, city, state_code AS st,
  ROUND(internal_point_lat, 4) AS lat, ROUND(internal_point_lon, 4) AS lon,
  ROUND(b.xmin, 4) AS xmin, ROUND(b.ymin, 4) AS ymin, ROUND(b.xmax, 4) AS xmax, ROUND(b.ymax, 4) AS ymax
FROM `bigquery-public-data.geo_us_boundaries.zip_codes`, UNNEST([ST_BOUNDINGBOX(zip_code_geom)]) b
