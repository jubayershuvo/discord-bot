import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} from "discord.js";

import { updateConfig, getConfig } from "../database/index.js";
import { buildEmbed, buildWizardEmbed, COLORS } from "../utils/embeds.js";

const TOTAL_STEPS = 8;

function toggleRow(enableId, disableId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(enableId)
            .setLabel("Enable")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(disableId)
            .setLabel("Disable")
            .setEmoji("✖️")
            .setStyle(ButtonStyle.Secondary)
    );
}

// ======================================================
// STEP 1 — WELCOME TOGGLE
// ======================================================

export async function startSetup(interaction) {
    const embed = buildWizardEmbed({
        step: 1,
        total: TOTAL_STEPS,
        title: "👋 Welcome Messages",
        description: "Would you like to enable welcome messages for new members?",
        guild: interaction.guild
    });

    await interaction.update({
        embeds: [embed],
        components: [toggleRow("welcome_enable", "welcome_disable")]
    });
}

// ======================================================
// STEP 1 RESULT / STEP 2 — WELCOME CHANNEL
// ======================================================

export async function welcomeChoice(interaction, enabled) {
    await updateConfig(interaction.guild.id, {
        welcome_enabled: enabled
    });

    if (!enabled) {
        return showDefaultRole(interaction);
    }

    const embed = buildWizardEmbed({
        step: 2,
        total: TOTAL_STEPS,
        title: "📢 Welcome Channel",
        description: "Select the channel where welcome messages should be posted.",
        guild: interaction.guild
    });

    const menu = new ChannelSelectMenuBuilder()
        .setCustomId("welcome_channel")
        .setPlaceholder("Select a welcome channel")
        .setChannelTypes(ChannelType.GuildText);

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
    });
}

export async function welcomeChannel(interaction) {
    await updateConfig(interaction.guild.id, {
        welcome_channel: interaction.values[0]
    });

    await showDefaultRole(interaction);
}

// ======================================================
// STEP 3 — DEFAULT ROLE
// ======================================================

async function showDefaultRole(interaction) {
    const embed = buildWizardEmbed({
        step: 3,
        total: TOTAL_STEPS,
        title: "🎭 Default Role",
        description:
            "Select the role automatically given to new members.\n\n" +
            "⚠️ My role must be positioned **above** this role.",
        guild: interaction.guild
    });

    const menu = new RoleSelectMenuBuilder()
        .setCustomId("default_role")
        .setPlaceholder("Select a default role");

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
    });
}

export async function defaultRole(interaction) {
    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
        return interaction.reply({
            content: "❌ Role not found.",
            flags: MessageFlags.Ephemeral
        });
    }

    const botMember = interaction.guild.members.me;

    if (botMember && role.position >= botMember.roles.highest.position) {
        return interaction.reply({
            content:
                "❌ I cannot manage that role.\n\n" +
                "Move my bot role above the selected role and try again.",
            flags: MessageFlags.Ephemeral
        });
    }

    await updateConfig(interaction.guild.id, {
        default_role: roleId
    });

    const embed = buildWizardEmbed({
        step: 4,
        total: TOTAL_STEPS,
        title: "🔐 Member Verification",
        description: "Would you like to enable OAuth2 member verification?",
        guild: interaction.guild
    });

    await interaction.update({
        embeds: [embed],
        components: [toggleRow("verification_enable", "verification_disable")]
    });
}

// ======================================================
// STEP 4 RESULT / STEP 5 — VERIFICATION CHANNEL
// ======================================================

export async function verificationChoice(interaction, enabled) {
    await updateConfig(interaction.guild.id, {
        verification_enabled: enabled
    });

    if (!enabled) {
        return showLeaveLog(interaction);
    }

    const embed = buildWizardEmbed({
        step: 5,
        total: TOTAL_STEPS,
        title: "🔐 Verification Channel",
        description: "Select the channel where the verification button will be posted.",
        guild: interaction.guild
    });

    const menu = new ChannelSelectMenuBuilder()
        .setCustomId("verification_channel")
        .setPlaceholder("Select a verification channel")
        .setChannelTypes(ChannelType.GuildText);

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
    });
}

