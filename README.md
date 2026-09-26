# AUTKA.PL — zdjęcia produktowe + serwis

Jeden katalog, jeden terminal. Moduł wideo (Remotion) został usunięty —
ostatni stan z wideo jest w tagu `archiwum-wideo`.

## Pierwsze uruchomienie

```bash
cp project.env.example project.env   # jedyny plik konfiguracji — uzupełnij klucze
npm run setup                        # zależności + photos/web/.env.local z project.env
```

Wymagane: **Node.js**, **Docker** (PostgreSQL + API).

## Dev

```bash
npm run dev
```

| Usługa | URL |
|--------|-----|
| **Logowanie** | http://localhost:3010/login |
| **Hub (po logowaniu)** | http://localhost:3010/hub |
| **Zdjęcia** | http://localhost:3010/dashboard |
| **Serwis** | http://localhost:3010/service |
| **API** | http://localhost:8010 |

Flow: **login → hub → zdjęcia albo serwis**.

## Struktura

```
projekt_autka/
├── photos/
│   ├── web/       # Next.js — panel (zdjęcia + serwis)
│   └── api/       # FastAPI — backend (Docker)
├── scripts/       # prepare-env, ensure-api, check-dev-ports
├── docker-compose.yml         # lokalnie: postgres + api
├── docker-compose.mikrus.yml  # produkcja: postgres + api + web
└── project.env    # jedyne źródło konfiguracji (szablon: project.env.example)
```

## Skrypty

| Skrypt | Opis |
|--------|------|
| `npm run dev` | Docker (DB + API :8010) + Next.js (:3010) |
| `npm run dev:photos:api` | Tylko Docker (DB + API) |
| `npm run dev:photos:web` | Tylko Next.js (:3010) |

Wdrożenie na Mikrusa: patrz [DEPLOYMENT.md](DEPLOYMENT.md).
