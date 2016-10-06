'use strict';

if (!process.env.GITHUB_TOKEN) {
  console.error('Error: Specify GITHUB_TOKEN in environment');
  process.exit(1);
}

const authorization = `token ${process.env.GITHUB_TOKEN}`;
const _ = require('lodash');
const request = require('superagent');
const Promise = require('bluebird');

module.exports.commands = [{
  command: 'list',
  message: 'show matching issues and pull-requests for the current user'
}, {
  commands: ['list <team>', '<team>'],
  message: 'show matching issues and pull-requests for the specified team'
}, {
  command: 'details',
  message: 'show the configuration for the current user'
}, {
  command: 'details <team>',
  message: 'show the configuration for the specified team'
}, {
  command: 'teams',
  message: 'show all configured users and teams'
}];

module.exports.messenger = controller => {

  const actions = [
    {pattern: /^$/i, callback: listPRsForUser},
    // {pattern: /^configure(.*)$/i, callback: configure},
    {pattern: /^list (.*)$/i, callback: listPRs},
    {pattern: /^list$/i, callback: listPRsForUser},
    {pattern: /^pulls (.*)$/i, callback: listPRs},
    {pattern: /^pulls$/i, callback: listPRsForUser},
    {pattern: /^teams$/i, callback: listTeams},
    {pattern: /^details (.*)$/i, callback: teamDetails},
    {pattern: /^details$/i, callback: teamDetailsForUser},
    {pattern: /^(.*)$/i, callback: handleUnrecognized}
  ];

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
      bot_reply(message, `Configured teams:\n${data.map(team => ` - ${team.id}`).join('\n')}`);
    });
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