export async function verificationChannel(interaction) {
    const channelId = interaction.values[0];
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
        return interaction.reply({
            content: "❌ Channel not found.",
            flags: MessageFlags.Ephemeral
        });
    }

    const botMember = interaction.guild.members.me;
    const permissions = botMember ? channel.permissionsFor(botMember) : null;

    if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
        return interaction.reply({
            content:
                "❌ I can't access that channel.\n\n" +
                "Grant the bot **View Channel** permission and try again.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!permissions.has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({
            content:
                "❌ I can't send messages in that channel.\n\n" +
                "Grant the bot **Send Messages** permission and try again.",
            flags: MessageFlags.Ephemeral
        });
    }

    await updateConfig(interaction.guild.id, {
        verification_channel: channelId
    });

    const embed = buildWizardEmbed({
        step: 6,
        total: TOTAL_STEPS,
        title: "🔐 Verification Role",
        description:
            "Select the role that verified members will receive.\n\n" +
            "⚠️ My role must be positioned **above** this role.",
        guild: interaction.guild
    });

    const menu = new RoleSelectMenuBuilder()
        .setCustomId("verification_role")
        .setPlaceholder("Select the verified role");

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
    });
}

// ======================================================
// STEP 6 — VERIFICATION ROLE
// ======================================================

export async function verificationRole(interaction) {
    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
        return interaction.reply({
            content: "❌ Role not found.",
            flags: MessageFlags.Ephemeral
        });
    }

    const botMember = interaction.guild.members.me;

    if (botMember && role.position >= botMember.roles.highest.position) {
        return interaction.reply({
            content:
                "❌ I cannot manage that role.\n\n" +
                "Move my bot role above the selected verification role and try again.",
            flags: MessageFlags.Ephemeral
        });
    }

    await updateConfig(interaction.guild.id, {
        verification_role: roleId
    });

    await showLeaveLog(interaction);
}

// ======================================================
// STEP 7 — LEAVE LOG
// ======================================================

async function showLeaveLog(interaction) {
    const embed = buildWizardEmbed({
        step: 7,
        total: TOTAL_STEPS,
        title: "📋 Leave Log",
        description: "Select the channel where member-leave notices should be posted.",
        guild: interaction.guild
    });

    const menu = new ChannelSelectMenuBuilder()
        .setCustomId("leave_channel")
        .setPlaceholder("Select a leave log channel")
        .setChannelTypes(ChannelType.GuildText);

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
    });
}

export async function leaveChannel(interaction) {
    await updateConfig(interaction.guild.id, {
        leave_channel: interaction.values[0]
    });

    const embed = buildWizardEmbed({
        step: 8,
        total: TOTAL_STEPS,
        title: "🚫 Ban Log",
        description: "Select the channel where ban notices should be posted.",
        guild: interaction.guild
    });

    const menu = new ChannelSelectMenuBuilder()
        .setCustomId("ban_channel")
        .setPlaceholder("Select a ban log channel")
        .setChannelTypes(ChannelType.GuildText);

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
    });
}

// ======================================================
// STEP 8 — BAN LOG → FINISH
// ======================================================

export async function banChannel(interaction) {
    await updateConfig(interaction.guild.id, {
        ban_channel: interaction.values[0]
    });

    await finishSetup(interaction);
}

// ======================================================
// FINISH SETUP
// ======================================================

function statusField(name, value, linked) {
    return {
        name,
        value: linked ? value : "*Not configured*",
        inline: true
    };
}

