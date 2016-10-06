'use strict';

if (!process.env.SLACK_BOT_TOKEN) {
  console.error('Error: Specify SLACK_BOT_TOKEN in environment');
  process.exit(1);
}


const _ = require('lodash');
const githubhook = require('githubhook');

module.exports.messenger = controller => {

  const bot = controller.spawn({
    token: process.env.SLACK_BOT_TOKEN
  }).startRTM();


  // github hooks
  const github = githubhook({
    port: process.env.GITHUB_WEBHOOK_PORT
  });

  github.listen();

  github.on('*', (event, repo, ref, data) => {
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
  });


  function notifyIssue (data) {
    let is_comment = _.has(data, 'comment'),
        is_pull_request = _.has(data, 'pull_request') || _.has(data, 'issue.pull_request'),
      // combine for convenience, allowing comment data to win if it exists
        payload = _.assign({}, data.issue, data.pull_request, data.comment),
        issue_number = payload.number,
        issue_title = payload.title,
        link = payload.html_url,
        repo = data.repository.full_name,
        msg_text,
        msg_attachment_title,
        msg_attachment_description = payload.body,
        pull_request_from = _.get(data, 'pull_request.head.label'),
        pull_request_to = _.get(data, 'pull_request.base.label'),
        pull_request_mergeable_state = _.get(data, 'pull_request.mergeable_state');

    if (is_comment) {
      msg_text = 'You were mentioned in a comment on *' + repo + '*';
    } else if (is_pull_request) {
      msg_text = 'You were mentioned in a pull request for *' + repo + '*';
    } else {
      msg_text = 'You were mentioned in an issue for *' + repo + '*';
    }

    if (pull_request_from && pull_request_to) {
      msg_text += '\n   _' + pull_request_to + ' :arrow_left: ' + pull_request_from + '_';
    }

    if (_.has(data, 'comment.commit_id')) {
      // this is a commit comment
      msg_attachment_title = data.comment.commit_id;
    } else {
      // this is associated with an issue or pull request
      msg_attachment_title = '#' + issue_number + ': ' + issue_title;
    }

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

      _.forEach(all_user_data, user => {
        let snippets = user.snippets || [];
        if (user.github_user) {
          if (user.github_user === data.sender.login) {
            // do not notify of self-initiated actions
            return;
          }
          snippets.push('@' + user.github_user);
        }
        if (_.isEmpty(snippets)) {
          return;
        }

        let mentioned = _.some(snippets, snippet => {
          return _.includes(msg_attachment_description, snippet) &&
            // message only if snippet was added in change
            !(data.action === 'edited' && _.includes(data.changes.body.from, snippet));
        });
        if (mentioned) {
          const message = {
            text: msg_text,
            attachments: [{
              color: color,
              title: msg_attachment_title,
              title_link: link,
              text: msg_attachment_description,
              mrkdwn_in: ['text']
            }]
          };
          if (user.slack_channel) {
            // message to channel
            message.channel = user.slack_channel;
            bot.say(message);
          } else {
            // direct message to user
            bot.startPrivateConversation({
              user: user.id
            }, (err, convo) => {
              if (err) {
                console.error('failed to start private conversation', err);
              } else {
                convo.say(message);
              }
            });
          }
        }
      });
    });
  }
};
