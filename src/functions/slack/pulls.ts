import { IssuesListForOrgResponse, IssuesListForOrgResponseItem } from '@octokit/rest';
import { Dictionary } from 'async';
import {
  compact,
  flatten as lodash_flatten,
  get,
  groupBy,
  has,
  isEmpty,
  isEqual,
  sortBy,
  trim,
  uniq,
  values
} from 'lodash';
import { github, IncomingSlackMessageBody, postEphemeral, postMessage } from '../../api';
import { findUser, findUsers, User } from '../../models';
import { configureUser } from './configure';

export const actions: Array<{
  command?: string;
  commands?: string[];
  message?: string;
  pattern: RegExp;
  callback: (message?: IncomingSlackMessageBody, arg?: string) => void;
}> = [
  {
    commands: ['list', '_no input_'],
    message: 'show matching issues and pull-requests for the current user',
    pattern: /^(list|pulls)?$/i,
    callback: listPRsForUser
  },
  {
    commands: ['list <team>', '<team>'],
    message: 'show matching issues and pull-requests for the specified team',
    pattern: /^(list|pulls)\s+(.+)$/i,
    callback: listPRs
  },
  {
    command: 'details',
    message: 'show the configuration for the current user',
    pattern: /^details$/i,
    callback: teamDetailsForUser
  },
  {
    command: 'details <team>',
    message: 'show the configuration for the specified team',
    pattern: /^details\s+(.+)$/i,
    callback: teamDetails
  },
  {
    command: 'teams',
    message: 'show all configured users and teams',
    pattern: /^teams$/i,
    callback: listTeams
  }
];

/**
 * search for PRs for the current user
 */
export async function listPRsForUser(message) {
  const userId = message.user;
  const user = await findUser(userId);
  if (!user) {
    return configureUser(message);
  } else {
    return listPRs(message, userId);
  }
}

/**
 * search for PRs
 */
export async function listPRs(message: IncomingSlackMessageBody, team: string) {
  const data = await findUser(team);
  if (!data) {
    return teamDoesNotExist(message, team);
  }
  const snippets = getSnippets(data, true);
  const issues = await fetchOrgIssues();
  const msgs = await Promise.all(
    values(groupByRepositoryUrl(issues))
      .map(issuesForSameRepo => filterUninterestingLinks(issuesForSameRepo, snippets))
      .filter(issuesForSameRepo => !isEmpty(issuesForSameRepo))
      .map(issuesForSameRepo =>
        Promise.all(
          issuesForSameRepo.map(issue => {
            if (issue.pull_request) {
              return github.pulls
                .get({
                  number: issue.number,
                  owner: issue.repository.owner.login,
                  repo: issue.repository.name
                })
                .then(res => {
                  issue.pull_request = res.data;
                  return issue;
                });
            } else {
              return issue;
            }
          })
        )
      )
      .map(async issuesPromise => {
        const group = await issuesPromise;
        return postMessage(message, {
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
        });
      })
  );
  if (isEmpty(msgs)) {
    return postEphemeral(message, `No matching issues!! You're in the clear.`);
  }
}

/**
 * show configured teams
 */
export async function listTeams(message: IncomingSlackMessageBody) {
  const users = await findUsers();
  return postMessage(
    message,
    `Configured teams:\n${users
      .map(team => (/^U\w{8}$/.test(team.name) ? ` - ${team.name} (<@${team.name}>)` : ` - ${team.name}`))
      .join('\n')}`
  );
}

/**
 * show details for the current user
 */
export async function teamDetailsForUser(message) {
  const userId = message.user;
  const user = await findUser(userId);
  if (!user) {
    return configureUser(message);
  } else {
    return teamDetails(message, userId);
  }
}

/**
 * show details for a list of snippets
 */
export async function teamDetails(message, team) {
  const data = await findUser(team);
  if (!data) {
    return teamDoesNotExist(message, team);
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
    return postMessage(message, messages.join('\n'));
  }
}

export function teamDoesNotExist(message: IncomingSlackMessageBody, team: string) {
  // TODO: add button?
  return postEphemeral(message, `Error: Team does not exist. Try \`configure ${team}\`.`);
}

/**
 * Fetch organization issues
 */
export async function fetchOrgIssues(): Promise<IssuesListForOrgResponse> {
  const res = await github.issues.listForOrg({
    org: process.env.GITHUB_ORG,
    filter: 'all',
    state: 'open'
  });
  return res.data;
}

function flatten(...args: any[]) {
  return compact(uniq(lodash_flatten(args)));
}

function getSnippets(data: User, withUser: boolean) {
  const snippets = data.snippets || [];
  return withUser ? flatten(snippets, data.github_user) : snippets;
}

/**
 * return sorted array of arrays
 * @param pulls
 */
function groupByRepositoryUrl(pulls: IssuesListForOrgResponseItem[]): Dictionary<IssuesListForOrgResponseItem[]> {
  pulls = sortBy(pulls, 'repository_url');
  return groupBy(pulls, 'repository_url');
}

/**
 * filter array of pull objects, removing those that do not match one of the snippets
 * @param body
 * @param snippets
 * @returns {Array}
 */
function filterUninterestingLinks(body: IssuesListForOrgResponseItem[], snippets: string[]) {
  return body.filter(resp =>
    snippets.some(
      snippet =>
        -1 < resp.title.indexOf(snippet) ||
        -1 < resp.body.indexOf(snippet) ||
        isEqual(resp.assignee.login, trim(snippet, ' @')) ||
        isEqual(resp.user.login, trim(snippet, ' @'))
    )
  );
}
