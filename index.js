if (!process.env.GITHUB_TOKEN) {
  console.log('Error: Specify GITHUB_TOKEN in environment');
  process.exit(1);
}


// create slack bot
var Botkit = require('botkit');
var controller = Botkit.slackbot({
  debug: true
});


require('./src/pulls')(controller);
require('./src/listener')(controller);
