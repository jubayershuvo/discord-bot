# Discord Manager — Multi-Tenant Server Automation Bot

A multi-tenant Discord bot for welcome messages, OAuth2 member verification,
and join/leave/ban logging — rebuilt to run entirely on **MongoDB**. No SQLite
file, no local JSON files, no VPS disk state of any kind. Every server's
config, every OAuth session, and every verified user lives in your MongoDB
database, so the bot can run on any host (or be redeployed/scaled) without
losing data.

## What changed in this version

- **Pure ES modules** — `import`/`export` throughout, `"type": "module"` in `package.json`.
- **MongoDB only** — `better-sqlite3` and the local `bot.db`, `oauth_states.json`,
  and `authorized_users.json` files are gone. Everything now lives in three
  Mongoose collections: `guildconfigs`, `oauthstates` (TTL-expiring), and
  `authorizedusers`.
- **Multi-server safe** — every config document is keyed on `guild_id`, so any
  number of servers can use the bot concurrently without state collisions.
  Fixed a bug where the bot crashed on join because `saveGuild` wasn't
  exported from the old database module.
- **Professional embeds** — every message (setup wizard, welcome, leave, ban,
  verification) uses a shared embed builder with consistent branding, colors,
  timestamps, footers, and a visual step progress bar in the setup wizard.
- **Ban log audit lookup** — ban notices now show who issued the ban when the
  bot has `View Audit Log` permission.

## Project structure

```
src/
  index.js                # Discord client + Express OAuth server, entry point
  database/
    connection.js         # Mongoose connection (MONGODB_URI)
    models.js              # GuildConfig / OAuthState (TTL) / AuthorizedUser schemas
    index.js                # All data-access functions the rest of the app calls
  commands/setup.js         # /setup slash command
  handlers/setupWizard.js   # Step-by-step setup wizard (buttons + select menus)
  events/
    memberAdd.js           # Default role + welcome embed
    memberRemove.js         # Leave log embed
    banAdd.js                # Ban log embed (+ audit log lookup)
  utils/embeds.js            # Shared embed styling / progress bar helper
```

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment variables** — copy `.env.example` to `.env` (your existing
   `.env` already has working values, including `MONGODB_URI`) and confirm:
   - `DISCORD_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET` — from the Discord Developer Portal
   - `VERIFY_REDIRECT_URI`, `DASHBOARD_REDIRECT_URI` — registered OAuth2 redirects
   - `MONGODB_URI` — your MongoDB connection string (Atlas or self-hosted)
   - `PORT`, `SESSION_SECRET`

3. **Run it**
   ```bash
   npm start
   ```
   On boot, the bot connects to MongoDB first, then starts the Express
   OAuth server, then logs into Discord — if MongoDB is unreachable, the
   bot won't start (fail-fast, rather than silently running with no storage).

## Cleaning up the old local files

Your uploaded project included `bot.db`, `tokens.json`, `oauth_states.json`,
and `authorized_users.json`. None of these are read or written anymore — you
can safely delete them from your deployment. They're listed in `.gitignore`
so they won't get committed if you still have them locally.

## Deploying without VPS storage

Because all state is in MongoDB, you can run this bot anywhere — a VPS, a
container platform, a serverless-friendly host, etc. — and even run multiple
instances behind a load balancer for the Express OAuth callback, since no
instance depends on local disk state.
