import { Request, Response } from 'express';
import { assign, get, has, includes, isEmpty, some } from 'lodash';
import * as moment from 'moment';
import { github, postMessage, SlackMessageArguments } from '../../api';
import { logger } from '../../logger';
import { findUsers } from '../../models';
import {
  Issue,
  IssueState,
  MergeableState,
  PullRequestReviewAction,
  PullRequestReviewWebhook,
  ReviewState,
  StatusState,
  StatusWebhook
} from '../../models/github';
import { SlackAttachmentColor } from '../../models/slack';
import { isGithubVerified } from '../../verifySignature';

const { GITHUB_TOKEN, GITHUB_WEBHOOK_SECRET } = process.env;

const checkEmoji = ':white_check_mark:';
const eyesEmoji = ':eyes:';
const xEmoji = ':x:';
const warningEmoji = ':warning:';

export default async function githubWebhookFn(req: Request, res: Response) {
  const start = moment();

  try {
    // check for github secret
    if (isEmpty(GITHUB_WEBHOOK_SECRET)) {
      const msg = 'Error: Specify GITHUB_WEBHOOK_SECRET in environment';
      logger.error(msg);
      return res
        .status(500)
        .send(msg)
        .end();
    }

    // check for github token
    if (isEmpty(GITHUB_TOKEN)) {
      const msg = 'Error: Specify GITHUB_TOKEN in environment';
      logger.error(msg);
      return res
        .status(500)
        .send(msg)
        .end();
    }

    // verify
    if (!isGithubVerified(req)) {
      const msg = 'Error: Unable to verify github secret';
      logger.error(msg);
      return res
        .status(500)
        .send(msg)
        .end();
    }

    const name = req.headers['x-github-event'];
    const payload = req.body;
    switch (name) {
      case 'issues':
      case 'pull_request':
        switch (payload.action) {
          case 'opened':
          case 'reopened':
          case 'edited':
            logger.debug(`Notify issue for ${name}, ${payload.action}`);
            await notifyIssue(payload);
            break;
        }
        break;
      case 'commit_comment':
      case 'issue_comment':
      case 'pull_request_review_comment':
        switch (payload.action) {
          case 'created':
          case 'edited':
            logger.debug(`Notify issue for ${name}, ${payload.action}`);
            await notifyIssue(payload);
            break;
        }
        break;
      case 'pull_request_review':
        logger.debug(`Notify PR review request for ${name}`);
        await notifyPullRequestReview(payload);
        break;
      case 'status':
        logger.debug(`Notify status for ${name}`);
        await checkStatus(payload);
        break;
    }
  } catch (err) {
    logger.error(err.toString());
  } finally {
    // end
    logger.info(`execution time: ${moment().diff(start, 'milliseconds')} ms`);
  }
}

async function notifyIssue(data) {
  // ignore automation users
  const sender = data.sender;
  if (sender && sender.type !== 'User') {
    logger.info(`Ignoring activity from non-user: ${sender.login}`);
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

  const users = await findUsers();
  await Promise.all(
    users.map(async user => {
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
      const message: SlackMessageArguments = {
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
        await postMessage({ channel_id: user.slack_channel }, message);
      } else {
        // direct message to user
        await postMessage({ channel_id: user.name }, message);
      }
    })
  );
}

async function notifyPullRequestReview(payload: PullRequestReviewWebhook) {
  const users = await findUsers();
  await Promise.all(
    users.map(async user => {
      if (payload.pull_request.user.login !== user.github_user) {
        // send message only to the PR owner
        return;
      }
      if (payload.sender.login === user.github_user) {
        // do not send messages for own actions
        return;
      }

      let attachmentColor;
      let attachmentText;
      switch (payload.action) {
        case PullRequestReviewAction.SUBMITTED:
        case PullRequestReviewAction.EDITED:
          switch (payload.review.state) {
            case ReviewState.APPROVED:
              attachmentColor = SlackAttachmentColor.GOOD;
              attachmentText = `${checkEmoji} *Approved*`;
              break;
            case ReviewState.COMMENTED:
              attachmentColor = undefined;
              attachmentText = `${eyesEmoji} *Commented*`;
              break;
            case ReviewState.CHANGES_REQUESTED:
              attachmentColor = SlackAttachmentColor.DANGER;
              attachmentText = `${xEmoji} *Changes Requested*`;
              break;
          }
          if (payload.review.body) {
            attachmentText += `\n${payload.review.body}`;
          }
          break;
        case PullRequestReviewAction.DISMISSED:
          if (payload.sender.login !== payload.review.user.login) {
            attachmentColor = SlackAttachmentColor.WARNING;
            attachmentText = `\n${warningEmoji} *${payload.sender.login}* dismissed a review from *${
              payload.review.user.login
            }*`;
          } // else show no extra text
          break;
        default:
          logger.error(`unsupported pull request review action ${payload.action}`);
          break;
      }

      // direct message to user
      await postMessage(
        { channel_id: user.name },
        {
          text: `Review ${payload.action} for *${payload.pull_request.base.repo.full_name}* by *${
            payload.sender.login
          }*:`,
          attachments: [
            {
              color: attachmentColor,
              title: `#${payload.pull_request.number}: ${payload.pull_request.title}`,
              title_link: payload.review.html_url,
              text: attachmentText,
              mrkdwn_in: ['text']
            }
          ]
        }
      );
    })
  );
}

async function checkStatus(payload: StatusWebhook) {
  if (payload.state === StatusState.PENDING) {
    // ignore non-final statuses
    return;
  }

  const author = payload.commit.author.login;
  const committer = payload.commit.committer.login;

  // search for users and issues
  const [users, issues] = await Promise.all([
    // find users who are the author or committer for this PR
    findUsers().then(users => users.filter(user => [author, committer].includes(user.github_user))),
    // find PRs relevant to the given commit status
    github.search
      .issuesAndPullRequests({ q: payload.sha })
      .then(res => res.data.items)
      // verify that the issue is not closed
      .then(issues => issues.filter((issue: Issue) => issue.state !== IssueState.CLOSED))
  ]);

  if (isEmpty(users)) {
    // nothing to do
    logger.debug('no users to notify');
    return;
  }

  if (isEmpty(issues)) {
    // nothing to do
    logger.debug('no matching open issues found');
    return;
  }

  // notify statuses for each issue to each relevant user
  await Promise.all(
    issues.map(async issue => {
      // verify that the commit is the latest, ignoring those for which it isn't
      const commits = (await github.pulls.listCommits({
        pull_number: issue.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name
      })).data;
      if (commits[commits.length - 1].sha !== payload.sha) {
        logger.debug('Ignoring commit which is not the latest');
        return;
      }

      // commit verified to be the latest. find users to direct message.
      await Promise.all(
        users.map(user =>
          postMessage(
            { channel_id: user.name },
            {
              text: `Updated commit status on *${payload.name}*:`,
              attachments: [
                {
                  color:
                    payload.state === StatusState.SUCCESS ? SlackAttachmentColor.GOOD : SlackAttachmentColor.DANGER,
                  title: `#${issue.number}: ${issue.title}`,
                  title_link: issue.html_url,
                  text: `${payload.state === StatusState.SUCCESS ? checkEmoji : xEmoji} *${payload.context}*: ${
                    payload.description
                  }`,
                  mrkdwn_in: ['text']
                }
              ]
            }
          )
        )
      );
    })
  );
}

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
