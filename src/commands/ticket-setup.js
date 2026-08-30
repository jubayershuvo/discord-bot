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
        .setName("ticket-setup")
        .setDescription("Configure the support ticket system")
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
            title: "🎫 Ticket System Setup",
            description:
                "This wizard configures the support ticket system:\n\n" +
                "• Support team role\n" +
                "• Ticket category (optional)\n" +
                "• Ticket panel channel\n\n" +
                "Your existing `/setup` configuration (welcome, verification, " +
                "logs) is untouched by this.",
            color: COLORS.brand,
            guild: interaction.guild,
            footer: "Ticket Setup"
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_setup_start")
                .setLabel("Start Ticket Setup")
                .setEmoji("🎫")
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }
};
