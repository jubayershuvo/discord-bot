import { getConfig } from "../database/index.js";
import { buildEmbed, COLORS } from "../utils/embeds.js";

export default async function memberAdd(member) {
    const config = await getConfig(member.guild.id);

    // ==================================================
    // DEFAULT ROLE
    // ==================================================

    if (config.default_role) {
        const role = member.guild.roles.cache.get(config.default_role);

        if (role && role.position < member.guild.members.me.roles.highest.position) {
            await member.roles.add(role).catch(console.error);
        }
    }

    // ==================================================
    // WELCOME MESSAGE
    // ==================================================

    if (!config.welcome_enabled || !config.welcome_channel) return;

    const channel = member.guild.channels.cache.get(config.welcome_channel);
    if (!channel) return;

    const description = (config.welcome_message || "Welcome {user} to **{server}**! 🚀")
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{server}", member.guild.name);

    const embed = buildEmbed({
        title: "👋 New Member",
        description,
        color: COLORS.success,
        guild: member.guild,
        footer: "Member Joined",
        thumbnail: member.user.displayAvatarURL({ size: 128 }),
        fields: [
            {
                name: "Member Count",
                value: `${member.guild.memberCount}`,
                inline: true
            },
            {
                name: "Account Created",
                value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                inline: true
            }
        ]
    });

    await channel.send({ embeds: [embed] }).catch(console.error);
}
