# 3D Cadastre Nexus v1.0

An Angular 20 web application for visualizing and managing 3D building and land parcel data. It renders CityJSON buildings via Three.js, overlays cadastral boundaries and OpenStreetMap tiles, and connects to the InfoBhoomi backend for authentication, model persistence, and parcel data. Data models follow the **LADM (ISO 19152)** standard for land administration.

## Features

- **3D Building Visualization** -- Import and render CityJSON models with semantic coloring, multiple Levels of Detail (LoD 0-4), and interactive object picking via raycasting
- **IFC Import** -- Convert Industry Foundation Classes (IFC) Building Information Models to CityJSON using web-ifc with WASM support
- **Land Parcel Management** -- Display and manage cadastral parcels with boundary polygons, zoning, tenure types, and valuations
- **OpenStreetMap Ground Plane** -- Geospatial OSM tile overlay beneath 3D buildings and parcels for geographic context
- **Coordinate System Support** -- Automatic CRS detection from CityJSON metadata with proj4 transformations to align buildings, parcels, and map tiles
- **LADM-Compliant Data Models** -- Rights, Restrictions, and Responsibilities (RRR) tracking for both buildings and land parcels with 50+ classification enums
- **Apartment/Unit Management** -- Create and manage building units with room assignment, explode view, and room highlighting
- **Server Persistence** -- Save and load CityJSON models and apartment configurations via the InfoBhoomi backend API
- **SSR Support** -- Server-side rendering via Angular SSR with Express

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Angular 20 (standalone, zoneless, signals) |
| 3D Engine | Three.js 0.174 |
| Geospatial | iTowns 2.46, proj4 2.20 |
| Data Processing | web-ifc 0.0.72, earcut 3.0 |
| Reactivity | RxJS 7.8, Angular Signals |
| Language | TypeScript 5.8 (ES2022) |
| Testing | Karma 6.4 + Jasmine 5.7 |
| SSR | Angular SSR + Express 5 |

## Getting Started

### Prerequisites

- Node.js (v20+)
- npm

### Installation

```bash
git clone <repository-url>
cd 3D-Cadastre
npm install
```

### Development Server

```bash
npm start
```

Runs on `http://127.0.0.1:5175` with API proxy to the InfoBhoomi backend. The proxy configuration is in `proxy.conf.json`.

### Production Build

```bash
npm run build
```

Output goes to `dist/three-js/`.

### SSR Build

```bash
npm run build
npm run serve:ssr:three-js
```

Serves the SSR build on port 4000.

### Tests

```bash
npm test
```

Runs Karma + Jasmine tests in a browser.

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── viewer-container/      # Master orchestrator (viewer, dialogs, data loading)
│   │   ├── viewers/
│   │   │   └── ninja-viewer/      # Three.js 3D viewport
│   │   ├── building-info-panel/   # Building details sidebar (RRR, units, metadata)
│   │   ├── land-info-panel/       # Land parcel details sidebar
│   │   ├── cityobjects-tree/      # CityJSON object hierarchy browser
│   │   ├── dialogs/               # Save model, create apartment modals
│   │   └── login/                 # Authentication form
│   ├── services/
│   │   ├── auth.service.ts        # Token-based auth (signals)
│   │   ├── backend.service.ts     # CityJSON/apartment CRUD
│   │   ├── cityjson.ts            # CityJSON data store (BehaviorSubject)
│   │   ├── ninja-loader.ts        # CityJSON → Three.js mesh conversion
│   │   ├── import-ifc.ts          # IFC → CityJSON conversion
│   │   ├── geo-transform.service.ts    # CRS detection + proj4 transforms
│   │   ├── osm-tile.service.ts         # OpenStreetMap tile fetching
│   │   ├── parcel-api.service.ts       # Parcel API calls
│   │   ├── parcel-layer.service.ts     # Parcel mesh generation
│   │   └── cadastral-polygon.service.ts # Boundary polygon rendering
│   ├── models/
│   │   ├── building-info.model.ts # Building interfaces + enums
│   │   └── land-parcel.model.ts   # Parcel interfaces + enums
│   ├── guards/                    # Route guards (auth, guest)
│   └── app.routes.ts              # Route config
├── environment/                   # Dev/prod environment configs
├── server.ts                      # Express SSR server
└── styles.css                     # Global styles

public/                            # Sample CityJSON files and parcel data
```

## Routes

| Path | Component | Guard |
|------|-----------|-------|
| `/login` | LoginComponent | guestGuard (redirects authenticated users) |
| `/viewer` | ViewerContainer | authGuard (requires authentication) |
| `/` | Redirects to `/login` | -- |

## Backend API

All API calls are proxied through `/api/` in development (target: `https://infobhoomiback.geoinfobox.com`).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/user/login/` | POST | Authentication |
| `/api/user/cityjson/` | GET/POST | CityJSON model CRUD |
| `/api/user/cityobjects/` | GET/POST | Apartment/unit CRUD |
| `/api/user/parcels/` | GET | Land parcel data (GeoJSON) |

## Data Formats

- **CityJSON** -- Primary 3D building data format (v2.0 spec). Sample files in `public/`.
- **IFC** -- Building Information Models, converted to CityJSON on import via web-ifc.
- **GeoJSON** -- Land parcels from the InfoBhoomi API as `FeatureCollection`.
- **EPSG/CRS** -- Coordinates use proj4 for transformations. Buildings may use various CRS (detected from metadata). Parcels default to EPSG:4326 (WGS84).

## Utility Scripts

Python scripts for CityJSON geometry repair:

| Script | Purpose |
|--------|---------|
| `fix.py` | Repairs invalid vertex indices |
| `fix_triangles.py` | Removes degenerate triangles |
| `cleaner.py` | Deduplicates vertices |
| `repair_geometry.py` | General geometry validation |

## License

This project is private.
