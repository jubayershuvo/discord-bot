import { EmbedBuilder } from "discord.js";

export const COLORS = {
    brand: 0x5865f2, // Discord blurple — wizard / neutral steps
    success: 0x57f287, // joins, verification success, enabled toggles
    danger: 0xed4245, // bans, errors
    warning: 0xfee75c, // leaves, disabled toggles
    info: 0x2b2d31 // dark neutral, used for logs
};

/**
 * Renders a compact visual progress bar, e.g. "●●●○○○○○" for step 3 of 8.
 */
export function progressBar(step, total) {
    const filled = "●".repeat(step);
    const empty = "○".repeat(Math.max(total - step, 0));
    return `${filled}${empty}  •  Step ${step} of ${total}`;
}

/**
 * Base embed builder every message in the bot goes through, so every
 * embed shares the same footer/timestamp/branding conventions.
 */
export function buildEmbed({
    title,
    description,
    color = COLORS.brand,
    guild = null,
    footer = "Server Automation",
    fields = null,
    thumbnail = null,
    timestamp = true
}) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title);

    if (description) embed.setDescription(description);
    if (fields) embed.addFields(fields);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (timestamp) embed.setTimestamp();

    const guildIcon = guild?.iconURL?.({ size: 64 });

    embed.setFooter({
        text: guild ? `${guild.name} • ${footer}` : footer,
        iconURL: guildIcon || undefined
    });

    return embed;
}

/**
 * Embed used for each step of the /setup wizard, with a progress bar
 * baked into the description.
 */
export function buildWizardEmbed({ step, total, title, description, guild }) {
    return buildEmbed({
        title,
        description: `${description}\n\n${progressBar(step, total)}`,
        color: COLORS.brand,
        guild,
        footer: "Setup Wizard"
    });
}
