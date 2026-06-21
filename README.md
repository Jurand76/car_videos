# AUTKA.PL — zdjęcia + videoprezentacja

Jeden katalog, jeden terminal.

## Pierwsze uruchomienie

```bash
npm run setup
cp project.env.example project.env   # jedyny plik konfiguracji — uzupełnij klucze
npm run setup                        # wygeneruje photos/web/.env.local z project.env
```

Wymagane: **Node.js**, **Docker** (PostgreSQL + API zdjęć).

## Dev — wszystko naraz

```bash
npm run dev:all
```

| Usługa | URL |
|--------|-----|
| **Logowanie** | http://localhost:3010/login |
| **Hub (po logowaniu)** | http://localhost:3010/hub |
| **Zdjęcia** | http://localhost:3010/dashboard |
| **Wideo** | http://localhost:3010/video (ten sam port co hub — proxy do gateway) |
| **Remotion Studio** | http://localhost:3000 |
| **API zdjęć** | http://localhost:8010 |

Flow: **login → hub → zdjęcia albo wideo**. Wejdź na http://localhost:3010 (przekieruje na login).

## Struktura

```
projekt_autka/
├── hub/           # (legacy statyczny — hub jest w photos/web /hub)
├── panel/         # panel videoprezentacji (/video)
├── server/        # API wideo + gateway
├── src/           # Remotion
├── photos/
│   ├── web/       # Next.js — generator zdjęć
│   └── api/       # FastAPI — backend zdjęć (Docker)
├── public/        # assety wideo (uploads/audio/)
├── generated/     # project.json
└── project.env    # jedyne źródło konfiguracji (szablon: project.env.example)
```

## Skrypty

| Skrypt | Opis |
|--------|------|
| `npm run dev:all` | Docker (DB+API) + zdjęcia web + Studio + gateway |
| `npm run dev:gateway` | Tylko hub + panel wideo (:4000) |
| `npm run dev:photos:web` | Tylko Next.js zdjęć (:3010) |
| `npm run dev` | Tylko Remotion Studio (:3000) |
