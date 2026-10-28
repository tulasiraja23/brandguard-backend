# BrandGuard AI - Backend (Express + MongoDB)

REST API for BrandGuard AI. All demo data is **fictional** (AquaNova).

## What works / what is simulated / what is planned

| Status | Feature |
|---|---|
| Working | JWT auth, bcrypt passwords, roles (writer / reviewer / admin), organisation-level isolation |
| Working | Brand rules and trusted facts with versions (soft delete, history kept) |
| Working | Deterministic checks: flagged phrases, number+unit claim checks (750 ml vs 1-litre, unit conversion), tone |
| Working | Claim verdicts: supported / contradicted / unverified (unverified is never "false") |
| Working | Prompt-injection detection on submitted content (flagged High, never obeyed) |
| Working | Review workflow: analysed -> pending -> approved / rejected, comments required for High risk and rejections, no self-approval by default |
| Working | "Possibly affected" detection when rules/facts change after content was checked |
| Working | Tamper-evident audit log (SHA-256 hash chain per organisation) + `/api/audit/verify` |
| Real AI (optional) | Tone/claim analysis via the Anthropic API when `ANTHROPIC_API_KEY` is set. AI findings are capped at Medium and cannot mark a claim supported or contradicted |
| DEMO mode | With no API key, a keyword heuristic runs and every finding is labelled DEMO. It is not AI |
| Planned | Guideline Doctor insights, Brand Conflict Simulator, file uploads, versioned guideline "proposals" |

## Setup

```bash
cd brandguard-backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: set JWT_SECRET (command is inside the file)
```

Start MongoDB (Community Server running locally, view it with Compass at `mongodb://127.0.0.1:27017`), then:

```bash
npm run seed     # creates the fictional AquaNova org + 3 users
npm run dev      # API on http://localhost:5000
npm test         # unit tests + API tests (API tests download a small MongoDB binary the first time)
```

Seeded logins (password = `SEED_PASSWORD`, default `Demo@12345`):
`admin@aquanova.demo`, `writer@aquanova.demo`, `reviewer@aquanova.demo`

## Demo script (Postman or curl)

1. `POST /api/auth/login` as writer -> copy `token`.
2. `POST /api/submissions` with header `Authorization: Bearer <token>` and body  
   `{"content":"Meet our new 1-litre bottle. It is clinically proven to keep every drink cold for 48 hours and is the world's safest bottle.","contentType":"advertisement"}`  
   -> `1-litre` is **contradicted** (evidence: 750 ml), `clinically proven` / `world's safest` flagged High, `48 hours` **unverified**.
3. `POST /api/submissions/:id/submit` (writer).
4. Login as reviewer, `POST /api/submissions/:id/decision`  
   `{"decision":"approved","comment":"Edited to approved facts","finalText":"Meet our new 750 ml stainless steel bottle."}`
5. Login as admin, `POST /api/facts` to change a fact -> `GET /api/dashboard` shows `approvedButPossiblyAffected`.
6. `GET /api/audit/verify` -> `{"valid":true}`. Edit any audit document in Compass, call again -> `valid:false`.

## Endpoints (all under /api, JSON)

| Method | Path | Who |
|---|---|---|
| POST | /auth/register, /auth/login | public (creates a new org + admin) |
| GET | /auth/me | any signed-in user |
| GET, POST | /users | admin |
| GET | /rules, /facts | any |
| POST, PUT, DELETE | /rules, /rules/:id, /facts, /facts/:id | reviewer, admin |
| POST, GET | /submissions | any (writers see only their own) |
| GET, PATCH | /submissions/:id | any / author (edit suggestion, accept or reject findings) |
| POST | /submissions/:id/submit | author |
| POST | /submissions/:id/recheck | any (creates a NEW analysis, keeps the old one) |
| POST | /submissions/:id/decision | reviewer, admin |
| GET | /dashboard | any |
| GET | /audit, /audit/verify | reviewer, admin |

## Security notes

- JWT is verified on every request and the user is reloaded from the database, so role changes apply immediately.
- Every query is filtered by the caller's organisation; other organisations' ids return 404.
- Inputs are validated with zod (object-shaped login bodies are rejected, which blocks NoSQL operator injection).
- helmet, CORS limited to `CLIENT_ORIGIN`, rate limit on auth routes, 100 kb body limit.
- Audit-chain limitation: deleting the newest entries can't be detected from the data alone. Record the latest `headHash` elsewhere for that.
- `ALLOW_SELF_APPROVAL=false` means the author can't approve their own content. Register an org, then create a writer and reviewer via `POST /api/users`.

## Connecting the frontend

Replace the `localStorage` reads/writes in your React app with calls to these endpoints (send the token in the `Authorization` header) and keep your UI as it is. `src/services/analyzer.js` is the same engine your frontend uses, so results match.
