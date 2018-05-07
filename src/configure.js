const _ = require('lodash');

module.exports.commands = [{
  command: 'configure',
  message: 'configure settings for the current user'
}, {
  command: 'configure <team>',
  message: 'configure settings for the specified team'
}];

module.exports.messenger = controller => {

  controller.on('slash_command', (bot, message) => {
    const text = _.trim(message.text);
    if (_.eq(text, 'configure')) {
      configureUser(bot, message);
    } else if (_.startsWith(text)) {
      configureTeam(bot, message);
    } else {
      // ignore message
    }
  });
  controller.hears(['^configure (.*)$'], 'direct_message,direct_mention', configureTeam);
  controller.hears(['^configure\\w*$'], 'direct_message,direct_mention', configureUser);

  function configureTeam (bot, message) {
    configure(bot, message, message.match[1], false);
  }

  function configureUser (bot, message) {
    configure(bot, message, message.user, true);
  }

  function done (response, convo) {
    convo.say(`OK, you're done!`);
    convo.next();
  }

  function configure (bot, message, team, forUser) {
    bot.api.reactions.add({
      timestamp: message.ts,
      channel: message.channel,
      name: 'hourglass'
    }, (err) => {
      if (err) {
        console.error('Failed to add emoji reaction :(', err);
      }
    });

    // in case it's a slash command, we need to reply with something quickly
    bot.replyPrivate(message, ':hourglass:');

    const helpText = [
      '*Commands*',
      '- `details` - show the text snippets',
      forUser
        ? '- `username <github-username>` - register a github username'
        : '- `channel <slack-channel>` - register a slack channel',
      '- `add snippet <snippet-text>` - add text snippet to match',
      '- `remove snippet <snippet-text>` - remove text snippet to match',
      '- `done` - exit configuration'
    ].join(`\n`);

    const commandPatterns = [
      {
        pattern: 'exit|done',
        callback: done
      },
      {
        pattern: 'help',
        callback: (response, convo) => {
          convo.ask(helpText, commandPatterns);
          convo.next();
        }
      },
      {
        pattern: 'details',
        callback: (response, convo) => {
          controller.storage.users.get(team, (err, data) => {
            const messages = [];
            // github username ?
            if (!_.isEmpty(data.github_user)) {
              messages.push(`github username: \`${data.github_user}\``);
            }
            // slack channel ?
            if (!_.isEmpty(data.slack_channel)) {
              messages.push(`slack channel: \`${data.slack_channel}\``);
            }
            // snippets ?
            if (!_.isEmpty(data.snippets)) {
              messages.push(`snippets: \`${data.snippets.join('`, `')}\``);
            }
            // default message
            if (_.isEmpty(messages)) {
              messages.push('_not configured_');
            }
            convo.ask(messages.join('\n'), commandPatterns);
            convo.next();
          });
        }
      },
      {
        pattern: 'username (.*)',
        callback: (response, convo) => {
          if (!forUser) {
            // this is not valid for teams
            unknownInput(response, convo);
            return;
          }
          const username = response.match[1];
          controller.storage.users.get(team, (err, data) => {
            data.github_user = username;
            controller.storage.users.save(data, err => {
              if (err) {
                convo.ask(`Failed to save username: ${err}`, commandPatterns);
              } else {
                convo.ask(`Github username registered: _${username}_!`, commandPatterns)
              }
              convo.next();
            });
          });
        }
      },
      {
        pattern: 'channel (.*)',
        callback: (response, convo) => {
          if (forUser) {
            // this is not valid for users
            unknownInput(response, convo);
            return;
          }
          const channel = _.trimStart(response.match[1], '# ');
          controller.storage.users.get(team, (err, data) => {
            data.slack_channel = channel;
            controller.storage.users.save(data, err => {
              if (err) {
                convo.ask(`Failed to save channel: ${err}`, commandPatterns);
              } else {
                convo.ask(`Slack channel registered: _${channel}_!`, commandPatterns)
              }
              convo.next();
            });
          });
        }
      },
      {
        pattern: 'add snippet (.*)',
        callback: (response, convo) => {
          const newSnippet = response.match[1];
          controller.storage.users.get(team, (err, data) => {
            data.snippets = _.union(data.snippets, [newSnippet]);
            controller.storage.users.save(data, err => {
              if (err) {
                convo.ask(`Failed to add _${newSnippet}_! ${err}`, commandPatterns);
              } else {
                convo.ask(`Added _${newSnippet}_!`, commandPatterns);
              }
              convo.next();
            });
          });
        }
      },
      {
        pattern: 'remove snippet (.*)',
        callback: (response, convo) => {
          const removedSnippet = response.match[1];
          controller.storage.users.get(team, (err, data) => {
            data.snippets = _.without(data.snippets, removedSnippet);
            controller.storage.users.save(data, err => {
              if (err) {
                convo.ask(`Failed to remove _${removedSnippet}_! ${err}`, commandPatterns);
              } else {
                convo.ask(`Removed _${removedSnippet}_!`, commandPatterns);
              }
              convo.next();
            });
          });
        }
      },
      {
        default: true,
        callback: unknownInput
      }
    ];

    function unknownInput (response, convo) {
      // just repeat the question
      convo.ask(`I didn't get that. Try \`help\` for a list of commands.`, commandPatterns);
      convo.next();
    }

    bot.startPrivateConversation(message, (err, convo) => {
      if (err) {
        console.error(`Failed to start private conversation: ${err}`);
        return;
      }

      function beginConfiguration (convo) {
        if (forUser) {
          convo.ask(`Configuring your user ... or ask \`help\`.`, commandPatterns);
        } else {
          convo.ask(`Configuring _${team}_ ... or ask \`help\`.`, commandPatterns);
        }
        convo.next();
      }

      function saveHandler (err) {
        if (err) {
          convo.say(`Failed to save data: ${err}`);
          convo.next();
        } else {
          beginConfiguration(convo);
        }
      }

      controller.storage.users.get(team, (err, data) => {
        if (data) {
          // configure existing user or team
          beginConfiguration(convo);
        } else if (forUser) {
          // create new user config
          convo.ask(`To get started, please enter your github username...`, response => {
            controller.storage.users.save({
              id: team,
              github_user: response.text
            }, saveHandler);
          });
          convo.next();
        } else {
          // create new team
          convo.ask(`Would you like to define a new team called _${team}_?`, [
            {
              pattern: bot.utterances.no,
              callback: done
            },
            {
              pattern: bot.utterances.yes,
              callback: () => {
                controller.storage.users.save({
                  id: team
                }, saveHandler);
              }
            },
            {
              default: true,
              callback: (response, convo) => {
                convo.repeat();
                convo.next();
              }
            }
          ]);
          convo.next();
        }
      });
    });
  }
};
