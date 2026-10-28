module.exports = {
  name: "guildMemberAdd",

  async execute(member, bot, config) {

    if (!member.guild || member.user.bot) return;

    try {

      const req = bot.functions.ensureGuildRow(bot, member.guild.id);

      const wetData = JSON.parse(req.wet || "[]");
      const wetUser = wetData.find(u => u.id === member.user.id);

      if (wetUser) {

        await member.ban({
          reason: `User wet - Auteur: ${wetUser.author}`
        }).catch(() => false);

        console.log(`Auto-ban WET : ${member.user.tag}`);
        return;
      }

      const noblData = JSON.parse(req.nobl || "[]");
      const noblUser = noblData.find(u => u.id === member.user.id);

      if (noblUser) {

        await member.ban({
          reason: `User in NoBL - Auteur: ${noblUser.author}`
        }).catch(() => false);

        console.log(`Auto-ban NoBL : ${member.user.tag}`);
        return;
      }

      const blData = JSON.parse(req.bl || "[]");
      const blUser = blData.find(u => u.id === member.user.id);

      if (blUser) {

        await member.ban({
          reason: `User in Blacklist - Auteur: ${blUser.author}`
        }).catch(() => false);

        console.log(`Auto-ban BL : ${member.user.tag}`);
        return;
      }

    } catch (err) {
      console.log("Erreur guildMemberAdd system :", err);
    }
  }
};
