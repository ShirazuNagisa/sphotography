# Sphotography boundary data

Admin-region boundary GeoJSON consumed on demand by the theme (downloaded to
wp-content/uploads/sphotography-geo/ on first index rebuild). Served via jsDelivr:

- https://cdn.jsdelivr.net/gh/ShirazuNagisa/sphotography@geo-data/boundaries-provinces.json
- https://cdn.jsdelivr.net/gh/ShirazuNagisa/sphotography@geo-data/boundaries-cities.json

Schema per feature.properties: id, name, level (province|city), cc, pid (cities).
Provinces: DataV China + Natural Earth 10m admin-1 (ex-China). Cities: DataV China.
