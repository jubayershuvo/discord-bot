import { getConfig } from "../database/index.js";
import { buildEmbed, COLORS } from "../utils/embeds.js";

export default async function memberRemove(member) {
    const config = await getConfig(member.guild.id);

    if (!config.leave_channel) return;

    const channel = member.guild.channels.cache.get(config.leave_channel);
    if (!channel) return;

    const fields = [
        { name: "User ID", value: member.id, inline: true },
        {
            name: "Member Count",
            value: `${member.guild.memberCount}`,
            inline: true
        }
    ];

    if (member.joinedTimestamp) {
        fields.push({
            name: "Joined Server",
            value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
            inline: true
        });
    }

    const embed = buildEmbed({
        title: "👋 Member Left",
        description: `**${member.user.tag}** left the server.`,
        color: COLORS.warning,
        guild: member.guild,
        footer: "Member Left",
        thumbnail: member.user.displayAvatarURL({ size: 128 }),
        fields
    });

    await channel.send({ embeds: [embed] }).catch(console.error);
}
