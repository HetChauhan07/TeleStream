# ⚡ TeleStream

A private, self-hosted Netflix-style media streaming app that uses **Telegram as unlimited storage** and **Node.js** as a streaming proxy.

## Architecture

```
┌──────────────┐     HTTP 206      ┌──────────────────┐     MTProto     ┌──────────────────┐
│  React App   │ ◄────────────────► │  Express Server  │ ◄─────────────► │ Telegram Channel │
│  (Vite)      │    /api/stream     │  (Node.js)       │   iterDownload  │ (Private)        │
│  :5173       │                    │  :8000           │                  │                  │
└──────────────┘                    └──────────┬───────┘                  └──────────────────┘
                                               │
                                    ┌──────────▼───────┐
                                    │    MongoDB       │
                                    │  (Metadata +     │
                                    │   Watch Progress)│
                                    └──────────────────┘
```

## Features

- 🎬 **Telegram CDN** — Store movies in a private Telegram channel (up to 4GB per file)
- 🎥 **HTTP 206 Streaming** — Seek to any position instantly (no full download required)
- 🎭 **TMDB Metadata** — Auto-fetches posters, ratings, cast, and more
- 📊 **Watch Progress** — Resume from where you left off
- 🔍 **Search & Filter** — Browse by genre, sort by rating/date/title
- 🌙 **Premium Dark UI** — Netflix/Jellyfin-style glassmorphism design

## Prerequisites

- **Node.js** v18+
- **MongoDB** running locally or an Atlas connection string
- **Telegram API ID & Hash** from [my.telegram.org](https://my.telegram.org)
- **TMDB API Key** from [themoviedb.org](https://www.themoviedb.org/settings/api) (free)
- A **private Telegram channel** with video files uploaded

## Setup

### 1. Clone & Install

```bash
# Server
cd server
cp .env.example .env
# Fill in your API keys in .env
npm install

# Client
cd ../client
npm install
```

### 2. Configure Environment

Edit `server/.env` with your credentials:

```env
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=0123456789abcdef0123456789abcdef
TELEGRAM_CHANNEL_ID=-1001234567890
TELEGRAM_SESSION=
MONGODB_URI=mongodb://localhost:27017/telestream
TMDB_API_KEY=your_tmdb_api_key
PORT=8000
```

### 3. First Run (Telegram Auth)

```bash
cd server
npm run dev
```

On the first run, you'll be prompted in the terminal to:
1. Enter your phone number
2. Enter the OTP code received on Telegram
3. Enter 2FA password (if enabled)

The session string will be printed — **copy it into your `.env` as `TELEGRAM_SESSION`**.

### 4. Start the Client

```bash
cd client
npm run dev
```

Open **http://localhost:5173** in your browser.

### 5. Index Your Channel

Click the **"Sync"** button in the navbar (or POST to `/api/index`) to scan your Telegram channel and import movies.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/library` | List all movies (supports `?q=`, `?genre=`, `?sort=`) |
| GET | `/api/library/genres` | Get all unique genres |
| GET | `/api/library/:id` | Get single movie detail |
| GET | `/api/stream/:id` | Stream video (supports Range headers) |
| GET | `/api/progress/:mediaId` | Get watch progress |
| PUT | `/api/progress/:mediaId` | Update watch progress |
| GET | `/api/progress/continue` | Get "continue watching" list |
| POST | `/api/index` | Trigger channel re-index |
| GET | `/api/health` | Health check |

## Usage Tips

1. **File naming matters**: Name your videos like `Inception (2010) 1080p.mp4` for best TMDB matching
2. **Use the channel caption**: You can set the message caption as the movie title
3. **Large files**: Telegram Premium allows up to 4GB per file
4. **Seek performance**: First seek may take 1-2s as MTProto establishes the download offset

## Tech Stack

- **Backend**: Node.js, Express, GramJS (Telegram MTProto), Mongoose
- **Frontend**: React 18, Vite, React Router, Axios
- **Database**: MongoDB
- **APIs**: TMDB v3, Telegram MTProto
