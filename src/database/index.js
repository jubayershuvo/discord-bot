import { connectDatabase } from "./connection.js";
import { GuildConfig, OAuthState, AuthorizedUser } from "./models.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const CONFIG_FIELDS = [
    "welcome_enabled",
    "welcome_channel",
    "welcome_message",
    "default_role",
    "verification_enabled",
    "verification_channel",
    "verification_role",
    "leave_channel",
    "ban_channel"
];

// ======================================================
// GUILD CONFIG
// ======================================================

/**
 * Fetches a guild's config, creating a default one if it doesn't exist yet.
 * Always returns a plain object (never null) so callers can read fields
 * safely without extra guards.
 */
export async function getConfig(guildId) {
    let config = await GuildConfig.findOne({ guild_id: guildId }).lean();

    if (!config) {
        const created = await GuildConfig.create({ guild_id: guildId });
        config = created.toObject();
    }

    return config;
}

/**
 * Updates only the whitelisted config fields for a guild. Creates the
 * guild's config document first if needed.
 */
export async function updateConfig(guildId, data) {
    const update = {};

    for (const key of CONFIG_FIELDS) {
        if (data[key] !== undefined) {
            update[key] = data[key];
        }
    }

    if (Object.keys(update).length === 0) return;

    await GuildConfig.findOneAndUpdate(
        { guild_id: guildId },
        { $set: update },
        { upsert: true, new: true }
    );
}

/**
 * Upserts guild metadata (name/icon) whenever the bot joins a server or
 * that metadata changes. Called from guildCreate.
 */
export async function upsertGuild(guild) {
    await GuildConfig.findOneAndUpdate(
        { guild_id: guild.id },
        {
            $set: {
                guild_name: guild.name,
                guild_icon: guild.iconURL({ size: 128 }) || null
            }
        },
        { upsert: true, new: true }
    );
}

// ======================================================
// OAUTH STATE (verification CSRF tokens)
// ======================================================

export async function saveOAuthState(state, data) {
    await OAuthState.create({
        state,
        guild_id: data.guild_id,
        verification_channel_id: data.verification_channel_id || null,
        welcome_channel_id: data.welcome_channel_id || null,
        created_at: new Date(data.created_at || Date.now()),
        expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS)
    });
}

/**
 * Atomically fetches and deletes an OAuth state so it can only ever be
 * used once. Returns null if it doesn't exist or already expired.
 */
export async function consumeOAuthState(state) {
    const doc = await OAuthState.findOneAndDelete({ state }).lean();

    if (!doc) return null;

    return {
        guild_id: doc.guild_id,
        verification_channel_id: doc.verification_channel_id,
        welcome_channel_id: doc.welcome_channel_id,
        created_at: doc.created_at?.getTime?.() ?? Date.now()
    };
}

// ======================================================
// AUTHORIZED USERS
// ======================================================

export async function saveAuthorizedUser(user) {
    await AuthorizedUser.findOneAndUpdate(
        { discord_user_id: user.discord_user_id },
        { $set: user },
        { upsert: true, new: true }
    );
}

export async function getAuthorizedUser(discordUserId) {
    return AuthorizedUser.findOne({ discord_user_id: discordUserId }).lean();
}

export { connectDatabase };
