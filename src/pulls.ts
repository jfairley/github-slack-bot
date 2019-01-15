import * as Github from '@octokit/rest';
import * as Promise from 'bluebird';
import {
  compact,
  flatten as lodash_flatten,
  get,
  groupBy,
  has,
  isEmpty,
  isEqual,
  slice,
  sortBy,
  trim,
  uniq,
  values
} from 'lodash';

if (!process.env.GITHUB_TOKEN) {
  console.error('Error: Specify GITHUB_TOKEN in environment');
  process.exit(1);
}

const github = new Github();
github.authenticate({
  type: 'token',
  token: process.env.GITHUB_TOKEN
});

export const commands = [
  {
    command: 'list',
    message: 'show matching issues and pull-requests for the current user'
  },
  {
    commands: ['list <team>', '<team>'],
    message: 'show matching issues and pull-requests for the specified team'
  },
  {
    command: 'details',
    message: 'show the configuration for the current user'
  },
  {
    command: 'details <team>',
    message: 'show the configuration for the specified team'
  },
  {
    command: 'teams',
    message: 'show all configured users and teams'
  }
];

export const messenger = controller => {
  const actions = [
    { pattern: /^$/i, callback: listPRsForUser },
    { pattern: /^list (.*)$/i, callback: listPRs },
    { pattern: /^list$/i, callback: listPRsForUser },
    { pattern: /^pulls (.*)$/i, callback: listPRs },
    { pattern: /^pulls$/i, callback: listPRsForUser },
    { pattern: /^teams$/i, callback: listTeams },
    { pattern: /^details (.*)$/i, callback: teamDetails },
    { pattern: /^details$/i, callback: teamDetailsForUser },
    { pattern: /^(.*)$/i, callback: handleUnrecognized }
  ];

  controller.on('slash_command', (bot, message) => handlePattern(bot, bot.replyPublicDelayed, message));
  controller.hears('^([^/].*)$', 'direct_message,direct_mention', (bot, message) =>
    handlePattern(bot, bot.reply, message)
  );

  function handlePattern(bot, bot_reply, message) {
    bot.api.reactions.add(
      {
        timestamp: message.ts,
        channel: message.channel,
        name: 'hourglass'
      },
      err => {
        if (err) {
          console.error('Failed to add emoji reaction :(', err);
        }
      }
    );

    // in case it's a slash command, we need to reply with something quickly
    bot.replyPrivate(message, ':hourglass:');

    for (const action of actions) {
      const matches = action.pattern.exec(message.text);
      if (matches) {
        return action.callback.apply(null, flatten([bot_reply, message, slice(matches, 1)]));
      }
    }

    bot_reply(message, 'Error: Unknown command `' + message.text + '`');
  }

  function handleUnrecognized(bot_reply, message, text) {
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
  function listPRsForUser(bot_reply, message) {
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
  function listPRs(bot_reply, message, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        return teamDoesNotExist(bot_reply, message, team);
      }
      const snippets = getSnippets(data, true);
      return Promise.resolve(fetchOrgIssues())
        .then(body => values(groupByRepositoryUrl(body)))
        .map(group => filterUninterestingLinks(group, snippets))
        .filter(group => !isEmpty(group))
        .map(group =>
          Promise.map(group, (body: any) => {
            if (has(body, 'pull_request')) {
              return github.pulls
                .get({
                  number: body.number,
                  owner: body.repository.owner.login,
                  repo: body.repository.name
                })
                .then(res => {
                  body.pull_request = res.data;
                  return body;
                });
            } else {
              return body;
            }
          })
        )
        .map(
          (group: any[]) =>
            new Promise((resolve, reject) => {
              bot_reply(
                message,
                {
                  text: `*${group[0].repository.name}*`,
                  attachments: group.map(resp => {
                    const link = `<${resp.html_url}|${resp.title}>`;
                    const extras = [];
                    // has assignee?
                    if (has(resp, 'assignee.login')) {
                      extras.push({
                        title: 'Assignee',
                        value: resp.assignee.login,
                        short: true
                      });
                    }
                    // has labels?
                    if (!isEmpty(resp.labels)) {
                      extras.push({
                        title: `Label${1 < resp.labels.length ? 's' : ''}`,
                        value: resp.labels.map(l => l.name).join(', '),
                        short: true
                      });
                    }

                    let color;
                    switch (get(resp, 'pull_request.mergeable_state')) {
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
                    const moreTexts = extras.map(e => `- *${e.title}*: ${e.value}`);
                    return {
                      color,
                      text: `${link} (${resp.user.login})\n${moreTexts.join('\n')}`,
                      mrkdwn_in: ['text']
                    };
                  })
                },
                err => (err ? reject(err) : resolve())
              );
            })
        )
        .then(data => (isEmpty(data) ? bot_reply(message, `No matching issues!! You're in the clear.`) : data))
        .catch(err => bot_reply(message, `Unhandled error:\n${err}`));
    });
  }

  /**
   * show configured teams
   */
  function listTeams(bot_reply, message) {
    controller.storage.users.all((err, data) => {
      bot_reply(
        message,
        `Configured teams:\n${data
          .map(team => (/^U\w{8}$/.test(team.id) ? ` - ${team.id} (<@${team.id}>)` : ` - ${team.id}`))
          .join('\n')}`
      );
    });
  }

  /**
   * show details for the current user
   */
  function teamDetailsForUser(bot_reply, message) {
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
  function teamDetails(bot_reply, message, team) {
    controller.storage.users.get(team, (err, data) => {
      if (!data) {
        teamDoesNotExist(bot_reply, message, team);
      } else {
        const messages = [];
        // github username ?
        if (!isEmpty(data.github_user)) {
          messages.push(`github username: \`${data.github_user}\``);
        }
        // slack channel ?
        if (!isEmpty(data.slack_channel)) {
          messages.push(`slack channel: \`${data.slack_channel}\``);
        }
        // snippets ?
        if (!isEmpty(data.snippets)) {
          messages.push(`snippets: \`${data.snippets.join('`, `')}\``);
        }
        // default message
        if (isEmpty(messages)) {
          messages.push('_not configured_');
        }
        bot_reply(message, messages.join('\n'));
      }
    });
  }

  function provideUsername(bot_reply, message) {
    return bot_reply(message, `Please provide your username: \`username <github username>\``);
  }

  function teamDoesNotExist(bot_reply, message, team) {
    return bot_reply(message, `Error: Team does not exist. See \`new team ${team}\`.`);
  }
};

function flatten(...args: any[]) {
  return compact(uniq(lodash_flatten(args)));
}

function getSnippets(data, withUser) {
  const snippets = get(data, 'snippets', []);
  return withUser ? flatten(snippets, get(data, 'github_user')) : snippets;
}

/**
 * Fetch organization issues
 */
function fetchOrgIssues() {
  return github.issues
    .listForOrg({
      org: 'levelsbeyond',
      filter: 'all',
      state: 'open'
    })
    .then(res => res.data);
}

/**
 * return sorted array of arrays
 * @param pulls
 */
function groupByRepositoryUrl(pulls) {
  pulls = sortBy(pulls, 'repository_url');
  return groupBy(pulls, 'repository_url');
}

/**
 * filter array of pull objects, removing those that do not match one of the snippets
 * @param body
 * @param snippets
 * @returns {Array}
 */
function filterUninterestingLinks(body, snippets) {
  return body.filter(resp =>
    snippets.some(
      snippet =>
        -1 < resp.title.indexOf(snippet) ||
        -1 < resp.body.indexOf(snippet) ||
        isEqual(get(resp, 'assignee.login'), trim(snippet, ' @')) ||
        isEqual(get(resp, 'user.login'), trim(snippet, ' @'))
    )
  );
}
