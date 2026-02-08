# CLAUDE.md — 3D Cadastre

## Project Overview

3D Cadastre is an Angular 20 web application for visualizing and managing 3D building and land parcel data. It renders CityJSON buildings via Three.js, overlays cadastral boundaries and OpenStreetMap tiles, and connects to the InfoBhoomi backend for authentication, model persistence, and parcel data. The data models follow the LADM (ISO 19152) standard for land administration.

## Quick Reference

```bash
npm start          # Dev server at http://127.0.0.1:5175 (proxies /api to InfoBhoomi backend)
npm run build      # Production build (output in dist/three-js/)
npm test           # Run Karma + Jasmine tests
npm run serve:ssr:three-js  # Serve SSR build on port 4000
```

## Architecture

```
src/
├── app/
│   ├── components/           # Angular standalone components
│   │   ├── viewer-container/  # Master orchestrator — manages viewer, dialogs, data loading
│   │   ├── viewers/
│   │   │   └── ninja-viewer/  # Three.js 3D viewport (raycasting, OrbitControls, OSM ground)
│   │   ├── building-info-panel/  # Right sidebar for building details (RRR, units, metadata)
│   │   ├── land-info-panel/      # Right sidebar for land parcel details
│   │   ├── cityobjects-tree/     # Left sidebar — hierarchical CityJSON object browser
│   │   ├── dialogs/              # Modal dialogs (save model, create apartment)
│   │   └── login/                # Authentication form
│   ├── services/             # Business logic and API communication
│   │   ├── auth.service.ts        # Token-based auth (signals for state)
│   │   ├── backend.service.ts     # CityJSON/apartment CRUD (async/await + firstValueFrom)
│   │   ├── cityjson.ts            # CityJSON data store (BehaviorSubject → Observable)
│   │   ├── cityjson.model.ts      # CityJSON TypeScript interfaces
│   │   ├── ninja-loader.ts        # CityJSON → Three.js mesh conversion
│   │   ├── import-ifc.ts          # IFC → CityJSON conversion (web-ifc)
│   │   ├── geo-transform.service.ts    # CRS detection + proj4 coordinate transforms
│   │   ├── osm-tile.service.ts         # OpenStreetMap tile fetching + texturing
│   │   ├── parcel-api.service.ts       # InfoBhoomi parcel API calls
│   │   ├── parcel-layer.service.ts     # Parcel mesh generation
│   │   └── cadastral-polygon.service.ts # Legal boundary polygon rendering
│   ├── models/               # Data models (LADM-compliant)
│   │   ├── building-info.model.ts  # Building interfaces + 30+ enums
│   │   └── land-parcel.model.ts    # Parcel interfaces + 23+ enums
│   ├── guards/               # Route guards (authGuard, guestGuard)
│   ├── app.ts                # Root component
│   ├── app.routes.ts         # Route config (login → /login, viewer → /viewer)
│   ├── app.config.ts         # DI providers (zoneless, router, HttpClient)
│   └── app.config.server.ts  # SSR configuration
├── environment/
│   ├── environment.ts        # Development config (localhost API URLs)
│   └── environment.prod.ts   # Production config (infobhoomiback.geoinfobox.com)
├── main.ts                   # Browser bootstrap
├── main.server.ts            # SSR bootstrap
├── server.ts                 # Express SSR server
└── styles.css                # Global styles

public/                       # Static assets (sample CityJSON files, parcel data)
```

### Key External Dependencies

| Package | Purpose |
|---------|---------|
| `three` (0.174) | 3D rendering engine |
| `itowns` (2.46) | Geospatial 3D engine (used for CRS utilities) |
| `web-ifc` (0.0.72) | IFC file parsing; requires `web-ifc.wasm` copied to assets |
| `proj4` (2.20) | Coordinate reference system transformations |
| `earcut` (3.0) | Polygon triangulation for mesh generation |

### Routes

| Path | Component | Guard |
|------|-----------|-------|
| `/login` | LoginComponent | guestGuard (redirects authenticated users away) |
| `/viewer` | ViewerContainer | authGuard (requires authentication) |
| `/` | Redirects to `/login` | — |

### Backend API (InfoBhoomi)

All API calls go through `/api/` which is proxied in development via `proxy.conf.json` to `https://infobhoomiback.geoinfobox.com`.

- `POST /api/user/login/` — Authentication
- `GET/POST /api/user/cityjson/` — CityJSON model CRUD
- `GET/POST /api/user/cityobjects/` — Apartment/unit CRUD
- `GET /api/user/parcels/` — Land parcel data (GeoJSON)

## Code Conventions

### Angular Patterns

