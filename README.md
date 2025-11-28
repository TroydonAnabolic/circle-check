# Circle Check

A free, privacy‑aware circle location sharing app built with **Expo Router**, **Supabase**, **react-native-maps**, and **(optional)** push radius alerts.  
Features include real-time location updates, circles (groups), opt‑in foreground/background sharing, and push notifications when a circle member enters your defined area.

---

## Table of Contents

1. Features Overview
2. Tech Stack & Services (All Free)
3. Quick Start
4. Environment Variables
5. Supabase Setup
6. Data Model
7. Location Sharing (Foreground + Background)
8. Radius Alert Push Notifications
9. Edge Function (notify-on-location)
10. Navigation Structure
11. Security & Privacy Considerations
12. Development Commands
13. Common Troubleshooting
14. Future Enhancements
15. License (optional)

---

## 1. Features Overview

| Feature                       | Description                                                |
| ----------------------------- | ---------------------------------------------------------- |
| Magic Link Auth               | Email-based login using Supabase Auth                      |
| Circles                       | Create circles (groups) and invite existing users by email |
| Foreground Sharing            | Updates every ~5s or ~5m (configurable) while app active   |
| Background Sharing (optional) | Persistent updates using Expo Task Manager                 |
| Real-Time Map                 | See circle members who have sharing enabled                |
| Directions                    | Open native navigation (Apple Maps / Google Maps)          |
| Push Radius Alerts (optional) | Notify when a circle member enters your defined area       |
| Realtime Sync                 | Supabase Realtime via Postgres changes on `locations`      |
| Single Location Row Per User  | Upsert pattern reduces storage & improves privacy          |

---

## 2. Tech Stack & Services (All Free)

- Expo SDK 52 (Managed workflow)
- Expo Router (navigation + tab layout)
- `expo-location` (foreground & background location)
- `expo-task-manager` (background updates)
- `expo-notifications` (push tokens + local handling)
- `react-native-maps` (map display)
- Supabase:
  - Auth (email magic links)
  - Postgres (data)
  - Realtime (location table change events)
  - Edge Functions (push radius alerts)
  - Row Level Security (privacy)

No paid APIs required. Directions use URL schemes, not billing-enabled Directions APIs.

---

## 3. Quick Start

```bash
# 1. Create project via Expo (if not done already)
npx create-expo-app circle-check --template expo-template-blank-typescript
cd circle-check

# 2. Install dependencies (base + background + notifications)
npx expo install expo-router expo-location react-native-maps expo-task-manager expo-notifications
npm install @supabase/supabase-js

# 3. Copy project files (app/, lib/, supabase/ schemas) from this repository.

# 4. Create environment file
cp .env.example .env
# Fill in Supabase URL + anon key

# 5. Start development
npx expo start
# For maps reliability (native modules):
npx expo run:ios
# or
npx expo run:android
```

---

## 4. Environment Variables

Create `.env` (NOT committed):

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

These are exposed at build time (public keys only). Never embed service role key in the app.

---

## 5. Supabase Setup

1. Create a Supabase project.
2. In SQL Editor:
   - Run `supabase/schema.sql` (base tables/policies/RPC).
   - Run `supabase/push_schema.sql` (push/radius-related tables/policies/RPC).
3. Enable Realtime:
   - Dashboard → Database → Replication → Realtime: enable for `public.locations`.
4. Auth:
   - Enable Email > “Magic Link”.
   - Add redirect: `circlecheck://index`.
5. Edge Function deployment (for push radius alerts):
   - Install CLI: `npm i -g supabase`
   - `supabase login`
   - `supabase link --project-ref <project-ref>`
   - Create & deploy (see Edge Function section below).
6. Set secrets for Edge Function:
   - `supabase secrets set SUPABASE_URL=https://YOUR-PROJECT.supabase.co`
   - `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY`
   - (Optional) `supabase secrets set HOOK_SECRET=<random-long-string>`

---

## 6. Data Model (Core Tables)

| Table                | Purpose                                | Notes                                    |
| -------------------- | -------------------------------------- | ---------------------------------------- |
| profiles             | User identity synced from `auth.users` | Trigger ensures auto creation            |
| circles              | Group container                        | Members join via `memberships`           |
| memberships          | Many-to-many user ↔ circle             | Compound PK `(circle_id, user_id)`       |
| locations            | Latest user location                   | One row per user (upsert on share)       |
| device_tokens        | Expo push tokens per device            | Used for notifications                   |
| radius_subscriptions | Alert definitions                      | Owner-defined center + radius            |
| entry_states         | Tracks inside/outside transitions      | Prevents duplicate “enter” notifications |

---

## 7. Location Sharing

### Foreground

- `watchPositionAsync` with:
  - `timeInterval: 5000 ms`
  - `distanceInterval: 5 m`
- Upsert row in `locations` using `user_id` conflict key.

### Background (Optional)

- Uses `startLocationUpdatesAsync` with a Task (`BACKGROUND_LOCATION_TASK`) defined in `lib/backgroundLocation.ts`.
- Suggested configuration:
  - `timeInterval: 60000 ms`
  - `distanceInterval: 25 m`
  - Accuracy: Balanced
  - Foreground service notification (Android)
  - iOS requires “Always” permission (user must elevate permission in Settings).

