'use strict';

if (!process.env.GITHUB_TOKEN) {
  console.error('Error: Specify GITHUB_TOKEN in environment');
  process.exit(1);
}

const _ = require('lodash');
const request = require('superagent');
const Promise = require('bluebird');

module.exports = controller => {

  const actions = [
    {pattern: /^$/i, callback: listPRsForUser},
    {pattern: /^ list$/i, callback: listTeams},
    {pattern: /^ add team (.*)$/i, callback: newTeam},
    {pattern: /^ new team (.*)$/i, callback: newTeam},
    {pattern: /^ username (.*)$/i, callback: newTeamForUser},
    {pattern: /^ delete team (.*)$/i, callback: removeTeam},
    {pattern: /^ remove team (.*)$/i, callback: removeTeam},
    {pattern: /^ rename team (.*) to (.*)$/i, callback: renameTeam},
    {pattern: /^ details (.*)$/i, callback: teamDetails},
    {pattern: /^ details$/i, callback: teamDetailsForUser},
    {pattern: /^ add snippet (.*) to (.*)$/i, callback: addSnippet},
    {pattern: /^ add snippet (.*)$/i, callback: addSnippetForUser},
    {pattern: /^ new snippet (.*) to (.*)$/i, callback: addSnippet},
    {pattern: /^ new snippet (.*)$/i, callback: addSnippetForUser},
    {pattern: /^ delete snippet (.*) from (.*)$/i, callback: removeSnippet},
    {pattern: /^ delete snippet (.*)$/i, callback: removeSnippetForUser},
    {pattern: /^ remove snippet (.*) from (.*)$/i, callback: removeSnippet},
    {pattern: /^ remove snippet (.*)$/i, callback: removeSnippetForUser},
    {pattern: /^ (.*)$/i, callback: listPRs}
  ];

  controller.hears('(pulls|prs)(.*)', 'direct_message,direct_mention,mention', (bot, msg) => {
    let pattern = msg.match[2];
    for (let i = 0; i < actions.length; i++) {
      let action = actions[i];
      let matches = action.pattern.exec(pattern);
      if (matches) {
        return action.callback.apply(null, _.flatten([bot, msg, _.slice(matches, 1)]));
      }
    }

    bot.reply(msg, 'Error: Unknown command `' + msg.text + '`');
  });

  /**
   * search for PRs for the current user
   */
  function listPRsForUser (bot, msg) {
    const userId = msg.user;
    controller.storage.users.get(userId, (err, data) => {
      if (err) {
        bot.reply(msg, 'Failed to load data', err);
      } else if (!data) {
        provideUsername(bot, msg);
      } else {
        listPRs(bot, msg, userId);
      }
    });
  }

  /**
   * search for PRs
   */
  function listPRs (bot, msg, team) {
    controller.storage.users.get(team, (err, data) => {
      if (err) {
        bot.reply(msg, 'Failed to load data', err);
        return;
      } else if (!data) {
        return teamDoesNotExist(bot, msg, team);
      }
      const snippets = getSnippets(data, true);
      return Promise.resolve(fetchOrgIssues())
        .then(body => _.values(groupByRepositoryUrl(body)))
        .map(group => filterUninterestingLinks(group, snippets))
        .filter(group => !_.isEmpty(group))
        .map(group => {
          return new Promise((resolve, reject) => {
            bot.reply(msg, {
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

                return {
                  color: '#00aeef', // TODO: status color
                  text: `${link} (${resp.user.login})`,
                  fields: extras
                }
              })
            }, err => err ? reject(err) : resolve());
          });
        })
        .then(data => _.isEmpty(data) ? bot.reply(msg, `No matching issues!! You're in the clear.`) : data)
        .catch(err => bot.reply(msg, `Unhandled error:\n${err}`));
    });
  }

  /**
   * show configured teams
   */
  function listTeams (bot, msg) {
    controller.storage.users.all((err, data) => {
      bot.reply(msg, `Configured teams:\n${_.keys(data).map(key => ` - ${key}`).join('\n')}`);
    });
  }

  /**
   * create a team for the current user and add the github username as a snippet
   */
  function newTeamForUser (bot, msg, snippet) {
    const userId = msg.user;
    controller.storage.users.save({id: userId, github_user: snippet}, err => {
      if (err) {
        bot.reply(msg, 'failed to save data ' + err);
      } else {
        bot.reply(
          msg,
          `Github username registered: \`${snippet}\`! From now on, just type \'pulls\' to see your issues.`,
          err => err ? null : listPRsForUser(bot, msg)
        );
      }
    });
  }

  /**
   * create a new team
   */
  function newTeam (bot, msg, team) {
    controller.storage.users.get(team, (err, data) => {
      if (err) {
        bot.reply(msg, 'Failed to load data ' + err);
      } else if (data) {
        bot.reply(msg, `Error: Team already exists. See \`${msg.match[1]} details ${team}\`.`);
      } else {
        controller.storage.users.save({id: team, snippets: []}, err => {
          if (err) {
            bot.reply(msg, `Failed to create team. ${err}`);
          } else {
            bot.reply(msg, `Created team: ${team}!`);
          }
        });
      }
    });
  }

  /**
   * delete a team
   */
  function removeTeam (bot, msg) {
    bot.reply(msg, 'not yet implemented');
  }

  /**
   * rename a team
   */
  function renameTeam (bot, msg) {
    bot.reply(msg, 'not yet implemented');
  }

  /**
   * show details for the current user
   */
  function teamDetailsForUser (bot, msg) {
    const userId = msg.user;
    controller.storage.users.get(userId, (err, data) => {
      if (err) {
        bot.reply(msg, 'Failed to load data ' + err);
      } else if (!data) {
        provideUsername(bot, msg);
      } else {
        teamDetails(bot, msg, userId);
      }
    });
  }

  /**
   * show details for a list of snippets
   */
  function teamDetails (bot, msg, team) {
    controller.storage.users.get(team, (err, data) => {
      if (err) {
        bot.reply(msg, 'Failed to load data ' + err);
      } else if (!data) {
        teamDoesNotExist(bot, msg, team)
      } else {
        const snippets = getSnippets(data, true);
        bot.reply(msg, `Details for ${team}:\n${snippets.map(snippet => ` - ${snippet}`).join('\n')}`);
      }
    });
  }

  /**
   * add a snippet for the current user
   */
  function addSnippetForUser (bot, msg, newSnippet) {
    const userId = msg.user;
    controller.storage.users.get(userId, (err, data) => {
      if (err) {
        bot.reply(msg, 'Failed to load data ' + err);
      } else if (!data) {
        provideUsername(bot, msg);
      } else {
        addSnippet(bot, msg, newSnippet, userId);
      }
    });
  }

  /**
   * add a snippet to a team
   */
  function addSnippet (bot, msg, newSnippet, team) {
    controller.storage.users.get(team, (err, data) => {
      if (err) {
        bot.reply(msg, 'Failed to load data ' + err);
      } else if (!data) {
        teamDoesNotExist(bot, msg, team);
      } else {
        const snippets = getSnippets(data, false);
        controller.storage.users.save({id: team, snippets: flatten(snippets, newSnippet)}, err => {
          if (err) {
            bot.reply(msg, `Failed to add ${newSnippet}! ${err}`);
          } else {
            bot.reply(msg, `Added ${newSnippet}!`);
          }
        });
      }
    });
  }

  /**
   * remove a snippet for the current user
   */
  function removeSnippetForUser (bot, msg, removedSnippet) {
    const userId = msg.user;
    controller.storage.users.get(userId, (err, data) => {
      if (!data) {
        provideUsername(bot, msg);
      } else {
        removeSnippet(bot, msg, removedSnippet, userId);
      }
    });
  }

  /**
   * remove a snippet from a team
   */
  function removeSnippet (bot, msg, removedSnippet, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        teamDoesNotExist(bot, msg, team);
      } else {
        const snippets = getSnippets(data, false);
        controller.storage.users.save({id: team, snippets: _.without(snippets, removedSnippet)}, err => {
          if (err) {
            bot.reply(msg, `Failed to remove ${removedSnippet}! ${err}`);
          } else {
            bot.reply(msg, `Removed ${removedSnippet}!`);
          }
        });
      }
    });
  }

  function provideUsername (bot, msg) {
    return bot.reply(msg, `Please provide your username: \`pulls username <github username>\``);
  }

  function teamDoesNotExist (bot, msg, team) {
    return bot.reply(msg, `Error: Team does not exist. See \`${msg.match[1]} new team ${team}\`.`);
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
    .set('Authorization', `token ${process.env.GITHUB_TOKEN}`)
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
