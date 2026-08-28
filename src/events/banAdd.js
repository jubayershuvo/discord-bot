import { AuditLogEvent, PermissionFlagsBits } from "discord.js";
import { getConfig } from "../database/index.js";
import { buildEmbed, COLORS } from "../utils/embeds.js";

export default async function banAdd(ban) {
    const config = await getConfig(ban.guild.id);

    if (!config.ban_channel) return;

    const channel = ban.guild.channels.cache.get(config.ban_channel);
    if (!channel) return;

    const fields = [{ name: "User ID", value: ban.user.id, inline: true }];

    if (ban.reason) {
        fields.push({ name: "Reason", value: ban.reason, inline: true });
    }

    // Best-effort: look up who issued the ban via the audit log.
    const botMember = ban.guild.members.me;

    if (botMember?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        try {
            const logs = await ban.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBanAdd,
                limit: 5
            });

            const entry = logs.entries.find(
                (e) => e.target?.id === ban.user.id
            );

            if (entry?.executor) {
                fields.push({
                    name: "Banned By",
                    value: `${entry.executor.tag}`,
                    inline: true
                });
            }
        } catch (error) {
            console.error("⚠️ Could not fetch audit log for ban:", error);
        }
    }

    const embed = buildEmbed({
        title: "🔨 Member Banned",
        description: `**${ban.user.tag}** was banned from the server.`,
        color: COLORS.danger,
        guild: ban.guild,
        footer: "Ban Log",
        thumbnail: ban.user.displayAvatarURL({ size: 128 }),
        fields
    });

    await channel.send({ embeds: [embed] }).catch(console.error);
}
