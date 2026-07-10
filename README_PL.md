# Poprawka generowania flow animacji

Pakiet zmienia wyłącznie `server/generate.ts`.

## Co poprawia
- timeout dla OpenAI/DeepSeek,
- walidację pustej lub uszkodzonej odpowiedzi,
- fallback do drugiego providera,
- końcowy fallback heurystyczny zamiast błędu 500,
- logowanie czasu wykonania.

## Instalacja
Skopiuj `apply_flow_fix.py` do katalogu głównego repozytorium i uruchom:

```powershell
python .\apply_flow_fix.py
```

Następnie:

```powershell
git diff -- server/generate.ts
npx tsc --noEmit
npm run dev:all
```

Opcjonalnie ustaw w `.env`:

```env
FLOW_AI_TIMEOUT_MS=75000
```

## Cofnięcie
Skrypt tworzy `server/generate.ts.bak`.

```powershell
Copy-Item server\generate.ts.bak server\generate.ts -Force
```

## Commit
```powershell
git add server/generate.ts
git commit -m "Improve animation flow generation reliability"
git push origin main
```
