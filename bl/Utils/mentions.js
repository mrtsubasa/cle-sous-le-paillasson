const Discord = require('discord.js');

function normalizeAllowedMentions(options) {
    if (!options || typeof options !== 'object') return options;

    const nextOptions = { ...options };
    const current = nextOptions.allowedMentions && typeof nextOptions.allowedMentions === 'object'
        ? nextOptions.allowedMentions
        : {};

    nextOptions.allowedMentions = {
        ...current,
        parse: [],
    };

    return nextOptions;
}

function wrapMethod(proto, methodName) {
    if (!proto || typeof proto[methodName] !== 'function') return;
    if (proto[methodName].__allowedMentionsPatched) return;

    const original = proto[methodName];
    proto[methodName] = function patchedAllowedMentions(...args) {
        if (args.length > 0) {
            args[0] = normalizeAllowedMentions(args[0]);
        } else {
            args.push({ allowedMentions: { parse: [] } });
        }
        return original.apply(this, args);
    };
    proto[methodName].__allowedMentionsPatched = true;
}

function patchAllowedMentions() {
    wrapMethod(Discord.Message?.prototype, 'reply');
    wrapMethod(Discord.TextBasedChannel?.prototype, 'send');
    wrapMethod(Discord.BaseInteraction?.prototype, 'reply');
    wrapMethod(Discord.BaseInteraction?.prototype, 'followUp');
    wrapMethod(Discord.BaseInteraction?.prototype, 'editReply');
    wrapMethod(Discord.BaseInteraction?.prototype, 'update');
    wrapMethod(Discord.WebhookClient?.prototype, 'send');
}

module.exports = patchAllowedMentions;
