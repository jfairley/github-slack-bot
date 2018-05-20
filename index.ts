'use strict';

import { slackbot } from 'botkit';
import { eq, trim } from 'lodash';
import * as configure from './src/configure';
import * as listener from './src/listener';
import * as pulls from './src/pulls';

// startup logs
console.log('Starting Botkit...');
if (process.env.SLACK_BOT_STORAGE) {
  console.log('Using persistent storage location:', process.env.SLACK_BOT_STORAGE);
}

// create shared slack bot controller
const controller = slackbot({
  debug: process.env.SLACK_BOT_DEBUG === 'true',
  json_file_store: process.env.SLACK_BOT_STORAGE
});

// setup slack command webserver
const slashCommandPort = process.env.SLACK_BOT_PORT || 3000;
controller.setupWebserver(slashCommandPort, (err, webserver) => controller.createWebhookEndpoints(webserver));

// initialize help message listener
function joinCommands(commands) {
  return commands
    .map(command => `- \`${command.command || command.commands.join('` / `')}\` - ${command.message}`)
    .join('\n');
}
const helpText = `*Summary*

- Set up a team with a list of snippets to filter open issues and pull requests.

*Usage*

- \`help\` - display this message
${joinCommands(configure.commands)}
${joinCommands(pulls.commands)}
`;

controller.on('slash_command', (bot, message) => {
  if (eq(trim(message.text), 'help')) {
    bot.replyPublic(message, helpText);
  }
});
controller.hears('^help$', 'direct_message,direct_mention', (bot, message) => {
  bot.reply(message, helpText);
});

// initialize other listeners
configure.messenger(controller);
pulls.messenger(controller);
listener.messenger(controller);
