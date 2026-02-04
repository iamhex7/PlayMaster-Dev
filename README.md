# YourTurn

<p align="center">
  <strong>An AI-Powered Tabletop Pilot</strong><br>
  <em>by FOMO Games</em>
</p>

<p align="center">
  Focus on the play, not the paperwork — it's <strong>YOUR TURN</strong> to enjoy the game.
</p>

---

## Overview

**YourTurn** transforms any board game into a seamless digital experience. Upload or paste your game rules, and our AI Host—powered by Google Gemini—parses them into a structured game engine. No more complex rulebooks, no more sacrificing a player to act as host. Create a room, share the code, and play together in seconds.

---

## Features

| Feature | Description |
|---------|-------------|
| **AI Rule Parsing** | Upload text, PDF, or paste rules. Gemini extracts roles, phases, win conditions, and opening scripts automatically. |
| **Room Sync** | Supabase Realtime keeps room state, player count, and briefing progress in sync across all devices. |
| **All-Ready Confirmation** | Players confirm they've read the rules; the game starts only when everyone is ready. |
| **Deterministic Role Distribution** | Seeded shuffle ensures fair, reproducible role assignment. No re-deals on refresh. |
| **Sample Games** | Built-in support for **Texas Hold'em**, **Undercover** (social deduction), and **Neon Heist** (roleplay). |
| **AI Game Master** | The AI orchestrates game flow, tracks resources, and delivers interactive prompts (SELECT, INPUT, CONFIRM, VIEW). |

---

## How to Use

### As a Player

1. **Start** — Click *START AI GAME* on the home screen. A 6-character room code is generated.
2. **Share** — Send the room code to friends. They enter it to join (no sign-up required).
3. **Choose a Game** — Pick a sample game or upload custom rules via the Host Console.
4. **Briefing** — Read the rules and click *I'm Ready* when done. Wait for everyone to confirm.
5. **Reveal Roles** — Flip your card to see your role or word. Click *Continue* to enter the game.
6. **Play** — Follow the AI Host's prompts. Make choices, enter values, or confirm actions as they appear.

### As a Host

- Use the **Host Console** (shown when no sample game is selected) to upload a `.docx`, `.pdf`, or `.png` rulebook, or paste rules directly.
- The AI parses the content and builds the game configuration. Once ready, the room moves to the briefing phase.

---

## Quick Start

### Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **Supabase** account
- **Google AI** (Gemini) API key

### 1. Clone & Install

```bash
git clone <repository-url>
cd YourTurn
npm install
```

### 2. Environment Variables

Create `.env.local` in the project root:

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Gemini (required for rule parsing)
GEMINI_KEY_1=your-google-ai-api-key

# Optional: higher-privilege Supabase access
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Supabase Setup

Run the SQL scripts in your Supabase project (SQL Editor):

| File | Purpose |
|------|---------|
| `supabase-rooms-table.sql` | Rooms table |
| `supabase-players-table.sql` | Players table |
| `supabase-rooms-player-count.sql` | Player count column |
| `supabase-briefing-ack-rpc.sql` | Atomic briefing-ack function (recommended) |

See [SUPABASE-SETUP.md](./SUPABASE-SETUP.md) for detailed instructions.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 14 (App Router) |
| **Database & Realtime** | Supabase (PostgreSQL + Realtime) |
| **AI** | Google Gemini API (`@google/generative-ai`) |
| **Styling** | Tailwind CSS |
| **Animation** | Framer Motion |
| **Icons** | Lucide React |

---

## Project Structure

```
YourTurn/
├── app/
│   ├── layout.js              # Root layout, metadata
│   ├── page.js                # Home: START AI GAME, SAMPLE GAMES, PLAYER GUIDE
│   ├── api/
│   │   ├── game/route.js      # Game API: enterRoom, parseRules, briefingAck, initializeGame, getMyRole, submitEvent
│   │   └── debug-logs/        # Debug log polling (dev)
│   └── room/[roomCode]/
│       ├── page.js            # Lobby / Host Console
│       ├── briefing/page.js   # Rules briefing, I'm Ready
│       └── role/page.js       # Role reveal, in-game view
├── components/
│   ├── game/                  # InGameView, ActionCard, DebugPanel
│   ├── ui/                    # BigActionButton
│   ├── HowToPlayModal.js      # Player guide
│   ├── SampleGamesFlip.js     # Sample game picker
│   └── AnnouncementView.js     # Full-screen opening speech
├── lib/
│   ├── gemini.js              # Rule parsing, AI calls
│   ├── gemini/                # GM engine, agent, initializer
│   ├── dealer.js              # Deterministic deal, Among Us word pairs
│   ├── game-schema.js         # Schema validation
│   ├── game-state-mapper.js   # Map raw state for UI
│   ├── poker-evaluator.js     # Texas Hold'em hand ranking
│   ├── constants.js           # Sample games config
│   └── supabase.js            # Supabase client
├── supabase-*.sql             # Database scripts
└── SUPABASE-SETUP.md          # Supabase setup guide
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Sample Games

| Game | Players | Description |
|------|---------|-------------|
| **Texas Hold'em** | 1–10 | Classic poker. Fold, check, call, or raise. Deterministic AI handles phases and showdown. |
| **Undercover** | 4–12 | Social deduction. Civilians share a word; spies get a similar one. Describe and vote to find the spy. |
| **Neon Heist** | 3–5 | Roleplay heist. Hacker, Bodyguard, Fixer. Infiltrate, crack the vault, extract. |

---

## License

This project is private. All rights reserved by FOMO Games.

---

<p align="center">
  <strong>YourTurn</strong> — An AI-Powered Tabletop Pilot by <strong>FOMO Games</strong>
</p>
