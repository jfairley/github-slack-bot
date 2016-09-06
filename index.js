
// create slack bot
var Botkit = require('botkit');
var controller = Botkit.slackbot({
  debug: true
});


require('./src/pulls')(controller);
require('./src/listener')(controller);
