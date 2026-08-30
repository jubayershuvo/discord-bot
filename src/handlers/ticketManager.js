import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    UserSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} from "discord.js";

import {
    getConfig,
    incrementTicketCounter,
    createTicketRecord,
    getOpenTicketForUser,
    getTicketByChannel,
    closeTicketRecord
} from "../database/index.js";

import { buildEmbed, COLORS } from "../utils/embeds.js";

const CLOSE_DELETE_DELAY_MS = 5000;

// String names (as discord.js's PermissionOverwriteOptions expects for
// channel.permissionOverwrites.edit()).
const TICKET_PERMISSION_NAMES = [
    "ViewChannel",
    "SendMessages",
    "ReadMessageHistory",
    "AttachFiles",
    "EmbedLinks"
];

// Same permissions as bigint flags (as guild.channels.create()'s
// allow/deny arrays expect). Keeping both derived from one name list
// avoids the two ever drifting out of sync.
const TICKET_PERMISSIONS = TICKET_PERMISSION_NAMES.map((name) => PermissionFlagsBits[name]);

const BOT_EXTRA_PERMISSIONS = [
    ...TICKET_PERMISSIONS,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageMessages
];

/**
 * Builds a { PermissionName: true, ... } object for
 * channel.permissionOverwrites.edit() — that API takes permission
 * *names*, not the numeric/bigint flag values used everywhere else.
 */
function permissionOverwriteOptions(names) {
    const options = {};
    for (const name of names) options[name] = true;
    return options;
}

/**
 * True if the member is the ticket owner, holds the configured support
 * role, or is a server Administrator.
 */
function canManageTicket({ member, ticket, config }) {
    if (member.id === ticket.owner_id) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (config.support_role_id && member.roles.cache.has(config.support_role_id)) return true;
    return false;
}

// ======================================================
// CREATE TICKET
// ======================================================