Disable background tracking when not needed to save battery.

---

## 8. Radius Alert Push Notifications (Optional)

User defines:

- Center (lat/lng) — typically “Use current location”.
- Radius in meters (10–100000).
- Enabled flag.

When any circle member moves:

1. Realtime webhook triggers Edge Function.
2. Edge Function calculates distance (Haversine).
3. Detects transition from outside → inside.
4. Sends Expo push messages to subscription owner’s registered device tokens.

---

## 9. Edge Function: `notify-on-location`

Location:

```
supabase/functions/notify-on-location/index.ts
```

Deploy:

```bash
supabase functions deploy notify-on-location
```

Realtime Webhook:

- Dashboard → Realtime → Webhooks → New Webhook
- Source: Postgres Changes
- Events: INSERT, UPDATE
- Schema: public
- Table: locations
- Endpoint: https://<project-ref>.functions.supabase.co/notify-on-location
- (Optional) Header: `x-hook-secret: <HOOK_SECRET>`

Logic:

- Calls RPC `get_relevant_radius_subscriptions(subject_user uuid)`
- Uses `entry_states` to prevent duplicate notifications
- Sends batch to Expo push API `https://exp.host/--/api/v2/push/send`

---

## 10. Navigation Structure

Expo Router + Tabs:

```
app/
  _layout.tsx        # Root stack (index, (tabs), auth)
  index.tsx          # Redirect gate (auth or /map)
  auth.tsx           # Magic-link login
  (tabs)/
    _layout.tsx      # Bottom tabs: Map, Circles, Profile
    map.tsx
    circle.tsx
    profile.tsx
```

- `index.tsx` auto redirects based on session state.
- Auth gating occurs both at root and tabs to prevent unauthorized access.

---

## 11. Security & Privacy Considerations

| Concern                          | Handling                                                              |
| -------------------------------- | --------------------------------------------------------------------- |
| Unauthorized data access         | Row Level Security (RLS) policies restrict operations to `auth.uid()` |
| Location overexposure            | Store only last known location (no history)                           |
| Background tracking transparency | Foreground service notification (Android) + indicator (iOS)           |
| Token misuse                     | Push tokens stored per user; service role key only in Edge function   |
| Circle membership                | Must be explicitly invited; users cannot enumerate non-circle users   |

Recommendations:

- Add an in-app disclosure before enabling background sharing.
- Allow user to “clear” their location (e.g., set row to NULL or delete).
- Consider IP logging / rate limiting in Edge Function for abuse mitigation.

---

## 12. Development Commands

| Action                                       | Command                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Start Metro                                  | `npx expo start`                                                                                                                         |
| iOS Simulator                                | `npx expo run:ios`                                                                                                                       |
| Android Emulator                             | `npx expo run:android`                                                                                                                   |
| Install all deps (base + notif + background) | `npx expo install expo-router expo-location react-native-maps expo-task-manager expo-notifications && npm install @supabase/supabase-js` |
| Deploy Edge Function                         | `supabase functions deploy notify-on-location`                                                                                           |
| List functions                               | `supabase functions list`                                                                                                                |

---

## 13. Common Troubleshooting

| Issue                            | Fix                                                                      |
| -------------------------------- | ------------------------------------------------------------------------ |
| Magic link doesn’t open app      | Check redirect URL `circlecheck://index` and scheme in `app.json`        |
| Blank map (Android release)      | Add Google Maps API key or switch to MapLibre                            |
| No location updates (background) | Ensure “Always” (iOS) / “Allow all the time” (Android) permissions       |
| No push notification             | Confirm device token stored in `device_tokens`; check Edge Function logs |
| Multiple duplicate push alerts   | Verify `entry_states` functioning; check webhook event storm             |
| Invite fails                     | Invited email user must sign in at least once so profile exists          |
| Realtime not updating map        | Enable replication / Realtime on `public.locations` table                |

---

## 14. Future Enhancements

- Multi-radius subscriptions UI + management screen
- “Exit” notifications (add second transition path)
- Cooldown timer per subscription (e.g., no repeat alerts within X minutes)
- Geofenced arrival banner inside app
- MapLibre + OSM fallback to remove any reliance on Google API key
- End-to-end encryption ideas (client-encrypted location blobs)
- Delete/disable account + purge location row
- Invite deep link (circle auto join after auth)

---

## 15. License (Optional)

Add a `LICENSE` file (MIT recommended):

```
MIT License

Copyright (c) ...

Permission is hereby granted, free of charge, to any person obtaining a copy...
```

---

## Quick Verification Checklist

1. Auth works (magic link returns to app)
2. Circle creation + invite functions
3. Foreground location updates appear in map
4. Background location updates after minimizing
5. Radius subscription saved (row exists)
6. Edge Function deployed + webhook configured
7. Push token stored (`device_tokens` table)
8. Moving a test user triggers “enter” push notification

---

## One-Line Install (Recap)

```bash
npx expo install expo-router expo-location react-native-maps expo-task-manager expo-notifications && npm install @supabase/supabase-js
```

---

If you need a walkthrough for EAS builds, multi-alert support, or adding cooldown logic, ask and I’ll extend this README. Happy building!
