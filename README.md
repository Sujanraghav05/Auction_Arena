# AuctionArena

A white-label, IPL-style player auction platform: live bidding, team purses,
and a player dashboard with full auction-rate history across seasons. Built
generically so you can rent it out to different leagues/events — just change
the seed data and branding per deployment.

## Stack

- **Backend:** Node.js, Express, Socket.IO, Prisma
- **Database:** PostgreSQL
- **Frontend:** React (Vite), Tailwind CSS, Recharts
- **Auth:** JWT, 3 roles — ADMIN (runs the auction), TEAM (bids), VIEWER (read-only)

## Project layout

```
auction-arena/
  server/     Express + Socket.IO API
  client/     React frontend
  render.yaml deployment config for Render
```

---

## 1. Run it locally first

Do this before deploying anything — it's much easier to debug on your own machine.

### Database and backend
Neon is configured for this project. From the project root, refresh its connection variables with:

```bash
neon deploy
```

Create `server/.env` from `server/.env.example` and set a long random `JWT_SECRET`. The backend loads Neon URLs from the root `.env.local` and fills other local settings from `server/.env`. Prisma reads the pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED` from the environment; do not put database URLs directly in the Prisma schema.

```bash
cd server
npm install
npm run prisma:push
npm run dev
```

The schema command uses Neon's direct connection; the running app uses the pooled `DATABASE_URL`.
After pulling schema changes, run `npm run prisma:push` before starting the app so the database includes the per-team budget field.

A fresh database has no seed data. After promoting your account to admin, create and activate a season and add players from the Admin panel.

### Frontend
```bash
cd client
npm install
npm run dev
```
Open the URL it prints (usually `http://localhost:5173`).

### Make your first admin account
There's no admin by default — the first registered user is a VIEWER. Promote
yourself directly in the database:
1. Register an account on the site.
2. In the Neon dashboard, open the SQL editor and run:
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
   ```
3. Log out and back in on the site. You'll now see the Admin tab.

To let a team log in and bid, create the team and assign a registered user to
it from the **Users and Teams** section in the Admin panel. The user's role
must be `TEAM`; assign the user to a team in the selected season. Set a custom
starting budget when creating a team, or update its budget later from the same
section. Changing a budget preserves the amount already spent and is rejected
if the new budget is below that amount.

On the Live Auction page, assigned team users can enter a bid amount; accepted
bids are broadcast to everyone in the room in the shared Live bids feed.
Viewers can follow bids but cannot place them. The live feed is in memory and
resets when the next player starts or the server restarts.

---

## 2. Deploy for real (free tier)

**Use a dedicated account for this**, not your personal one, since you're
handing it off to an organization. One email (even a new Gmail) signed up for
everything below keeps ownership clean.

### Database — Neon (already created above)
Nothing more to do here.

### Backend — Render
1. Push this whole folder to a GitHub repo.
2. Go to [render.com](https://render.com) → New → Web Service → connect the repo.
3. Settings:
   - Root directory: `server`
   - Build command: `npm install && npx prisma db push`
   - Start command: `npm start`
4. Add environment variables (Render dashboard → Environment):
   - `DATABASE_URL` — the pooled Neon connection string
   - `DATABASE_URL_UNPOOLED` — the direct Neon connection string, used for schema deployment
   - `JWT_SECRET` — a long random string
   - `CLIENT_URL` — fill this in *after* step 3 below, once you have the frontend URL
5. Deploy. Note the URL Render gives you, like `https://auction-arena-server.onrender.com`.

### Frontend — Cloudflare Pages
(Not Vercel — Vercel's free tier is for non-commercial use, and this will be used by an organization.)
1. Go to [pages.cloudflare.com](https://pages.cloudflare.com) → Create project → connect the same repo.
2. Settings:
   - Root directory: `client`
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add environment variable: `VITE_API_URL` = your Render backend URL from above.
4. Deploy. Note the URL it gives you, like `https://auction-arena.pages.dev`.
5. Go back to Render and set `CLIENT_URL` to this Cloudflare Pages URL, then redeploy the backend.

### Stop the backend from sleeping
Render's free tier sleeps after 15 minutes idle — the first request after
that takes ~50 seconds, which would ruin a live auction.
1. Sign up free at [uptimerobot.com](https://uptimerobot.com).
2. Add an HTTP monitor pointed at `https://<your-render-url>/health`, checked every 5 minutes.

This keeps it awake using well under Render's 750 free hours/month, since
you're only running one service.

---

## 3. Before the real auction day

- Open the live site yourself 10 minutes early to make sure everything's awake.
- Get several people to log in as different teams and bid at once — test this
  *before* the event, not during it.
- Double check each team's purse (`purseLeft`) is set correctly for the season.
- If this is a high-stakes event, upgrade just the Render service to the paid
  tier (~$7) for that month so it never sleeps. Database and frontend can stay free.

## 4. Renting this out to another event

Everything auction-specific is just data: seasons, teams, players. To stand up
a new instance for another organizer:
1. Duplicate the repo (or just run a second Render + Cloudflare Pages + Neon
   deployment from the same repo).
2. Create a new season, teams, and players for them.
3. Swap the logo/name in `client/index.html` and `Navbar.jsx` if they want their own branding.

No code changes needed for a new event — that's the point of keeping it generic.
# Auction_Arena
