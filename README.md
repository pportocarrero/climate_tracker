# ENSO Viewer

A free, open-source climate dashboard for monitoring El Niño / La Niña conditions in real time.

Displays SST anomalies, trade winds, and the four Niño regions (1+2, 3, 3.4, 4) on an interactive WebGL globe — updated daily from NOAA open data.

## Stack (100% free tier)

| Layer | Service |
|---|---|
| Data source | NOAA OPeNDAP (ERSSTv5) |
| Processing | GitHub Actions (cron, daily) |
| Tile storage | GitHub Releases |
| Frontend | React + Deck.gl (WebGL) |
| Hosting | Firebase Hosting (Spark) |
| Auth | Firebase Auth — Google Sign-In |
| User state | Firestore (Spark) |

## Repo structure

```
enso-viewer/
├── .github/
│   └── workflows/
│       ├── pipeline.yml      # Daily data processing + tile upload
│       └── deploy.yml        # Deploy web app to Firebase on push to main
├── pipeline/
│   ├── requirements.txt
│   ├── build_climo.py        # One-time: bake 1991–2020 climatology baseline
│   └── process.py            # Daily worker: download → anomaly → tiles
├── web/
│   ├── public/
│   │   ├── manifest.json
│   │   └── enso-zones.geojson
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── types/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── firebase.ts
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── firebase.json
├── firestore.rules
├── .firebaserc
└── .gitignore
```

## Setup

### Prerequisites
- Node.js 20+
- Python 3.11+
- Firebase CLI: `npm install -g firebase-tools`

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/enso-viewer.git
cd enso-viewer
cd web && npm install && cd ..
cd pipeline && pip install -r requirements.txt && cd ..
```

### 2. Build the climatology baseline (one-time)
```bash
cd pipeline
python build_climo.py
# Produces climo_1991_2020.nc — commit this to Git LFS
```

### 3. Run the pipeline locally
```bash
cd pipeline
python process.py --local
# Outputs tiles to pipeline/output/
```

### 4. Run the web app locally
```bash
cd web
cp .env.example .env.local   # fill in your Firebase config
npm run dev
```

### 5. Deploy
Push to `main` — GitHub Actions handles both the daily pipeline and Firebase deploy automatically.

## GitHub Secrets required
- `GH_TOKEN` — Personal access token with `repo` scope
- `FIREBASE_TOKEN` — From `firebase login:ci`
- `FIREBASE_CONFIG` — JSON config blob from Firebase console

## License
MIT
