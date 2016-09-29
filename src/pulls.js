'use strict';

if (!process.env.GITHUB_TOKEN) {
  console.error('Error: Specify GITHUB_TOKEN in environment');
  process.exit(1);
}

const authorization = `token ${process.env.GITHUB_TOKEN}`;
const _ = require('lodash');
const request = require('superagent');
const Promise = require('bluebird');

module.exports = controller => {

  const actions = [
    {pattern: /^$/i, callback: listPRsForUser},
    {pattern: /^list (.*)$/i, callback: listPRs},
    {pattern: /^list$/i, callback: listPRsForUser},
    {pattern: /^pulls (.*)$/i, callback: listPRs},
    {pattern: /^pulls$/i, callback: listPRsForUser},
    {pattern: /^help$/i, callback: showHelp},
    {pattern: /^teams$/i, callback: listTeams},
    {pattern: /^add team (.*)$/i, callback: newTeam},
    {pattern: /^new team (.*)$/i, callback: newTeam},
    {pattern: /^username (.*)$/i, callback: newTeamForUser},
    {pattern: /^delete team (.*)$/i, callback: removeTeam},
    {pattern: /^remove team (.*)$/i, callback: removeTeam},
    {pattern: /^rename team (.*) to (.*)$/i, callback: renameTeam},
    {pattern: /^details (.*)$/i, callback: teamDetails},
    {pattern: /^details$/i, callback: teamDetailsForUser},
    {pattern: /^add snippet (.*) to (.*)$/i, callback: addSnippet},
    {pattern: /^add snippet (.*)$/i, callback: addSnippetForUser},
    {pattern: /^new snippet (.*) to (.*)$/i, callback: addSnippet},
    {pattern: /^new snippet (.*)$/i, callback: addSnippetForUser},
    {pattern: /^delete snippet (.*) from (.*)$/i, callback: removeSnippet},
    {pattern: /^delete snippet (.*)$/i, callback: removeSnippetForUser},
    {pattern: /^remove snippet (.*) from (.*)$/i, callback: removeSnippet},
    {pattern: /^remove snippet (.*)$/i, callback: removeSnippetForUser},
    {pattern: /^(.*)$/i, callback: handleUnrecognized}
  ];

  controller.setupWebserver(3000, (err, webserver) => controller.createWebhookEndpoints(webserver));
  controller.on('slash_command', (bot, message) => handlePattern(bot, bot.replyPublicDelayed, message));
  controller.hears('^([^\/].*)$', 'direct_message,direct_mention', (bot, message) => handlePattern(bot, bot.reply, message));

  function handlePattern (bot, bot_reply, message) {
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

    for (let i = 0; i < actions.length; i++) {
      let action = actions[i];
      let matches = action.pattern.exec(message.text);
      if (matches) {
        return action.callback.apply(null, _.flatten([bot_reply, message, _.slice(matches, 1)]));
      }
    }

    bot_reply(message, 'Error: Unknown command `' + message.text + '`');
  }

  function showHelp (bot_reply, message) {
    return bot_reply(message, `*Summary*

Set up a team with a list of snippets to filter open issues and pull requests.

*Usage*

- \`help\` - display this message

*User Commands*

- \`list\` - show all issues and pull-requests based on the defined snippets
- \`details\` - show the text snippets
- \`username <github-username>\` - register a github username
- \`add snippet <snippet-text>\` - add text snippet to match
- \`remove snippet <snippet-text>\` - remove text snippet to match

*Team Commands*

- \`teams\` - show all teams
- \`<my-team>\` - show all issues and pull-requests based on the snippets defined as "my-team"
- \`add team <my-team>\` - add a team called "my-team"
- \`remove team <my-team>\` - remove a team called "my-team"
- \`rename team <my-team> to <my-new-team>\` - rename a team called "my-team" to "my-new-team"
- \`details <my-team>\` - show the text snippets for "my-team"
- \`add snippet <snippet-text> to <my-team>\` - add text snippet to match for "my-team"
- \`remove snippet <snippet-text> from <my-team>\` - remove text snippet to match for "my-team"`);
  }

  function handleUnrecognized (bot_reply, message, text) {
    controller.storage.users.get(text, (err, data) => {
      if (!data) {
        bot_reply(message, 'Unrecognized input. Ask for `help` to see a list of commands.');
      } else {
        listPRs(bot_reply, message, text);
      }
    });
  }

  /**
   * search for PRs for the current user
   */
  function listPRsForUser (bot_reply, message) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot_reply, message);
      } else {
        listPRs(bot_reply, message, userId);
      }
    });
  }

  /**
   * search for PRs
   */
  function listPRs (bot_reply, message, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        return teamDoesNotExist(bot_reply, message, team);
      }
      const snippets = getSnippets(data, true);
      return Promise.resolve(fetchOrgIssues())
        .then(body => _.values(groupByRepositoryUrl(body)))
        .map(group => filterUninterestingLinks(group, snippets))
        .filter(group => !_.isEmpty(group))
        .map(group => Promise.map(group, body => {
          if (_.has(body, 'pull_request')) {
            return request.get(body.pull_request.url)
              .set('Authorization', authorization)
              .then(res => {
                body.pull_request = res.body;
                return body;
              });
          } else {
            return body;
          }
        }))
        .map(group => new Promise((resolve, reject) => {
          bot_reply(message, {
            text: `*${group[0].repository.name}*`,
            attachments: group.map(resp => {
              const link = `<${resp.html_url}|${resp.title}>`;
              const extras = [];
              // has assignee?
              if (_.has(resp, 'assignee.login')) {
                extras.push({
                  title: 'Assignee',
                  value: resp.assignee.login,
                  short: true
                });
              }
              // has labels?
              if (!_.isEmpty(resp.labels)) {
                extras.push({
                  title: `Label${1 < resp.labels.length ? 's' : ''}`,
                  value: resp.labels.map(l => l.name).join(', '),
                  short: true
                })
              }

              let color;
              switch (_.get(resp, 'pull_request.mergeable_state')) {
                case 'clean':
                  color = 'good';
                  break;
                case 'unknown':
                  color = 'warning';
                  break;
                case 'unstable':
                case 'dirty':
                  color = 'danger';
                  break;
              }

              // render extras as multiline text for brevity
              let moreTexts = extras.map(e => `- *${e.title}*: ${e.value}`);
              return {
                color: color,
                text: `${link} (${resp.user.login})\n${moreTexts.join('\n')}`,
                mrkdwn_in: ['text']
              }
            })
          }, err => err ? reject(err) : resolve());
        }))
        .then(data => _.isEmpty(data) ? bot_reply(message, `No matching issues!! You're in the clear.`) : data)
        .catch(err => bot_reply(message, `Unhandled error:\n${err}`));
    });
  }

  /**
   * show configured teams
   */
  function listTeams (bot_reply, message) {
    controller.storage.users.all((err, data) => {
      bot_reply(message, `Configured teams:\n${_.keys(data).map(key => ` - ${key}`).join('\n')}`);
    });
  }

  /**
   * create a team for the current user and add the github username as a snippet
   */
  function newTeamForUser (bot_reply, message, snippet) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        data = {id: userId};
      }
      data.github_user = snippet;
      controller.storage.users.save(data, err => {
        if (err) {
          bot_reply(message, 'failed to save data ' + err);
        } else {
          bot_reply(
            message,
            `Github username registered: \`${snippet}\`! From now on, just type \`list\` to see your issues, or type \`help\` to see a list of commands.`,
            err => err ? null : listPRsForUser(bot_reply, message)
          );
        }
      });
    });
  }

  /**
   * create a new team
   */
  function newTeam (bot_reply, message, team) {
    controller.storage.users.get(team, (err, data) => {
      if (data) {
        bot_reply(message, `Error: Team already exists. See \`details ${team}\`.`);
      } else {
        if (!data) {
          data = {id: team};
        }
        data.snippets = [];
        controller.storage.users.save(data, err => {
          if (err) {
            bot_reply(message, `Failed to create team. ${err}`);
          } else {
            bot_reply(message, `Created team: ${team}!`);
          }
        });
      }
    });
  }

  /**
   * delete a team
   */
  function removeTeam (bot_reply, message) {
    bot_reply(message, 'not yet implemented');
  }

  /**
   * rename a team
   */
  function renameTeam (bot_reply, message) {
    bot_reply(message, 'not yet implemented');
  }

  /**
   * show details for the current user
   */
  function teamDetailsForUser (bot_reply, message) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot_reply, message);
      } else {
        teamDetails(bot_reply, message, userId);
      }
    });
  }

  /**
   * show details for a list of snippets
   */
  function teamDetails (bot_reply, message, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        teamDoesNotExist(bot_reply, message, team)
      } else {
        const snippets = getSnippets(data, true);
        bot_reply(message, `Details for ${team}:\n${snippets.map(snippet => ` - ${snippet}`).join('\n')}`);
      }
    });
  }

  /**
   * add a snippet for the current user
   */
  function addSnippetForUser (bot_reply, message, newSnippet) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot_reply, message);
      } else {
        addSnippet(bot_reply, message, newSnippet, userId);
      }
    });
  }

  /**
   * add a snippet to a team
   */
  function addSnippet (bot_reply, message, newSnippet, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        teamDoesNotExist(bot_reply, message, team);
      } else {
        data.snippets = flatten(getSnippets(data, false), newSnippet);
        controller.storage.users.save(data, err => {
          if (err) {
            bot_reply(message, `Failed to add ${newSnippet}! ${err}`);
          } else {
            bot_reply(message, `Added ${newSnippet}!`);
          }
        });
      }
    });
  }

  /**
   * remove a snippet for the current user
   */
  function removeSnippetForUser (bot_reply, message, removedSnippet) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot_reply, message);
      } else {
        removeSnippet(bot_reply, message, removedSnippet, userId);
      }
    });
  }

  /**
   * remove a snippet from a team
   */
  function removeSnippet (bot_reply, message, removedSnippet, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        teamDoesNotExist(bot_reply, message, team);
      } else {
        data = _.merge(data, {snippets: _.without(getSnippets(data, false), removedSnippet)});
        controller.storage.users.save(data, err => {
          if (err) {
            bot_reply(message, `Failed to remove ${removedSnippet}! ${err}`);
          } else {
            bot_reply(message, `Removed ${removedSnippet}!`);
          }
        });
      }
    });
  }

  function provideUsername (bot_reply, message) {
    return bot_reply(message, `Please provide your username: \`username <github username>\``);
  }

  function teamDoesNotExist (bot_reply, message, team) {
    return bot_reply(message, `Error: Team does not exist. See \`new team ${team}\`.`);
  }
};

