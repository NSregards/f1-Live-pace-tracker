# F1 Pace Tracker

Lap-by-lap F1 tyre degradation analysis. Built with Next.js + OpenF1 API. Hosted 100% on Vercel for free.

## Stack

- **Frontend**: Next.js 14 + React + Plotly.js
- **Data**: OpenF1 REST API (free, no auth needed)
- **Hosting**: Vercel (free tier)
- **No database, no backend server, no Python**

## Data availability

OpenF1 has data from **2023 onwards** only.

---

## Deploy to Vercel (step by step)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/f1-pace-tracker.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New Project**
3. Import your `f1-pace-tracker` repository
4. Framework preset will auto-detect as **Next.js**
5. Click **Deploy** — no environment variables needed

That's it. Vercel will build and deploy automatically on every push to `main`.

---

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project structure

```
f1-pace-tracker/
├── pages/
│   ├── index.tsx          # Main dashboard UI
│   ├── _app.tsx           # Next.js app wrapper
│   └── api/
│       ├── race.ts        # Fetches + processes race data from OpenF1
│       └── sessions.ts    # Lists available races for a given year
├── components/
│   ├── LapChart.tsx       # Plotly lap time chart
│   └── DriverCard.tsx     # Driver summary card
├── lib/
│   ├── openf1.ts          # OpenF1 API client (typed fetch helpers)
│   └── utils.ts           # Data processing + tyre colours
├── next.config.js
├── vercel.json            # Function timeout config
└── package.json
```

## How it works

1. User selects year → `/api/sessions` fetches available races from OpenF1
2. User clicks LOAD RACE → `/api/race` fetches laps, stints, pit stops, race control in parallel
3. Data is processed in TypeScript (rolling averages, SC/VSC detection, stint mapping)
4. Plotly chart renders lap-by-lap with tyre colours, SC/VSC bands, and pit annotations
5. Vercel caches race responses for 24h — repeat loads are instant
