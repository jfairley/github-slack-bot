'use strict';

import { SlackMessage } from 'botkit';
import { assign, forEach, get, has, includes, isEmpty, some } from 'lodash';

if (!process.env.SLACK_BOT_TOKEN) {
  console.error('Error: Specify SLACK_BOT_TOKEN in environment');
  process.exit(1);
}

const githubhook = require('githubhook');

export const messenger = controller => {
  const bot = controller
    .spawn({
      token: process.env.SLACK_BOT_TOKEN
    })
    .startRTM();

  // github hooks
  const github = githubhook({
    port: process.env.GITHUB_WEBHOOK_PORT
  });

  github.listen();

  github.on('*', (event, repo, ref, data) => {
    try {
      switch (event) {
        case 'issues':
        case 'pull_request':
          switch (data.action) {
            case 'opened':
            case 'reopened':
            case 'edited':
              notifyIssue(data);
              break;
          }
          break;
        case 'commit_comment':
        case 'issue_comment':
        case 'pull_request_review_comment':
          switch (data.action) {
            case 'created':
            case 'edited':
              notifyIssue(data);
              break;
          }
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

    const is_comment = has(data, 'comment'),
      is_pull_request = has(data, 'pull_request') || has(data, 'issue.pull_request'),
      // combine for convenience, allowing comment data to win if it exists
      payload = assign({}, data.issue, data.pull_request, data.comment),
      issue_number = payload.number,
      issue_title = payload.title,
      link = payload.html_url,
      repo = data.repository.full_name,
      msg_attachment_description = payload.body,
      pull_request_from = get(data, 'pull_request.head.label'),
      pull_request_to = get(data, 'pull_request.base.label'),
      pull_request_mergeable_state = get(data, 'pull_request.mergeable_state');

    // build the message attachment title
    let msg_attachment_title;
    if (has(data, 'comment.commit_id')) {
      // this is a commit comment
      msg_attachment_title = data.comment.commit_id;
    } else {
      // this is associated with an issue or pull request
      msg_attachment_title = '#' + issue_number + ': ' + issue_title;
    }

    // determine message attachment color
    let color;
    switch (pull_request_mergeable_state) {
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

    controller.storage.users.all((err, all_user_data) => {
      if (err) {
        console.error(err);
        return;
      }

      forEach(all_user_data, user => {
        let user_is_author = false;
        let snippets = user.snippets || [];
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
        let send_message =
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
              color: color,
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
};
