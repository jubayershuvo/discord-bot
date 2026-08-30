import { Schema, model } from "mongoose";

// ======================================================
// GUILD CONFIG
// One document per Discord server (multi-tenant, keyed on guild_id)
// ======================================================

const guildConfigSchema = new Schema(
    {
        guild_id: { type: String, required: true, unique: true, index: true },
        guild_name: { type: String, default: null },
        guild_icon: { type: String, default: null },

        welcome_enabled: { type: Boolean, default: false },
        welcome_channel: { type: String, default: null },
        welcome_message: { type: String, default: null },

        default_role: { type: String, default: null },

        verification_enabled: { type: Boolean, default: false },
        verification_channel: { type: String, default: null },
        verification_role: { type: String, default: null },

        leave_channel: { type: String, default: null },
        ban_channel: { type: String, default: null },

        ticket_system_enabled: { type: Boolean, default: false },
        support_role_id: { type: String, default: null },
        ticket_category_id: { type: String, default: null },
        ticket_channel_id: { type: String, default: null },
        ticket_panel_message_id: { type: String, default: null },
        // Managed only via atomic $inc (see incrementTicketCounter) — never
        // written through the generic updateConfig whitelist.
        ticket_counter: { type: Number, default: 0 }
    },
    { timestamps: true }
);

export const GuildConfig = model("GuildConfig", guildConfigSchema);

// ======================================================
// TICKET
// One document per open/closed support ticket. Used to enforce
// "one open ticket per user per guild" and to look up which ticket
// a given channel belongs to.
// ======================================================

const ticketSchema = new Schema(
    {
        guild_id: { type: String, required: true, index: true },
        channel_id: { type: String, required: true, unique: true, index: true },
        owner_id: { type: String, required: true },
        ticket_number: { type: Number, required: true },
        status: { type: String, enum: ["open", "closed"], default: "open" },
        created_at: { type: Date, default: Date.now },
        closed_at: { type: Date, default: null }
    },
    { timestamps: true }
);

// Fast lookup for "does this user already have an open ticket in this guild?"
ticketSchema.index({ guild_id: 1, owner_id: 1, status: 1 });

export const Ticket = model("Ticket", ticketSchema);

// ======================================================
// OAUTH STATE
// Short-lived CSRF state tokens for the verification OAuth2 flow.
// TTL-indexed so Mongo auto-deletes expired/used states — no cleanup job needed.
// ======================================================

const oauthStateSchema = new Schema({
    state: { type: String, required: true, unique: true, index: true },
    guild_id: { type: String, required: true },
    verification_channel_id: { type: String, default: null },
    welcome_channel_id: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    expires_at: {
        type: Date,
        required: true,
        // TTL index: MongoDB removes the document once expires_at is in the past
        index: { expires: 0 }
    }
});

export const OAuthState = model("OAuthState", oauthStateSchema);

// ======================================================
// AUTHORIZED USER
// Discord users who have completed OAuth2 verification, keyed globally
// on their Discord user id (a user only ever has one record).
// ======================================================

const authorizedUserSchema = new Schema(
    {
        discord_user_id: { type: String, required: true, unique: true, index: true },
        username: { type: String, default: null },
        global_name: { type: String, default: null },
        avatar: { type: String, default: null },

        access_token: { type: String, required: true },
        refresh_token: { type: String, default: null },
        expires_at: { type: Number, required: true },

        source_guild_id: { type: String, required: true },
        authorized_at: { type: Number, required: true }
    },
    { timestamps: true }
);

export const AuthorizedUser = model("AuthorizedUser", authorizedUserSchema);
