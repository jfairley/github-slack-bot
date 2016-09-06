'use strict';

// create shared slack bot controller
const Botkit = require('botkit');
const controller = Botkit.slackbot({
  debug: true
});


require('./src/pulls')(controller);
require('./src/listener')(controller);
