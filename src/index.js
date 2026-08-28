import "dotenv/config";

import express from "express";
import crypto from "crypto";

import {
    Client,
    GatewayIntentBits,
    Collection,
    REST,
    Routes
} from "discord.js";

import setupCommand from "./commands/setup.js";
import * as wizard from "./handlers/setupWizard.js";

import memberAdd from "./events/memberAdd.js";
import memberRemove from "./events/memberRemove.js";
import banAdd from "./events/banAdd.js";

import {
    connectDatabase,
    getConfig,
    upsertGuild,
    saveOAuthState,
    consumeOAuthState,
    saveAuthorizedUser
} from "./database/index.js";

// ======================================================
// DISCORD CLIENT
// ======================================================

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.commands = new Collection();
client.commands.set(setupCommand.data.name, setupCommand);

// ======================================================
// EXPRESS SERVER
// ======================================================

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
            body: [setupCommand.data.toJSON()]
        });

        console.log("✅ Slash commands registered");
    } catch (error) {
        console.error("❌ Failed to register commands:", error);
    }
});

// ======================================================
// BOT INTERACTIONS
// ======================================================

client.on("interactionCreate", async (interaction) => {
    try {
        // ==================================================
        // SLASH COMMANDS
        // ==================================================

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);

                const payload = {
                    content: "❌ Something went wrong.",
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(payload).catch(() => {});
                } else {
                    await interaction.reply(payload).catch(() => {});
                }
            }

            return;
        }

        // ==================================================
        // BUTTONS
        // ==================================================

        if (interaction.isButton()) {
            switch (interaction.customId) {
                case "setup_start":
                    return wizard.startSetup(interaction);

                case "welcome_enable":
                    return wizard.welcomeChoice(interaction, true);

                case "welcome_disable":
                    return wizard.welcomeChoice(interaction, false);

                case "verification_enable":
                    return wizard.verificationChoice(interaction, true);

                case "verification_disable":
                    return wizard.verificationChoice(interaction, false);

                case "verify_user":
                    return handleVerification(interaction);
            }

            return;
        }

        // ==================================================
        // CHANNEL SELECT MENUS
        // ==================================================

        if (interaction.isChannelSelectMenu()) {
            switch (interaction.customId) {
                case "welcome_channel":
                    return wizard.welcomeChannel(interaction);

                case "verification_channel":
                    return wizard.verificationChannel(interaction);

                case "leave_channel":
                    return wizard.leaveChannel(interaction);

                case "ban_channel":
                    return wizard.banChannel(interaction);
            }

            return;
        }

        // ==================================================
        // ROLE SELECT MENUS
        // ==================================================

        if (interaction.isRoleSelectMenu()) {
            switch (interaction.customId) {
                case "default_role":
                    return wizard.defaultRole(interaction);

                case "verification_role":
                    return wizard.verificationRole(interaction);
            }
        }
    } catch (error) {
        console.error("❌ Unhandled interaction error:", error);
    }
});

// ======================================================
// VERIFICATION BUTTON
// ======================================================

async function handleVerification(interaction) {
    if (!interaction.guild) {
        return interaction.reply({
            content: "❌ Verification can only be used inside a server.",
            ephemeral: true
        });
    }

    const guildId = interaction.guild.id;
    const verificationChannelId = interaction.channel?.id;

    const config = await getConfig(guildId);

    if (!config.verification_enabled) {
        return interaction.reply({
            content: "❌ Verification is currently disabled.",
            ephemeral: true
        });
    }

    if (!config.verification_role) {
        return interaction.reply({
            content: "❌ Verification role has not been configured.",
            ephemeral: true
        });
    }

    const role = interaction.guild.roles.cache.get(config.verification_role);

    if (!role) {
        return interaction.reply({
            content: "❌ The configured verification role no longer exists.",
            ephemeral: true
        });
    }

    const botMember = interaction.guild.members.me;

    if (!botMember) {
        return interaction.reply({
            content: "❌ I could not find my server member.",
            ephemeral: true
        });
    }

    if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({
            content:
                "❌ I cannot manage the verification role. " +
                "Move my bot role above the verification role.",
            ephemeral: true
        });
    }

    const state = crypto.randomBytes(32).toString("hex");

    await saveOAuthState(state, {
        guild_id: guildId,
        verification_channel_id: verificationChannelId,
        welcome_channel_id: config.welcome_channel || null,
        created_at: Date.now()
    });

    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        response_type: "code",
        redirect_uri: process.env.VERIFY_REDIRECT_URI,
        scope: "identify guilds.join",
        state
    });

    const oauthUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;

    await interaction.reply({
        content:
            `🔐 **Verification Required**\n\n` +
            `Click the link below to authenticate your Discord account.\n\n` +
            `[✅ Authenticate with Discord](${oauthUrl})`,
        ephemeral: true
    });
}

