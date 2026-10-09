-- Every US place a founder might type (PRD §9.3, §9.4): states, counties, cities and towns, neighbourhoods.
-- One-off extraction from BigQuery's public Overture tables into data/overture-places.json (jobs/overture-places.py).
-- Points come from `division`; boxes from `division_area` (bbox only, never the polygons, so the scan stays small).
WITH areas AS (
  SELECT division_id, MIN(bbox.xmin) xmin, MIN(bbox.ymin) ymin, MAX(bbox.xmax) xmax, MAX(bbox.ymax) ymax
  FROM `bigquery-public-data.overture_maps.division_area`
  WHERE country = 'US'
  GROUP BY division_id
)
SELECT
  d.names.primary AS name,
  d.subtype,
  d.region,
  d.population,
  d.wikidata IS NOT NULL AS wd,
  (SELECT h.name FROM UNNEST(d.hierarchies.list[SAFE_OFFSET(0)].element.list) e, UNNEST([e.element]) h WHERE h.subtype = 'locality' AND h.name != d.names.primary LIMIT 1) AS city,
  (SELECT h.name FROM UNNEST(d.hierarchies.list[SAFE_OFFSET(0)].element.list) e, UNNEST([e.element]) h WHERE h.subtype = 'county' LIMIT 1) AS county,
  ROUND(ST_Y(d.geometry), 4) AS lat,
  ROUND(ST_X(d.geometry), 4) AS lon,
  ROUND(a.xmin, 4) AS xmin, ROUND(a.ymin, 4) AS ymin, ROUND(a.xmax, 4) AS xmax, ROUND(a.ymax, 4) AS ymax
FROM `bigquery-public-data.overture_maps.division` d
LEFT JOIN areas a ON a.division_id = d.id
WHERE d.country = 'US'
  AND d.subtype IN ('region', 'county', 'locality', 'neighborhood', 'microhood', 'macrohood')