export async function handleTicketCreate(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const config = await getConfig(guild.id);

    if (!config.ticket_system_enabled || !config.ticket_channel_id || !config.support_role_id) {
        return interaction.editReply({
            content: "❌ The ticket system isn't configured yet. Ask an admin to run `/ticket-setup`."
        });
    }

    const supportRole = guild.roles.cache.get(config.support_role_id);

    if (!supportRole) {
        return interaction.editReply({
            content:
                "❌ The configured support role no longer exists. " +
                "Ask an admin to re-run `/ticket-setup`."
        });
    }

    const botMember = guild.members.me;

    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.editReply({
            content: "❌ I need the **Manage Channels** permission to create tickets."
        });
    }

    // ==================================================
    // BLOCK DUPLICATE OPEN TICKETS
    // ==================================================

    const existing = await getOpenTicketForUser(guild.id, interaction.user.id);

    if (existing) {
        const existingChannel = guild.channels.cache.get(existing.channel_id);

        if (existingChannel) {
            return interaction.editReply({
                content: `⚠️ You already have an open ticket: <#${existingChannel.id}>`
            });
        }

        // The channel was deleted outside the bot (manually) — release the
        // stale record so the user isn't permanently blocked.
        await closeTicketRecord(existing.channel_id);
    }

    // ==================================================
    // RESOLVE CATEGORY (fall back to server root if deleted/unset)
    // ==================================================

    let parent = null;

    if (config.ticket_category_id) {
        const category = guild.channels.cache.get(config.ticket_category_id);

        if (category?.type === ChannelType.GuildCategory) {
            parent = category.id;
        } else {
            console.warn(`⚠️ Configured ticket category missing in guild ${guild.id}, using server root.`);
        }
    }

    // ==================================================
    // CREATE THE CHANNEL
    // ==================================================

    const ticketNumber = await incrementTicketCounter(guild.id);
    const ticketName = `ticket-${String(ticketNumber).padStart(2, "0")}`;

    let channel;

    try {
        channel = await guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: TICKET_PERMISSIONS
                },
                {
                    id: supportRole.id,
                    allow: TICKET_PERMISSIONS
                },
                {
                    id: botMember.id,
                    allow: BOT_EXTRA_PERMISSIONS
                }
            ],
            reason: `Ticket opened by ${interaction.user.tag}`
        });
    } catch (error) {
        console.error("❌ Failed to create ticket channel:", error);
        return interaction.editReply({
            content: "❌ I couldn't create the ticket channel. Check my permissions and try again."
        });
    }

    await createTicketRecord({
        guild_id: guild.id,
        channel_id: channel.id,
        owner_id: interaction.user.id,
        ticket_number: ticketNumber
    });

    // ==================================================
    // WELCOME MESSAGE INSIDE THE TICKET
    // ==================================================

    const embed = buildEmbed({
        title: "🎫 Support Ticket",
        description:
            `Hello <@${interaction.user.id}>!\n\n` +
            "A member of our support team will assist you shortly.\n\n" +
            "Use the **Close Ticket** button below when your issue has been resolved.",
        color: COLORS.brand,
        guild,
        footer: `Ticket #${String(ticketNumber).padStart(2, "0")}`
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("Close Ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("ticket_add_user")
            .setLabel("Add User")
            .setEmoji("👤")
            .setStyle(ButtonStyle.Secondary)
    );

    const ticketMessage = await channel
        .send({
            content: `<@${interaction.user.id}> <@&${supportRole.id}>`,
            embeds: [embed],
            components: [row]
        })
        .catch((error) => {
            console.error("❌ Failed to send ticket welcome message:", error);
            return null;
        });

    // Pin it so the Close Ticket button stays easy to find even after the
    // channel fills up with conversation.
    if (ticketMessage) {
        await ticketMessage.pin().catch((error) => {
            console.error("⚠️ Failed to pin ticket welcome message:", error);
        });
    }

    return interaction.editReply({
        content: `✅ Your ticket has been created: <#${channel.id}>`
    });
}

// ======================================================
// CLOSE TICKET — CONFIRMATION STEP
// ======================================================

export async function handleTicketClose(interaction) {
    const config = await getConfig(interaction.guild.id);
    const ticket = await getTicketByChannel(interaction.channel.id);

    if (!ticket || ticket.status !== "open") {
        return interaction.reply({
            content: "❌ This isn't an active ticket channel.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!canManageTicket({ member: interaction.member, ticket, config })) {
        return interaction.reply({
            content: "❌ Only the ticket creator, support team, or an administrator can close this ticket.",
            flags: MessageFlags.Ephemeral
        });
    }

    const embed = buildEmbed({
        title: "🔒 Close This Ticket?",
        description: "This will close the ticket and delete the channel shortly after. This can't be undone.",
        color: COLORS.warning,
        guild: interaction.guild,
        footer: "Confirm Close"
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_close_confirm")
            .setLabel("Confirm Close")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("ticket_close_cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
    });
}

export async function handleTicketCloseCancel(interaction) {
    return interaction.update({
        content: "❌ Ticket close cancelled.",
        embeds: [],
        components: []
    });
}

export async function handleTicketCloseConfirm(interaction) {
    const config = await getConfig(interaction.guild.id);
    const ticket = await getTicketByChannel(interaction.channel.id);

    if (!ticket || ticket.status !== "open") {
        return interaction.update({
            content: "❌ This ticket is no longer active.",
            embeds: [],
            components: []
        });
    }

    if (!canManageTicket({ member: interaction.member, ticket, config })) {
        return interaction.update({
            content: "❌ You're not authorized to close this ticket.",
            embeds: [],
            components: []
        });
    }

    await interaction.update({
        content: "🔒 Closing ticket...",
        embeds: [],
        components: []
    });

    await closeTicketRecord(interaction.channel.id);

    const closingEmbed = buildEmbed({
        title: "🔒 Ticket Closed",
        description: `Closed by <@${interaction.user.id}>. This channel will be deleted shortly.`,
        color: COLORS.danger,
        guild: interaction.guild,
        footer: "Ticket Closed"
    });

    await interaction.channel.send({ embeds: [closingEmbed] }).catch(console.error);

    const channel = interaction.channel;

    setTimeout(() => {
        channel.delete("Ticket closed").catch((error) => {
            console.error("❌ Failed to delete ticket channel:", error);
        });
    }, CLOSE_DELETE_DELAY_MS);
}

// ======================================================
// ADD USER TO TICKET (optional feature)
// ======================================================

export async function handleTicketAddUserButton(interaction) {
    const config = await getConfig(interaction.guild.id);
    const ticket = await getTicketByChannel(interaction.channel.id);

    if (!ticket || ticket.status !== "open") {
        return interaction.reply({
            content: "❌ This isn't an active ticket channel.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!canManageTicket({ member: interaction.member, ticket, config })) {
        return interaction.reply({
            content: "❌ Only the ticket creator, support team, or an administrator can add users.",
            flags: MessageFlags.Ephemeral
        });
    }

    const menu = new UserSelectMenuBuilder()
        .setCustomId("ticket_add_user_select")
        .setPlaceholder("Select a user to add to this ticket");

    return interaction.reply({
        content: "Select a user to give access to this ticket:",
        components: [new ActionRowBuilder().addComponents(menu)],
        flags: MessageFlags.Ephemeral
    });
}

export async function handleTicketAddUserSelect(interaction) {
    const config = await getConfig(interaction.guild.id);
    const ticket = await getTicketByChannel(interaction.channel.id);

    if (!ticket || ticket.status !== "open") {
        return interaction.update({
            content: "❌ This ticket is no longer active.",
            components: []
        });
    }

    if (!canManageTicket({ member: interaction.member, ticket, config })) {
        return interaction.update({
            content: "❌ You're not authorized to modify this ticket.",
            components: []
        });
    }

    const userId = interaction.values[0];

    try {
        await interaction.channel.permissionOverwrites.edit(
            userId,
            permissionOverwriteOptions(TICKET_PERMISSION_NAMES)
        );
    } catch (error) {
        console.error("❌ Failed to add user to ticket:", error);
        return interaction.update({
            content: "❌ I couldn't add that user. Check my permissions and try again.",
            components: []
        });
    }

    return interaction.update({
        content: `✅ Added <@${userId}> to this ticket.`,
        components: []
    });
}
