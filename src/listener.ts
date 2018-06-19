import * as Github from '@octokit/rest';
import * as WebhooksApi from '@octokit/webhooks';
import * as Promise from 'bluebird';
import { SlackMessage } from 'botkit';
import * as http from 'http';
import { assign, every, forEach, get, has, includes, isEmpty, map, some } from 'lodash';
import * as moment from 'moment';
import { Commit, Issue, MergeableState, Status, StatusState, StatusWebhook } from './models/github';
import { SlackAttachmentColor } from './models/slack';

if (!process.env.GITHUB_TOKEN) {
  console.error('Error: Specify GITHUB_TOKEN in environment');
  process.exit(1);
}

if (!process.env.GITHUB_WEBHOOK_SECRET) {
  console.error('Error: Specify GITHUB_WEBHOOK_SECRET in environment');
  process.exit(1);
}

if (!process.env.SLACK_BOT_TOKEN) {
  console.error('Error: Specify SLACK_BOT_TOKEN in environment');
  process.exit(1);
}

export const messenger = controller => {
  // start the bot
  const bot = controller
    .spawn({
      token: process.env.SLACK_BOT_TOKEN
    })
    .startRTM();

  // github hooks
  const webhooksApi = new WebhooksApi({
    secret: process.env.GITHUB_WEBHOOK_SECRET
  });

  // github api
  const github = new Github();
  github.authenticate({
    type: 'token',
    token: process.env.GITHUB_TOKEN
  });

  http.createServer(webhooksApi.middleware).listen(process.env.GITHUB_WEBHOOK_PORT);

  webhooksApi.on('*', ({ id, name, payload }) => {
    try {
      switch (name) {
        case 'issues':
        case 'pull_request':
          switch (payload.action) {
            case 'opened':
            case 'reopened':
            case 'edited':
              notifyIssue(payload);
              break;
          }
          break;
        case 'commit_comment':
        case 'issue_comment':
        case 'pull_request_review_comment':
          switch (payload.action) {
            case 'created':
            case 'edited':
              notifyIssue(payload);
              break;
          }
          break;
        case 'status':
          checkStatus(payload);
          break;
      }
    } catch (err) {
      console.error(err);
    }
  });

  function notifyIssue(data) {
    // ignore automation users
    const sender = data.sender;
    if (sender && sender.type !== 'User') {
      console.log('Ignoring activity from non-user:', sender.login);
      return;
    }

    const is_comment = has(data, 'comment');
    const is_pull_request = has(data, 'pull_request') || has(data, 'issue.pull_request');
    // combine for convenience, allowing comment data to win if it exists
    const payload = assign({}, data.issue, data.pull_request, data.comment);
    const issue_number = payload.number;
    const issue_title = payload.title;
    const link = payload.html_url;
    const repo = data.repository.full_name;
    const msg_attachment_description = payload.body;
    const pull_request_from = get(data, 'pull_request.head.label');
    const pull_request_to = get(data, 'pull_request.base.label');

    // build the message attachment title
    const msg_attachment_title = has(data, 'comment.commit_id')
      ? // this is a commit comment
        data.comment.commit_id
      : // this is associated with an issue or pull request
        '#' + issue_number + ': ' + issue_title;

    // determine message attachment color
    const color = determineAttachmentColor(data);

    controller.storage.users.all((err, all_user_data) => {
      if (err) {
        console.error(err);
        return;
      }

      forEach(all_user_data, user => {
        let user_is_author = false;
        const snippets = user.snippets || [];
        if (!isEmpty(user.github_user)) {
          if (user.github_user === sender.login) {
            // do not notify of self-initiated actions
            return;
          }

          // detect whether the current user is the issue author
          if (user.github_user === get(data, 'issue.user.login')) {
            user_is_author = true;
          }

          // register a direct mention of this user as a snippet
          snippets.push('@' + user.github_user);
        }

        // send all messages when the user is the issue author. otherwise check for snippet matches
        const send_message =
          user_is_author ||
          some(snippets, snippet => {
            return (
              includes(msg_attachment_description, snippet) &&
              // message only if snippet was added in change
              !(data.action === 'edited' && includes(get(data, 'changes.body.from'), snippet))
            );
          });

        // if nothing matches, do not send the message
        if (!send_message) {
          return;
        }

        // build the message body
        let msg_text;
        if (user_is_author) {
          if (is_comment) {
            msg_text = `There is a new comment on *${repo}* from *${sender.login}*`;
          } else if (is_pull_request) {
            msg_text = `There is activity in a pull request for *${repo}* from *${sender.login}*`;
          } else {
            msg_text = `There is activity in an issue for *${repo}* from *${sender.login}*`;
          }
        } else {
          if (is_comment) {
            msg_text = `You were mentioned in a comment on *${repo}* by *${sender.login}*`;
          } else if (is_pull_request) {
            msg_text = `You were mentioned in a pull request for *${repo}* by *${sender.login}*`;
          } else {
            msg_text = `You were mentioned in an issue for *${repo}* by *${sender.login}*`;
          }
        }

        // for pull requests, add to/from information
        if (pull_request_from && pull_request_to) {
          msg_text += `\n   _${pull_request_to} :arrow_left: ${pull_request_from}_`;
        }

        // create the message
        const message: SlackMessage = {
          text: msg_text,
          attachments: [
            {
              color,
              title: msg_attachment_title,
              title_link: link,
              text: msg_attachment_description,
              mrkdwn_in: ['text']
            }
          ]
        };

        // send the message
        if (user.slack_channel) {
          // message to channel
          message.channel = user.slack_channel;
          bot.say(message);
        } else {
          // direct message to user
          bot.startPrivateConversation(
            {
              user: user.id
            },
            (err, convo) => {
              if (err) {
                console.error('failed to start private conversation', err);
              } else {
                convo.say(message);
              }
            }
          );
        }
      });
    });
  }

  function checkStatus(payload: StatusWebhook) {
    if (payload.state === StatusState.PENDING) {
      // ignore non-final statuses
      return;
    }

    const author = payload.commit.author.login;
    const committer = payload.commit.committer.login;

    // search for issues
    Promise.resolve(github.search.issues({ q: payload.sha }))
      .then(res => res.data.items)
      // verify that the commit is the latest, ignoring those for which it isn't
      .filter((issue: Issue) =>
        github.pullRequests
          .getCommits({
            number: issue.number,
            owner: payload.repository.owner.login,
            repo: payload.repository.name
          })
          .then(res => res.data as Commit[])
          .then(commits => commits[commits.length - 1].sha === payload.sha)
      )
      // lookup statuses and message for each PR
      .then((issues: Issue[]) =>
        github.repos
          .getStatuses({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            ref: payload.sha
          })
          // reduce statuses, removing outdated ones
          .then(res =>
            (res.data as Status[]).reduce(
              (statusesByContext, status) => {
                if (
                  !(status.context in statusesByContext) ||
                  moment(status.updated_at).isAfter(statusesByContext[status.context].updated_at)
                ) {
                  statusesByContext[status.context] = status;
                }
                return statusesByContext;
              },
              {} as { [key: string]: Status }
            )
          )
          // filter out incomplete statuses
          .then(
            statusesByContext =>
              some(statusesByContext, status => status.state === StatusState.PENDING)
                ? Promise.reject('skipping message for pending statuses')
                : Promise.resolve(statusesByContext)
          )
          // notify statuses for each issue
          .then(statusesByContext =>
            controller.storage.users.all((err, all_user_data) => {
              if (err) {
                console.error(err);
                return;
              }

              forEach(all_user_data, user => {
                if (includes([author, committer], user.github_user)) {
                  issues.map(issue => {
                    // direct message to user
                    bot.startPrivateConversation(
                      {
                        user: user.id
                      },
                      (err, convo) => {
                        if (err) {
                          console.error('failed to start private conversation', err);
                        } else {
                          convo.say({
                            text: `Your commit statuses have resolved!`,
                            attachments: [
                              {
                                color: every(statusesByContext, status => status.state === StatusState.SUCCESS)
                                  ? SlackAttachmentColor.GOOD
                                  : SlackAttachmentColor.DANGER,
                                title: `#${issue.number}: ${issue.title}`,
                                title_link: issue.html_url,
                                text: map(
                                  statusesByContext,
                                  status =>
                                    `${status.state === StatusState.SUCCESS ? ':white_check_mark:' : ':x:'} *${
                                      status.context
                                    }*: ${status.description}`
                                ).join('\n'),
                                mrkdwn_in: ['text']
                              }
                            ]
                          });
                        }
                      }
                    );
                  });
                }
              });
            })
          )
      )
      .catch(err => console.log(`Rejection from status webhook: ${err}`));
  }
};

function determineAttachmentColor(payload): SlackAttachmentColor {
  const pull_request_mergeable_state = get(payload, 'pull_request.mergeable_state');
  switch (pull_request_mergeable_state) {
    case MergeableState.CLEAN:
      return SlackAttachmentColor.GOOD;
    case MergeableState.UNKNOWN:
      return SlackAttachmentColor.WARNING;
    case MergeableState.UNSTABLE:
    case MergeableState.DIRTY:
      return SlackAttachmentColor.DANGER;
  }
}
