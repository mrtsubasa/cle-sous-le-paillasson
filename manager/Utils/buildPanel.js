const Discord = require('discord.js');

function buildPanel(title, lines = []) {
  const container = new Discord.ContainerBuilder();
  container
    .addSeparatorComponents(
      new Discord.SeparatorBuilder()
        .setSpacing(Discord.SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(title));

  for (const line of lines) {
    if (line) {
      container.addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(line));
    }
  }

  container.addSeparatorComponents(
    new Discord.SeparatorBuilder()
      .setSpacing(Discord.SeparatorSpacingSize.Small)
      .setDivider(true)
  );

  return container;
}

module.exports = buildPanel;