export async function finishSetup(interaction) {
    const config = await getConfig(interaction.guild.id);

    const embed = buildEmbed({
        title: "✅ Setup Complete",
        description: "Your server automation is now fully configured and live.",
        color: COLORS.success,
        guild: interaction.guild,
        footer: "Setup Wizard",
        thumbnail: interaction.guild.iconURL({ size: 128 }) || undefined,
        fields: [
            statusField("Welcome Messages", "✅ Enabled", config.welcome_enabled),
            statusField(
                "Welcome Channel",
                config.welcome_channel ? `<#${config.welcome_channel}>` : null,
                !!config.welcome_channel
            ),
            statusField(
                "Default Role",
                config.default_role ? `<@&${config.default_role}>` : null,
                !!config.default_role
            ),
            statusField("Verification", "✅ Enabled", config.verification_enabled),
            statusField(
                "Verification Channel",
                config.verification_channel ? `<#${config.verification_channel}>` : null,
                !!config.verification_channel
            ),
            statusField(
                "Verification Role",
                config.verification_role ? `<@&${config.verification_role}>` : null,
                !!config.verification_role
            ),
            statusField(
                "Leave Logs",
                config.leave_channel ? `<#${config.leave_channel}>` : null,
                !!config.leave_channel
            ),
            statusField(
                "Ban Logs",
                config.ban_channel ? `<#${config.ban_channel}>` : null,
                !!config.ban_channel
            )
        ]
    });

    await interaction.update({
        embeds: [embed],
        components: []
    });

    if (config.verification_enabled) {
        try {
            const posted = await postVerificationMessage(interaction.guild);

            if (!posted) {
                await interaction.followUp({
                    content:
                        "⚠️ Setup completed, but I couldn't post the verification message.\n\n" +
                        "Double-check my permissions in the configured verification channel.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (error) {
            console.error("❌ Verification message error:", error);

            await interaction
                .followUp({
                    content:
                        "⚠️ Setup completed, but I couldn't post the verification message.\n\n" +
                        "Double-check my permissions in the configured verification channel.",
                    flags: MessageFlags.Ephemeral
                })
                .catch(() => {});
        }
    }
}

// ======================================================
// POST VERIFICATION MESSAGE
// ======================================================

export async function postVerificationMessage(guild) {
    const config = await getConfig(guild.id);

    if (!config || !config.verification_enabled) return false;

    if (!config.verification_channel) {
        console.log("⚠️ No verification channel configured.");
        return false;
    }

    const channel = await guild.channels
        .fetch(config.verification_channel)
        .catch((error) => {
            console.error("❌ Cannot fetch verification channel:", error);
            return null;
        });

    if (!channel) {
        console.error("❌ Verification channel not found.");
        return false;
    }

    const botMember = guild.members.me;

    if (!botMember) {
        console.error("❌ Bot member not found.");
        return false;
    }

    const permissions = channel.permissionsFor(botMember);

    if (!permissions) {
        console.error("❌ Could not calculate channel permissions.");
        return false;
    }

    const required = [
        [PermissionFlagsBits.ViewChannel, "View Channel"],
        [PermissionFlagsBits.SendMessages, "Send Messages"],
        [PermissionFlagsBits.EmbedLinks, "Embed Links"]
    ];

    for (const [flag, label] of required) {
        if (!permissions.has(flag)) {
            console.error(`❌ Missing ${label} permission in #${channel.name}`);
            return false;
        }
    }

    const embed = buildEmbed({
        title: "🔐 Server Verification",
        description:
            "Welcome! To gain full access to this server, please verify your Discord account.\n\n" +
            "Click **Verify** below and authorize with Discord — it only takes a few seconds.",
        color: COLORS.brand,
        guild,
        footer: "Secure OAuth2 Verification"
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_user")
            .setLabel("Verify")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
    );

    try {
        await channel.send({ embeds: [embed], components: [row] });
        console.log(`✅ Verification message posted in #${channel.name}`);
        return true;
    } catch (error) {
        console.error("❌ Failed to send verification message:", error);
        return false;
    }
}
