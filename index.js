'use strict';

console.log('Starting Botkit...');
if (process.env.SLACK_BOT_STORAGE) {
  console.log('Using persistent storage location:', process.env.SLACK_BOT_STORAGE);
}

// create shared slack bot controller
const Botkit = require('botkit');
const controller = Botkit.slackbot({
  debug: process.env.SLACK_BOT_DEBUG === 'true',
  json_file_store: process.env.SLACK_BOT_STORAGE
});


require('./src/pulls')(controller);
require('./src/listener')(controller);
