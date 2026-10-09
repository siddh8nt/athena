-- Simplified outlines of US states and counties (PRD §9.3), so a typed state or county is searched by its real shape
-- instead of a box that leaks across borders (10 Oct: a box around Ohio returned a venue in Ann Arbor, MI).
-- One-off extraction into data/overture-outlines.json (jobs/overture-places.py). Land only; slivers and islands
-- under 20 km² are dropped; stray lines and points left by simplifying are removed.
WITH shapes AS (
  SELECT d.names.primary AS name, d.subtype, d.region,
    ST_SIMPLIFY(ST_UNION_AGG(a.geometry), IF(d.subtype = 'region', 4000, 1200)) AS g
  FROM `bigquery-public-data.overture_maps.division_area` a
  JOIN `bigquery-public-data.overture_maps.division` d ON d.id = a.division_id
  WHERE a.country = 'US' AND a.is_land AND a.subtype IN ('region', 'county')
  GROUP BY 1, 2, 3, d.id
)
SELECT name, subtype, region,
  ST_ASTEXT(ST_SNAPTOGRID(ST_UNION(ARRAY(SELECT p FROM UNNEST(ST_DUMP(g)) p WHERE ST_DIMENSION(p) = 2 AND ST_AREA(p) > 2e7)), 0.001)) AS wkt
FROM shapes
