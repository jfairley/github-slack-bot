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
    {pattern: /^help$/i, callback: showHelp},
    {pattern: /^list$/i, callback: listTeams},
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
    {pattern: /^(.*)$/i, callback: listPRs}
  ];

  controller.setupWebserver(3000, (err, webserver) => controller.createWebhookEndpoints(webserver));
  controller.on('slash_command', (bot, message) => handlePattern(bot, message, message.text));
  controller.hears('(pulls|prs)(.*)', 'direct_message,direct_mention,mention', (bot, message) => handlePattern(bot, message, _.trim(message.match[2])));

  function handlePattern (bot, message, pattern) {
    bot.api.reactions.add({
      timestamp: message.ts,
      channel: message.channel,
      name: 'hourglass'
    }, (err) => {
      if (err) {
        console.error('Failed to add emoji reaction :(', err);
      }
    });

    for (let i = 0; i < actions.length; i++) {
      let action = actions[i];
      let matches = action.pattern.exec(pattern);
      if (matches) {
        return action.callback.apply(null, _.flatten([bot, message, _.slice(matches, 1)]));
      }
    }

    bot.reply(message, 'Error: Unknown command `' + message.text + '`');
  }

  function showHelp (bot, message) {
    return bot.reply(message, `*Summary*

Set up a team with a list of snippets to filter open issues and pull requests.

*Usage*

- \`pulls help\` - display this message

*User Commands*

- \`pulls\` - show all issues and pull-requests based on the snippets defined for the current user
- \`pulls details\` - show the snippets for the current user
- \`pulls username <github-username>\` - regiseter a github username for the current user
- \`pulls add snippet foo\` - add "foo" as a snippet for the current user
- \`pulls remove snippet foo\` - remove "foo" as a snippet for the current user

*Team Commands*

- \`pulls list\` - show all teams
- \`pulls my-team\` - show all issues and pull-requests based on the snippets defined as "my-team"
- \`pulls add team my-team\` - add a team called "my-team"
- \`pulls remove team my-team\` - remove a team called "my-team"
- \`pulls rename team my-team to my-new-team\` - rename a team called "my-team" to "my-new-team"
- \`pulls details my-team\` - show the snippets for "my-team"
- \`pulls add snippet foo to my-team\` - add "foo" as a snippet for "my-team"
- \`pulls remove snippet foo from my-team\` - remove "foo" as a snippet for "my-team"`);
  }

  /**
   * search for PRs for the current user
   */
  function listPRsForUser (bot, message) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot, message);
      } else {
        listPRs(bot, message, userId);
      }
    });
  }

  /**
   * search for PRs
   */
  function listPRs (bot, message, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        return teamDoesNotExist(bot, message, team);
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
          bot.reply(message, {
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

              return {
                color: color,
                text: `${link} (${resp.user.login})`,
                fields: extras
              }
            })
          }, err => err ? reject(err) : resolve());
        }))
        .then(data => _.isEmpty(data) ? bot.reply(message, `No matching issues!! You're in the clear.`) : data)
        .catch(err => bot.reply(message, `Unhandled error:\n${err}`));
    });
  }

  /**
   * show configured teams
   */
  function listTeams (bot, message) {
    controller.storage.users.all((err, data) => {
      bot.reply(message, `Configured teams:\n${_.keys(data).map(key => ` - ${key}`).join('\n')}`);
    });
  }

  /**
   * create a team for the current user and add the github username as a snippet
   */
  function newTeamForUser (bot, message, snippet) {
    const userId = message.user;
    controller.storage.users.save({id: userId, github_user: snippet}, err => {
      if (err) {
        bot.reply(message, 'failed to save data ' + err);
      } else {
        bot.reply(
          message,
          `Github username registered: \`${snippet}\`! From now on, just type \'pulls\' to see your issues.`,
          err => err ? null : listPRsForUser(bot, message)
        );
      }
    });
  }

  /**
   * create a new team
   */
  function newTeam (bot, message, team) {
    controller.storage.users.get(team, (err, data) => {
      if (data) {
        bot.reply(message, `Error: Team already exists. See \`${message.match[1]} details ${team}\`.`);
      } else {
        controller.storage.users.save({id: team, snippets: []}, err => {
          if (err) {
            bot.reply(message, `Failed to create team. ${err}`);
          } else {
            bot.reply(message, `Created team: ${team}!`);
          }
        });
      }
    });
  }

  /**
   * delete a team
   */
  function removeTeam (bot, message) {
    bot.reply(message, 'not yet implemented');
  }

  /**
   * rename a team
   */
  function renameTeam (bot, message) {
    bot.reply(message, 'not yet implemented');
  }

  /**
   * show details for the current user
   */
  function teamDetailsForUser (bot, message) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot, message);
      } else {
        teamDetails(bot, message, userId);
      }
    });
  }

  /**
   * show details for a list of snippets
   */
  function teamDetails (bot, message, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        teamDoesNotExist(bot, message, team)
      } else {
        const snippets = getSnippets(data, true);
        bot.reply(message, `Details for ${team}:\n${snippets.map(snippet => ` - ${snippet}`).join('\n')}`);
      }
    });
  }

  /**
   * add a snippet for the current user
   */
  function addSnippetForUser (bot, message, newSnippet) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot, message);
      } else {
        addSnippet(bot, message, newSnippet, userId);
      }
    });
  }

  /**
   * add a snippet to a team
   */
  function addSnippet (bot, message, newSnippet, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        teamDoesNotExist(bot, message, team);
      } else {
        data.snippets = flatten(getSnippets(data, false), newSnippet);
        controller.storage.users.save(data, err => {
          if (err) {
            bot.reply(message, `Failed to add ${newSnippet}! ${err}`);
          } else {
            bot.reply(message, `Added ${newSnippet}!`);
          }
        });
      }
    });
  }

  /**
   * remove a snippet for the current user
   */
  function removeSnippetForUser (bot, message, removedSnippet) {
    const userId = message.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot, message);
      } else {
        removeSnippet(bot, message, removedSnippet, userId);
      }
    });
  }

  /**
   * remove a snippet from a team
   */
  function removeSnippet (bot, message, removedSnippet, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        teamDoesNotExist(bot, message, team);
      } else {
        data = _.merge(data, {snippets: _.without(getSnippets(data, false), removedSnippet)});
        controller.storage.users.save(data, err => {
          if (err) {
            bot.reply(message, `Failed to remove ${removedSnippet}! ${err}`);
          } else {
            bot.reply(message, `Removed ${removedSnippet}!`);
          }
        });
      }
    });
  }

  function provideUsername (bot, message) {
    return bot.reply(message, `Please provide your username: \`pulls username <github username>\``);
  }

  function teamDoesNotExist (bot, message, team) {
    return bot.reply(message, `Error: Team does not exist. See \`${message.match[1]} new team ${team}\`.`);
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