- **Zoneless change detection** — the app uses `provideZonelessChangeDetection()`. Do not introduce Zone.js dependencies.
- **Standalone components** — all components are standalone (no NgModules). Use `imports` array in `@Component` for dependencies.
- **Signals for state** — use Angular signals (`signal()`, `computed()`, `effect()`) for reactive state. Use `input()` and `output()` instead of `@Input`/`@Output` decorators.
- **Lazy loading** — routes use `loadComponent` with dynamic imports.
- **Dependency injection** — prefer `inject()` function over constructor injection.
- **RxJS interop** — use `toSignal()` to bridge Observables to signals where appropriate.

### TypeScript

- **Strict mode** is enabled with all Angular strict template checks.
- **Target**: ES2022 with module preservation.
- **Single quotes** for strings (enforced by `.editorconfig`).
- **2-space indentation**, UTF-8, LF line endings.

### Naming Conventions

- Components: PascalCase class names, kebab-case selectors with `app-` prefix (e.g., `app-ninja-viewer`).
- Services: PascalCase with `Service` suffix (e.g., `AuthService`, `GeoTransformService`).
- Component files: kebab-case without `.component` suffix for newer components (e.g., `ninja-viewer.ts`, `viewer-container.ts`). Some older components use the `.component.ts` suffix.
- Models: `*.model.ts` files in `src/app/models/`.
- Spec files: co-located with source as `*.spec.ts`.

### Service Patterns

- `BackendService` uses `async/await` with `firstValueFrom()` to convert Observables to Promises.
- `AuthService` uses signals for reactive auth state.
- `CityjsonService` uses `BehaviorSubject` for streaming CityJSON data.
- API services call `ensureAuth()` before requests.

### 3D Rendering Patterns

- All Three.js rendering happens in `NinjaViewer`.
- Use `effect()` to react to signal/input changes and update the 3D scene.
- Object picking uses `THREE.Raycaster`.
- Mesh lookup uses `Map<string, THREE.Mesh[]>` for O(1) access.
- Camera constants are `private static readonly` class properties.

## Testing

- **Framework**: Karma 6.4 + Jasmine 5.7
- **Run**: `npm test`
- **Config**: `tsconfig.spec.json`, test builder in `angular.json`
- Test files are co-located with source files as `*.spec.ts`.
- Tests use `TestBed.configureTestingModule` with `provideZonelessChangeDetection()`.

Existing test files:
- `src/app/app.spec.ts`
- `src/app/services/cityjson.spec.ts`
- `src/app/services/ninja-loader.spec.ts`
- `src/app/services/import-ifc.spec.ts`
- `src/app/components/viewer-container/viewer-container.spec.ts`
- `src/app/components/cityobjects-tree/cityobjects-tree.spec.ts`
- `src/app/components/viewers/ninja-viewer/ninja-viewer.spec.ts`

## Build & Deployment

- **Dev server**: `npm start` — runs on `127.0.0.1:5175` with API proxy to InfoBhoomi backend.
- **Production build**: `npm run build` — outputs to `dist/three-js/`, uses file replacements for `environment.prod.ts`.
- **SSR**: Built-in Angular SSR support via Express server (`src/server.ts`). Serve with `npm run serve:ssr:three-js`.
- **Bundle budgets**: Initial bundle 4MB warning / 6MB error. Component styles 8kB warning / 20kB error.
- **WASM asset**: `web-ifc.wasm` is copied from `node_modules/web-ifc` to `assets/` during build.

## Data Formats

- **CityJSON**: Primary 3D building data format. Files in `public/` for local development.
- **IFC**: Building Information Models imported via `web-ifc` and converted to CityJSON.
- **GeoJSON**: Land parcels served by InfoBhoomi API as `FeatureCollection`.
- **EPSG/CRS**: Geographic coordinates use proj4 for transformations. Buildings may use various CRS (detected from CityJSON metadata). Parcels default to EPSG:4326 (WGS84).

## Utility Scripts (Python)

Root-level Python scripts for CityJSON geometry repair:
- `fix.py` — Repairs invalid vertex indices
- `fix_triangles.py` — Removes degenerate triangles
- `cleaner.py` — Deduplicates vertices
- `repair_geometry.py` — General geometry validation

## Common Pitfalls

- **SSR compatibility**: Browser-only APIs (Three.js, `window`, `sessionStorage`) must be guarded with `isPlatformBrowser()` checks.
- **Coordinate alignment**: Parcels, buildings, and OSM tiles use different coordinate systems. The `GeoTransformService` and "World Origin" methodology handle alignment — changes to positioning logic need careful testing.
- **WASM loading**: `web-ifc.wasm` must be available at `/assets/web-ifc.wasm` at runtime. The `angular.json` asset config handles this.
- **Proxy required for dev**: API calls fail without the dev proxy. Ensure `ng serve` (via `npm start`) is used, not a bare HTTP server.
