if (!process.env.SLACK_BOT_TOKEN) {
  console.error('Error: Specify SLACK_BOT_TOKEN in environment');
  process.exit(1);
}


const _ = require('lodash');
const githubhook = require('githubhook');
const BOT_ID = 'D1BPHEUB1';

module.exports = controller => {

  var bot = controller.spawn({
    token: process.env.SLACK_BOT_TOKEN
  }).startRTM();


  controller.hears('username (.*)', 'direct_message,direct_mention,mention', function (bot, message) {

    bot.api.reactions.add({
      timestamp: message.ts,
      channel: message.channel,
      name: 'robot_face'
    }, function (err) {
      if (err) {
        console.error('Failed to add emoji reaction :(', err);
      }
    });

    var username = message.match[1];
    controller.storage.users.save({
      id: message.user,
      github_user: username
    }, function () {
      bot.reply(message, 'Github username registered!!');
    });

  });


// github hooks
  var github = githubhook({
    host: 'localhost',
    port: 3420,
    secret: 'my_secret'
  });

  github.listen();

  github.on('*', function (event, repo, ref, data) {
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
    var is_comment = _.has(data, 'comment'),
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
        pull_request_to = _.get(data, 'pull_request.base.label');

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


    controller.storage.users.all(function (err, all_user_data) {
      if (err) {
        console.error(err);
        return;
      }

      _.forEach(all_user_data, function (user) {
        if (user.github_user) {
          var github_user = '@' + user.github_user;
          var mentioned = _.includes(msg_attachment_description, github_user);
          if (mentioned && data.action === 'edited') {
            // message only if name was added in change
            mentioned = !_.includes(data.changes.body.from, github_user)
          }
          if (mentioned) {
            bot.say({
              text: msg_text,
              channel: BOT_ID,
              user: user.id,
              attachments: [{
                color: '#00aeef',
                title: msg_attachment_title,
                title_link: link,
                text: msg_attachment_description
              }]
            });
          }
        }
      });
    });
  }
};
