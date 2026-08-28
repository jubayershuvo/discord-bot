import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from "discord.js";

import { buildEmbed, COLORS } from "../utils/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure this server's automation")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: "❌ You need the **Administrator** permission to run this.",
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = buildEmbed({
            title: "⚙️ Server Setup",
            description:
                "Welcome to the server automation setup wizard.\n\n" +
                "I'll walk you through welcome messages, member verification, " +
                "and join/leave/ban logging — step by step.",
            color: COLORS.brand,
            guild: interaction.guild,
            footer: "Setup Wizard"
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("setup_start")
                .setLabel("Start Setup")
                .setEmoji("⚙️")
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }
};