// ======================================================
// HELPERS
// ======================================================

function getDiscordChannelUrl(guildId, channelId) {
    if (!guildId || !channelId) return null;
    return `https://discord.com/channels/${guildId}/${channelId}`;
}

function redirectVerificationError(res, guildId, verificationChannelId, message) {
    console.error("❌ Verification error:", message);

    const channelUrl = getDiscordChannelUrl(guildId, verificationChannelId);

    if (channelUrl) {
        return res.redirect(channelUrl);
    }

    return res.status(400).send(message);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// ======================================================
// VERIFICATION OAUTH CALLBACK
// ======================================================
app.get("/", (req,res)=>{
	return res.status(200).json({status:"running"});
});
app.get("/auth/verify/callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).send("Discord authorization was cancelled or denied.");
    }

    if (!code || !state) {
        return res.status(400).send("Invalid verification request.");
    }

    const stateData = await consumeOAuthState(state);

    if (!stateData) {
        return res.status(400).send("Invalid or expired verification request.");
    }

    const guildId = stateData.guild_id;
    const verificationChannelId = stateData.verification_channel_id;

    try {
        const config = await getConfig(guildId);

        if (!config || !config.verification_enabled || !config.verification_role) {
            return redirectVerificationError(
                res,
                guildId,
                verificationChannelId,
                "Verification is not configured."
            );
        }

        // ==============================================
        // EXCHANGE OAUTH CODE
        // ==============================================

        const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: "authorization_code",
                code,
                redirect_uri: process.env.VERIFY_REDIRECT_URI
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error("OAuth token error:", tokenData);
            return redirectVerificationError(
                res,
                guildId,
                verificationChannelId,
                "Discord authorization failed."
            );
        }

        // ==============================================
        // GET AUTHENTICATED DISCORD USER
        // ==============================================

        const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });

        const user = await userResponse.json();

        if (!userResponse.ok || !user.id) {
            return redirectVerificationError(
                res,
                guildId,
                verificationChannelId,
                "Could not identify your Discord account."
            );
        }

        console.log(`🔐 Verification: ${user.username} (${user.id})`);

        // ==============================================
        // GET GUILD + MEMBER
        // ==============================================

        const guild = await client.guilds.fetch(guildId).catch(() => null);

        if (!guild) {
            return redirectVerificationError(
                res,
                guildId,
                verificationChannelId,
                "The bot is no longer in this server."
            );
        }

        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return redirectVerificationError(
                res,
                guildId,
                verificationChannelId,
                "You must be a member of this server."
            );
        }

        const verificationRole = guild.roles.cache.get(config.verification_role);

        if (!verificationRole) {
            return redirectVerificationError(
                res,
                guildId,
                verificationChannelId,
                "The verification role no longer exists."
            );
        }

        const botMember = guild.members.me;

        if (!botMember) {
            return redirectVerificationError(
                res,
                guildId,
                verificationChannelId,
                "Bot member could not be found."
            );
        }

        if (verificationRole.position >= botMember.roles.highest.position) {
            return redirectVerificationError(
                res,
                guildId,
                verificationChannelId,
                "Bot cannot manage the verification role."
            );
        }

        // ==============================================
        // ADD VERIFICATION ROLE
        // ==============================================

        if (!member.roles.cache.has(verificationRole.id)) {
            await member.roles.add(verificationRole, "Discord OAuth verification successful");
            console.log(`✅ Added verification role "${verificationRole.name}" to ${user.username}`);
        }

        // ==============================================
        // REMOVE DEFAULT ROLE AFTER SUCCESSFUL VERIFICATION
        // ==============================================

        if (config.default_role && member.roles.cache.has(config.default_role)) {
            const defaultRole = guild.roles.cache.get(config.default_role);

            if (defaultRole && defaultRole.id !== guild.id) {
                if (defaultRole.position < botMember.roles.highest.position) {
                    await member.roles.remove(defaultRole, "User successfully verified");
                    console.log(`🗑️ Removed default role "${defaultRole.name}" from ${user.username}`);
                } else {
                    console.warn(
                        `⚠️ Cannot remove default role "${defaultRole.name}". Bot role is not high enough.`
                    );
                }
            }
        }

        // ==============================================
        // SAVE AUTHORIZED USER (MongoDB only)
        // ==============================================

        await saveAuthorizedUser({
            discord_user_id: user.id,
            username: user.username,
            global_name: user.global_name || null,
            avatar: user.avatar || null,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
            source_guild_id: guildId,
            authorized_at: Date.now()
        });

        console.log(`💾 OAuth authorization saved for ${user.username}`);

        // ==============================================
        // SUCCESS → REDIRECT TO WELCOME CHANNEL
        // ==============================================

        const welcomeChannelId = config.welcome_channel || stateData.welcome_channel_id;
        const welcomeUrl = getDiscordChannelUrl(guildId, welcomeChannelId);

        if (welcomeUrl) {
            console.log(`🎉 Verification successful for ${user.username}`);
            return res.redirect(welcomeUrl);
        }

        return res.redirect(`https://discord.com/channels/${guildId}`);
    } catch (error) {
        console.error("❌ Verification callback error:", error);

        return redirectVerificationError(
            res,
            guildId,
            verificationChannelId,
            "Verification failed. Please try again."
        );
    }
});

