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

import { updateConfig, getConfig, setTicketPanelMessage } from "../database/index.js";
import { buildEmbed, buildWizardEmbed, COLORS } from "../utils/embeds.js";

const TOTAL_STEPS = 4;

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
// STEP 1 — ENABLE / DISABLE
// ======================================================

export async function startTicketSetup(interaction) {
    const embed = buildWizardEmbed({
        step: 1,
        total: TOTAL_STEPS,
        title: "🎫 Ticket System",
        description: "Would you like to enable the support ticket system?",
        guild: interaction.guild
    });

    await interaction.update({
        embeds: [embed],
        components: [toggleRow("ticket_system_enable", "ticket_system_disable")]
    });
}

export async function ticketSystemChoice(interaction, enabled) {
    await updateConfig(interaction.guild.id, {
        ticket_system_enabled: enabled
    });

    if (!enabled) {
        const embed = buildEmbed({
            title: "🎫 Ticket System Disabled",
            description:
                "The ticket system is now disabled. Members won't be able to " +
                "open new tickets until you re-run `/ticket-setup` and enable it.",
            color: COLORS.warning,
            guild: interaction.guild,
            footer: "Ticket Setup"
        });

        return interaction.update({ embeds: [embed], components: [] });
    }

    const embed = buildWizardEmbed({
        step: 2,
        total: TOTAL_STEPS,
        title: "👥 Support Team Role",
        description: "Select the role that should have access to every ticket.",
        guild: interaction.guild
    });

    const menu = new RoleSelectMenuBuilder()
        .setCustomId("ticket_support_role")
        .setPlaceholder("Select the support team role");

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
    });
}

// ======================================================
// STEP 2 — SUPPORT ROLE
// ======================================================

export async function ticketSupportRole(interaction) {
    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
        return interaction.reply({
            content: "❌ Role not found.",
            flags: MessageFlags.Ephemeral
        });
    }

    await updateConfig(interaction.guild.id, {
        support_role_id: roleId
    });

    await showCategoryStep(interaction);
}

// ======================================================
// STEP 3 — TICKET CATEGORY (OPTIONAL)
// ======================================================

async function showCategoryStep(interaction) {
    const embed = buildWizardEmbed({
        step: 3,
        total: TOTAL_STEPS,
        title: "📁 Ticket Category",
        description:
            "Select the category new ticket channels should be created under, " +
            "or skip to create them at the server root.",
        guild: interaction.guild
    });

    const menu = new ChannelSelectMenuBuilder()
        .setCustomId("ticket_category")
        .setPlaceholder("Select a ticket category")
        .setChannelTypes(ChannelType.GuildCategory);

    const skipRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_category_skip")
            .setLabel("Skip (use server root)")
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu), skipRow]
    });
}

export async function ticketCategory(interaction) {
    await updateConfig(interaction.guild.id, {
        ticket_category_id: interaction.values[0]
    });

    await showPanelChannelStep(interaction);
}

export async function ticketCategorySkip(interaction) {
    await updateConfig(interaction.guild.id, {
        ticket_category_id: null
    });

    await showPanelChannelStep(interaction);
}

// ======================================================
// STEP 4 — TICKET PANEL CHANNEL
// ======================================================

async function showPanelChannelStep(interaction) {
    const embed = buildWizardEmbed({
        step: 4,
        total: TOTAL_STEPS,
        title: "📢 Ticket Panel Channel",
        description: "Select the channel where the \"Create Ticket\" panel will be posted.",
        guild: interaction.guild
    });

    const menu = new ChannelSelectMenuBuilder()
        .setCustomId("ticket_panel_channel")
        .setPlaceholder("Select a ticket panel channel")
        .setChannelTypes(ChannelType.GuildText);

    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
    });
}

export async function ticketPanelChannel(interaction) {
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

    const required = [
        [PermissionFlagsBits.ViewChannel, "View Channel"],
        [PermissionFlagsBits.SendMessages, "Send Messages"],
        [PermissionFlagsBits.EmbedLinks, "Embed Links"]
    ];

    for (const [flag, label] of required) {
        if (!permissions?.has(flag)) {
            return interaction.reply({
                content: `❌ I'm missing **${label}** permission in that channel. Grant it and try again.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    await updateConfig(interaction.guild.id, {
        ticket_channel_id: channelId
    });

    await finishTicketSetup(interaction);
}

// ======================================================
// FINISH
// ======================================================

async function finishTicketSetup(interaction) {
    const config = await getConfig(interaction.guild.id);

    const embed = buildEmbed({
        title: "✅ Ticket System Configured",
        description: "The support ticket system is now live.",
        color: COLORS.success,
        guild: interaction.guild,
        footer: "Ticket Setup",
        thumbnail: interaction.guild.iconURL({ size: 128 }) || undefined,
        fields: [
            {
                name: "Support Role",
                value: config.support_role_id ? `<@&${config.support_role_id}>` : "*Not configured*",
                inline: true
            },
            {
                name: "Ticket Category",
                value: config.ticket_category_id ? `<#${config.ticket_category_id}>` : "Server root",
                inline: true
            },
            {
                name: "Panel Channel",
                value: config.ticket_channel_id ? `<#${config.ticket_channel_id}>` : "*Not configured*",
                inline: true
            }
        ]
    });

    await interaction.update({ embeds: [embed], components: [] });

    try {
        const posted = await postOrUpdateTicketPanel(interaction.guild);

        if (!posted) {
            await interaction.followUp({
                content:
                    "⚠️ Setup completed, but I couldn't post the ticket panel. " +
                    "Double-check my permissions in the configured panel channel.",
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        console.error("❌ Ticket panel error:", error);

        await interaction
            .followUp({
                content:
                    "⚠️ Setup completed, but I couldn't post the ticket panel. " +
                    "Double-check my permissions in the configured panel channel.",
                flags: MessageFlags.Ephemeral
            })
            .catch(() => {});
    }
}

// ======================================================
// POST / UPDATE TICKET PANEL (avoids duplicate panels)
// ======================================================

export async function postOrUpdateTicketPanel(guild) {
    const config = await getConfig(guild.id);

    if (!config || !config.ticket_system_enabled || !config.ticket_channel_id) {
        return false;
    }

    const channel = await guild.channels.fetch(config.ticket_channel_id).catch(() => null);

    if (!channel) {
        console.error("❌ Ticket panel channel not found.");
        return false;
    }

    const embed = buildEmbed({
        title: "🎫 Support Tickets",
        description:
            "Need help? Click the button below to open a private ticket with our support team.",
        color: COLORS.brand,
        guild,
        footer: "Support Tickets"
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_create")
            .setLabel("Create Ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary)
    );

    // Try to edit the existing panel message first, so re-running setup
    // (or changing settings) doesn't spam duplicate panels.
    if (config.ticket_panel_message_id) {
        const existing = await channel.messages
            .fetch(config.ticket_panel_message_id)
            .catch(() => null);

        if (existing) {
            await existing.edit({ embeds: [embed], components: [row] });
            return true;
        }
    }

    try {
        const message = await channel.send({ embeds: [embed], components: [row] });
        await setTicketPanelMessage(guild.id, message.id);
        return true;
    } catch (error) {
        console.error("❌ Failed to send ticket panel:", error);
        return false;
    }
}
