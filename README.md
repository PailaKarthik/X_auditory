# X — Auditory Assistance App

## [ppt](https://docs.google.com/presentation/d/15ykP-vZO97ayA3Wj1sLC4345U7iVbVa5/edit?usp=sharing&ouid=115615109419150803508&rtpof=true&sd=true)
## [figma Design](https://www.figma.com/make/o2aCjW61ecRPD8ve4q4Nrc/Complete-current-task?fullscreen=1&t=pbKXsHf535th7ZIw-1&code-node-id=0-6)

A three-tier prototype of **X**, an auditory assistance system for deaf and
hard-of-hearing users. X listens to the environment, recognises the sounds that
matter in the user's current context, and surfaces them as visual alerts with a
direction, a confidence score and an attention level.

The repository contains the complete working system: an Expo/React Native app, a
Node + Express + MongoDB API, and a Python inference service running the Hugging
Face **AST** model (`MIT/ast-finetuned-audioset-10-10-0.4593`) over the AudioSet
class vocabulary.

```
mobile (Expo)  ──►  server (Express + MongoDB)  ──►  model_service (FastAPI + AST)
   alerts, modes,        modes, catalog,                audio ─► ranked
   captions, history     detections, history            AudioSet classes
```

---

## Table of contents

- [Features](#features)
- [Technologies used](#technologies-used)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the project](#running-the-project)
- [How a sound becomes an alert](#how-a-sound-becomes-an-alert)
- [Event vocabulary](#event-vocabulary)
- [Modes](#modes)
- [Conversation mode](#conversation-mode)
- [API reference](#api-reference)
- [Testing the pipeline](#testing-the-pipeline)
- [Configuration reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Design source](#design-source)

---

## Features

**Sound detection**
- Recognises **17 sound events** across five categories — home, environment,
  emergency, transport and speech — using a real audio-classification model, not a
  keyword list.
- Every detection carries a **confidence score**, an **attention level**
  (low / medium / high / critical), a **direction**, and the raw model label.
- A confidence floor (`MIN_CONFIDENCE`) keeps weak guesses out of the history.

**Context modes**
- Seven built-in modes — Environment, Travel, Emergency, Home,
  Classroom / Meeting, Public and Conversation — each with its own set of enabled
  events and per-event attention levels.
- Exactly one mode is active at a time; a detection only alerts if the active mode
  listens for it.
- **Custom modes** can be created, renamed, activated and deleted from the app and
  behave identically to the built-ins.
- Per-event toggles for *enabled* and *phone notification*, applied optimistically
  so the UI never waits on a network round trip.

**Conversation mode (live captions)**
- Real-time speech-to-text using the device's native recogniser, with **six
  languages** (English US/IN, Hindi, Telugu, Tamil, Spanish).
- Finalised utterances accumulate as a transcript; interim text is shown
  distinctly; the recogniser self-restarts through natural pauses.
- Transcripts sync to the API in the background and never block captioning.
- Critical alerts (fire alarm, siren, emergency alarm) still come through while
  captioning.

**History and diagnostics**
- Chronological detection history with per-event detail screens showing the raw
  AudioSet label behind every alert.
- Device screen with connection/battery state and an analytics view.
- Every detection response reports per-stage `timings`, a `trace`, and a `reason`
  naming exactly which stage suppressed a non-alert.
- `GET /api/v1/health/full` verifies MongoDB, the model service and the
  label→key contract in a single call.

**Directional listening (prototype)**
- A 12-point clock-face direction picker. Direction is supplied as a request field
  to simulate the future X microphone array; the model itself only classifies the
  sound event.

---

## Technologies used

| Layer | Technology |
| --- | --- |
| Mobile | Expo SDK 57, React Native 0.86, React 19, TypeScript |
| Navigation | Expo Router (file-based) |
| Styling | react-native-unistyles 3.3 (Nitro Modules), Reanimated 4, Outfit font |
| Speech | expo-speech-recognition (native on-device / networked STT) |
| API | Node.js, Express 5, TypeScript, tsx |
| Database | MongoDB with Mongoose 8 |
| Uploads | Multer 2 |
| Inference | Python 3.12, FastAPI, Uvicorn |
| Model | Hugging Face Transformers — `MIT/ast-finetuned-audioset-10-10-0.4593` |
| Audio | PyTorch 2.8, librosa, soundfile, numpy |
| API testing | Postman collection (`postman/`) |

---

## Project structure

```
x-auditory-app/
├── mobile/                   Expo React Native app
│   ├── app/                  Expo Router screens
│   │   ├── (tabs)/           Home, History, Modes, Device
│   │   ├── conversation.tsx  Live captions
│   │   ├── observe.tsx       Directional listening
│   │   ├── analytics.tsx     Usage analytics
│   │   ├── event/[id].tsx    Detection detail
│   │   ├── modes/[id].tsx    Mode detail + toggles
│   │   └── custom/create.tsx Custom mode creation
│   └── src/
│       ├── components/       AppShell, BottomNav, Toggle, EventIcon, …
│       ├── services/api.ts   Typed API client
│       ├── state/            AppContext (modes, detections, polling)
│       └── utils/            Shared styles and constants
├── server/                   Express + MongoDB API
│   └── src/
│       ├── routes/           modes, detections, stt, device
│       ├── models/           Mode, Detection, Device, SttEvent
│       ├── services/         seed.ts, modelClient.ts
│       ├── utils/catalog.ts  Event vocabulary (single source of truth)
│       └── server.ts         App bootstrap, health, DNS retry
├── model_service/            FastAPI audio inference
│   ├── main.py               AST model, /predict /health /catalog
│   ├── requirements.txt
│   └── run.ps1 / run.bat     venv-safe launchers
├── postman/                  Postman collection
└── docs/IMPLEMENTATION.md    Design notes and boundaries
```

---

## Prerequisites

- **Node.js 20+** and npm
- **Python 3.12** (3.14 also verified) with `pip`
- **MongoDB** — a local `mongod` or a MongoDB Atlas cluster
- **~500 MB free disk** for the AST model weights (downloaded on first run)
- For a native Android build: **Android Studio + Android SDK**

---

## Setup

Clone the repository, then set up each of the three services.

### 1. Model service

```bash
cd model_service
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt    # Windows
# source .venv/bin/activate && pip install -r requirements.txt # macOS/Linux
```

The launcher scripts do this for you if the venv is missing.

### 2. API server

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```ini
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/x_auditory
MODEL_SERVICE_URL=http://127.0.0.1:8020
CLIENT_ORIGIN=http://localhost:8081
MIN_CONFIDENCE=0.05
```

> Using Atlas? Include a database name in the URI — without one Mongoose silently
> writes to `test`:
> `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/x_auditory?retryWrites=true&w=majority`

Modes, the event catalog and the demo device are **seeded automatically on boot**,
and reconciled against the catalog on every restart.

### 3. Mobile app

```bash
cd mobile
npm install
cp .env.example .env
```

Set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` for your target:

| Target | Value |
| --- | --- |
| Expo Web / iOS simulator | `http://localhost:4000/api/v1` |
| Android emulator | `http://10.0.2.2:4000/api/v1` |
| Physical phone (same LAN) | `http://<your-lan-ip>:4000/api/v1` |

---

## Running the project

Start the three services **in this order**, each in its own terminal:

```bash
# 1. Model service — :8020  (wait for "Application startup complete")
cd model_service && ./run.ps1                  # Windows PowerShell
cd model_service && ./run.bat                  # Windows cmd
cd model_service && .venv/bin/python main.py   # macOS/Linux

# 2. API server — :4000
cd server && npm run dev

# 3. Mobile app — :8081
cd mobile && npx expo run:android              # native dev build (recommended)
cd mobile && npx expo start --web              # browser
```

Verify everything is wired up:

```bash
curl http://localhost:4000/api/v1/health/full
```

### The app cannot run in Expo Go

`react-native-unistyles` 3 is built on Nitro Modules (native code), so Expo Go
cannot load it. Use a **development build** (`expo run:android` / `expo run:ios`)
or **Expo Web**. Live captions need the native recogniser, so Conversation mode is
a dev-build feature.

On Windows, if an all-ABI Android debug build fails inside Reanimated, build the
single ABI the emulator needs:

```bash
cd mobile/android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64
```

### Available scripts

| Directory | Command | Purpose |
| --- | --- | --- |
| `server` | `npm run dev` | Start the API with watch/reload |
| `server` | `npm start` | Start the API once |
| `server` | `npm run typecheck` | TypeScript check |
| `mobile` | `npm start` | Expo dev server |
| `mobile` | `npm run android` / `npm run ios` | Native dev build |
| `mobile` | `npm run web` | Expo Web |
| `mobile` | `npm run typecheck` | TypeScript check |

---

## How a sound becomes an alert

```
audio ──► Express ──► model service ──► ranked watched labels
                                             │
                                     candidates[0]  (only the first item is used)
                                             │
                           eventKey ──► active mode's toggle
                                             │
               off ──► suppressed (reason reported)   on ──► persisted + notified
```

The model returns the top 10 **watched** classes ranked by score; `candidates[0]`
is the reported event. It also returns `topOverall` — the unfiltered top 10 across
all 527 AudioSet classes — so a non-match can be diagnosed from the response
itself.

A detection is persisted and raises a notification **only** when all of these hold:

1. it matches a catalog `eventKey`,
2. that event is **enabled** in the *active* mode,
3. its confidence clears `MIN_CONFIDENCE`, and
4. the event's `phoneNotification` switch is on — this gates the banner only; the
   detection is still recorded.

Every other outcome names the stage that decided it:

| `reason` | Meaning |
| --- | --- |
| `missing_audio` | no `audio` form field |
| `no_active_mode` | no mode is active |
| `unmatched_event` | model label outside the catalog (see `topOverall`) |
| `event_not_in_mode` | mode predates the event; restart the server to reconcile |
| `event_not_enabled` | the toggle is off in the active mode |
| `low_confidence` | below `MIN_CONFIDENCE` (candidates included) |
| `timeout` / `connect` | model service slow or not running |

A successful call:

```json
{
  "success": true,
  "stage": "complete",
  "data": {
    "event": "speech", "modelLabel": "Speech", "label": "Speech",
    "direction": "10_o_clock", "confidence": 0.8191,
    "attention": "high", "mode": "Conversation", "notify": true
  },
  "timings": { "activeModeMs": 159, "modelMs": 1358, "persistMs": 75, "totalMs": 1593 },
  "trace": ["upload", "active_mode", "model", "catalog_match", "mode_setting", "persist"]
}
```

---

## Event vocabulary

The model emits **AudioSet class names**. An `eventKey` is that exact string,
slugified by one rule applied identically on both sides:

```
lowercase ─► collapse every non-alphanumeric run to "_" ─► trim
"Baby cry, infant cry"  ─►  baby_cry_infant_cry
```

`model_service/main.py` (`slugify_model_label`) and `server/src/utils/catalog.ts`
(`slugifyModelLabel`) implement the same rule, so *label → key* is a total function
and a prediction can never land on a toggle that does not exist. On boot the model
service resolves every watched label against `model.config.id2label` and logs any
that are missing, so vocabulary drift is loud rather than silent.

| Model label (AudioSet) | eventKey | Shown in app | Category |
| --- | --- | --- | --- |
| `Baby cry, infant cry` | `baby_cry_infant_cry` | Baby Crying | home |
| `Doorbell` | `doorbell` | Doorbell | home |
| `Knock` | `knock` | Knock | home |
| `Bark` | `bark` | Dog Barking | environment |
| `Thunder` | `thunder` | Thunder | environment |
| `Rain` | `rain` | Rain | environment |
| `Fire alarm` | `fire_alarm` | Fire Alarm | emergency |
| `Siren` | `siren` | Siren | emergency |
| `Alarm` | `alarm` | Emergency Alarm | emergency |
| `Glass` | `glass` | Glass | emergency |
| `Breaking` | `breaking` | Breaking | emergency |
| `Vehicle` | `vehicle` | Vehicle | transport |
| `Vehicle horn, car horn, honking` | `vehicle_horn_car_horn_honking` | Car Horn | transport |
| `Motorcycle` | `motorcycle` | Motorcycle | transport |
| `Train` | `train` | Train | transport |
| `Bicycle bell` | `bicycle_bell` | Bicycle Bell | transport |
| `Speech` | `speech` | Speech | speech |

AudioSet has no `Emergency alarm` class; `Alarm` is its generic klaxon class and is
what the UI presents as "Emergency Alarm". Each mode's detail screen prints the raw
model label under every toggle, so the mapping is visible in the app itself.

---

## Modes

| Mode | Focus |
| --- | --- |
| Environment | Understand surroundings |
| Travel | Traffic and mobility alerts |
| Emergency | Critical safety events |
| Home | Home sound alerts |
| Classroom / Meeting | Speech and room alerts |
| Public | Public announcements and events |
| Conversation | Live speech-to-text with critical alerts |

Seeding is idempotent and reconciles every existing mode against the catalog on each
boot, so a vocabulary change never leaves stale keys behind. Custom profiles created
from the Modes tab behave identically to the built-ins.

---

## Conversation mode

`Conversation` is a real, activatable mode — speech at high attention, with fire
alarm, siren and emergency alarm still coming through as critical — not just a
screen.

Live captions use **`expo-speech-recognition`**, the platform's native recogniser,
so dictation works on a **development build on a real device**. Android ends a
recognition session at every pause and reports it as an error; the screen treats
those as transient, backs off on repeated failures, and falls back to the on-device
recogniser if the networked one fails. Six languages are selectable at runtime.

> **Emulators cannot do speech-to-text here.** The Android emulator's microphone
> delivers digital silence, so no recogniser will produce a transcript. Test
> Conversation mode on a physical device.

---

## API reference

Base URL: `http://localhost:4000/api/v1`

**Health**
- `GET /health` — liveness
- `GET /health/full` — MongoDB + model service + label→key contract

**Modes**
- `GET /modes` — all modes for the demo user
- `GET /modes/catalog` — the 17-event catalog
- `GET /modes/:id`
- `PATCH /modes/:id/events/:eventKey` — toggle `enabled` / `phoneNotification` / attention
- `POST /modes/active` — activate a mode
- `POST /modes/custom` — create a custom mode
- `PATCH /modes/:id` — rename
- `DELETE /modes/:id`

**Detections**
- `GET /detections` — history (`?since=<iso>` for incremental polling)
- `GET /detections/:id`
- `POST /detections/audio` — multipart upload, runs the full pipeline
- `POST /detections/simulate` — inject an event without an audio file
- `GET /detections/meta/directions`

**Speech-to-text**
- `GET /stt` — saved transcripts
- `POST /stt` — persist a finalised utterance

**Device**
- `GET /device`, `PATCH /device`, `GET /device/analytics`

A ready-made Postman collection is in
[postman/X-Auditory.postman_collection.json](postman/X-Auditory.postman_collection.json).

---

## Testing the pipeline

**Without an audio file:**

```bash
curl -X POST http://localhost:4000/api/v1/detections/simulate \
  -H "Content-Type: application/json" \
  -d '{"eventKey":"baby_cry_infant_cry","direction":"7_o_clock"}'
```

`eventKey` also accepts the raw model label (`"Baby cry, infant cry"`).

**With an audio file** — `POST http://localhost:4000/api/v1/detections/audio`,
`multipart/form-data`:

| Field | Value |
| --- | --- |
| `audio` | the audio file |
| `direction` | `7_o_clock` (optional; simulated for the no-hardware prototype) |

---

## Configuration reference

### `server/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/x_auditory` | Mongo connection string |
| `MODEL_SERVICE_URL` | `http://127.0.0.1:8020` | Inference service |
| `CLIENT_ORIGIN` | `http://localhost:8081` | CORS origin |
| `DEMO_USER_ID` | `demo-user` | Owner of seeded data |
| `DNS_SERVERS` | `8.8.8.8,1.1.1.1` | Fallback resolvers for `mongodb+srv://` |
| `MODEL_TIMEOUT_MS` | `30000` | Abandon a model call, report `stage=model:timeout` |
| `MAX_AUDIO_BYTES` | `26214400` | Upload size limit (bytes) |
| `MIN_CONFIDENCE` | `0.05` | Below this: `reason=low_confidence`, not persisted |
| `SLOW_REQUEST_MS` | `400` | Log any request slower than this |

### `mobile/.env`

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | API base URL for the current target |

### `model_service`

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8020` | Service port |
| `TOP_K` | `10` | Candidates returned per prediction |

---

## Troubleshooting

**`Cannot find module 'babel-preset-expo'`**
`babel-preset-expo` is pinned as a direct devDependency because npm otherwise nests
it under `node_modules/expo/`, where Babel cannot resolve it from the project root.
Reinstall in `mobile/` rather than removing the pin.

**Styles missing on a screen**
The Unistyles Babel plugin (`mobile/babel.config.js`) force-processes everything
under `app/`, plus any file importing the shared stylesheet via `autoProcessImports`.
A new component outside both needs to be added there.

**`querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net`**
Some local resolvers (VPNs, or a stub resolver on `127.0.0.1`) refuse the DNS SRV
lookup that `mongodb+srv://` requires. `server/src/server.ts` retries once against
public resolvers; change them with `DNS_SERVERS`.

**Detections land in the wrong database**
Add a database name to `MONGODB_URI` — without one Mongoose writes to `test`.

**Model service exits at startup**
If port 8020 is taken, the service exits naming the conflicting process rather than
a raw `winerror 10048`. Free the port or set `PORT=<free port>` (and update
`MODEL_SERVICE_URL` in `server/.env`).

**First run is slow**
The first start downloads ~500 MB of AST weights into the Hugging Face cache. On
boot the service logs `watching 17/17 AudioSet classes`; anything less names the
missing labels.

**No transcript in Conversation mode**
You are almost certainly on an emulator — its microphone delivers digital silence.
Use a physical device with a development build.

**Latency**
MongoDB Atlas is a remote hop, so every query costs 100–400 ms. The app is built
around that: it loads once, then polls only `GET /detections?since=…`, and applies
mode and toggle changes optimistically so the UI never waits on a round trip.

---

## Design source

The requested Figma Make file is the intended visual reference, but its access
permissions did not allow the design context API to read it. The implementation
therefore follows the complete UI specification from the project brief rather than
inventing a different product structure. When editor access is available, the
screens can be pixel-matched against the Figma file.

Further engineering notes — the model boundary, the real-time decision path, and
why direction is simulated — are in [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).