// ======================================================
// OPTIONAL DASHBOARD LOGIN
// ======================================================

app.get("/auth/discord", (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        response_type: "code",
        redirect_uri: process.env.DASHBOARD_REDIRECT_URI,
        scope: "identify guilds"
    });

    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// ======================================================
// DASHBOARD CALLBACK
// ======================================================

app.get("/auth/discord/callback", async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send("Missing OAuth code.");
    }

    try {
        const response = await fetch("https://discord.com/api/v10/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: "authorization_code",
                code,
                redirect_uri: process.env.DASHBOARD_REDIRECT_URI
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Dashboard OAuth error:", data);
            return res.status(400).json(data);
        }

        const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
            headers: { Authorization: `Bearer ${data.access_token}` }
        });

        const user = await userResponse.json();

        if (!user.id) {
            return res.status(400).send("Could not identify Discord account.");
        }

        console.log(`🌐 Dashboard login: ${user.username}`);

        return res.send(`Logged in as ${escapeHtml(user.username)}`);
    } catch (error) {
        console.error("❌ Dashboard OAuth error:", error);
        return res.status(500).send("Dashboard authentication failed.");
    }
});

// ======================================================
// GUILD CREATE / DELETE
// ======================================================

client.on("guildCreate", async (guild) => {
    console.log(`📥 Bot added to: ${guild.name} (${guild.id})`);

    try {
        await upsertGuild(guild);
        console.log(`💾 Saved guild: ${guild.name}`);
    } catch (error) {
        console.error("❌ Failed to save guild:", error);
    }
});

client.on("guildDelete", (guild) => {
    console.log(`📤 Bot removed from: ${guild.name} (${guild.id})`);
    // Guild configuration is intentionally kept in MongoDB in case the bot rejoins.
});

// ======================================================
// MEMBER EVENTS
// ======================================================

client.on("guildMemberAdd", memberAdd);
client.on("guildMemberRemove", memberRemove);
client.on("guildBanAdd", banAdd);

// ======================================================
// STARTUP
// ======================================================

async function main() {
    await connectDatabase();

    app.listen(PORT, () => {
        console.log(`🌐 Web server running on port ${PORT}`);
    });

    await client.login(process.env.DISCORD_TOKEN);
}

main().catch((error) => {
    console.error("❌ Fatal startup error:", error);
    process.exit(1);
});
