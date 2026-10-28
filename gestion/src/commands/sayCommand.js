async function runSayCommand(message, rawCommand, context) {
  const textContent = message.content.slice(message.content.indexOf(rawCommand) + rawCommand.length).trim();
  const files = Array.from(message.attachments.values());

  if (!textContent && files.length === 0) {
    return;
  }

  try {
    await message.channel.send({
      content: textContent || undefined,
      files: files
    });

    if (message.deletable) {
      await message.delete();
    }
  } catch (err) {
    console.error('Failed to send say message:', err);
  }
}

module.exports = { runSayCommand };