function flatten () {
  return _.compact(_.uniq(_.flatten(arguments)));
}

function getSnippets (data, withUser) {
  const snippets = _.get(data, 'snippets', []);
  return withUser ? flatten(snippets, _.get(data, 'github_user')) : snippets;
}

/**
 * Fetch organization issues
 */
function fetchOrgIssues () {
  return request.get('https://api.github.com/orgs/levelsbeyond/issues?filter=all')
    .set('Authorization', authorization)
    .then(res => res.body);
}

/**
 * return sorted array of arrays
 * @param pulls
 */
function groupByRepositoryUrl (pulls) {
  pulls = _.sortBy(pulls, 'repository_url');
  return _.groupBy(pulls, 'repository_url');
}

/**
 * filter array of pull objects, removing those that do not match one of the snippets
 * @param body
 * @param snippets
 * @returns {Array}
 */
function filterUninterestingLinks (body, snippets) {
  return body
    .filter(resp =>
      snippets.some(snippet =>
        -1 < resp.title.indexOf(snippet)
        || -1 < resp.body.indexOf(snippet)
        || _.isEqual(_.get(resp, 'assignee.login'), _.trim(snippet, ' @'))
        || _.isEqual(_.get(resp, 'user.login'), _.trim(snippet, ' @'))
      )
    );
}
