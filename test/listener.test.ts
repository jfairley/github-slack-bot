import { Datastore } from '@google-cloud/datastore';
import * as webhookDefinitions from '@octokit/webhooks-definitions';
import { ChatPostMessageArguments } from '@slack/web-api';
import * as crypto from 'crypto';
import { cloneDeep, find } from 'lodash';
import * as nock from 'nock';
import * as randomstring from 'randomstring';
import { githubWebhook } from '..';

describe('github webhooks', () => {
  let req;
  let res;
  let datastore: Datastore;
  let githubScope: nock.Scope;
  let slackScope: nock.Scope;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };
    datastore = new Datastore();
    githubScope = nock(/api\.github\.com/).log(console.log);
    slackScope = nock('https://slack.com').log(console.log);
  });

  afterEach(() => {
    githubScope.isDone();
    slackScope.isDone();
  });

  function getWebhooksHandler(event: string, payload: object) {
    // generate signature
    const algorithm = 'sha1';
    const hmac = crypto.createHmac(algorithm, process.env.GITHUB_WEBHOOK_SECRET);
    const hash = hmac.update(JSON.stringify(payload)).digest('hex');
    const signature = `${algorithm}=${hash}`;

    req = {
      body: payload,
      headers: {
        'x-hub-signature': signature,
        'x-github-event': event
      }
    };
    return githubWebhook(req, res);
  }

  function expectPostMessage(body: ChatPostMessageArguments) {
    slackScope.options('/api/chat.postMessage').reply(200);
    slackScope
      .post(
        '/api/chat.postMessage',
        Object.entries(body)
          .map(
            ([key, value]) => `${key}=${encodeURIComponent(typeof value === 'string' ? value : JSON.stringify(value))}`
          )
          .join('&')
      )
      .reply(200, {
        ok: true,
        message_ts: [
          randomstring.generate({ length: 10, charset: 'numeric' }),
          randomstring.generate({ length: 6, charset: 'numeric' })
        ].join('.')
      });
  }

  describe('issues', () => {
    const issues = find(webhookDefinitions, ['name', 'issues']);
    const editedIssueExample: any = issues.examples[0];

    beforeEach(() => {
      // sanity check
      expect(issues.name).toEqual('issues');
      expect(editedIssueExample.action).toEqual('edited');
    });

    it('should ignore bot users', async () => {
      const copiedExample = cloneDeep(editedIssueExample);
      copiedExample.sender.type = 'Bot';
      await getWebhooksHandler(issues.name, copiedExample);
      expect(datastore.get).not.toHaveBeenCalled();
    });

    it('should handle edited issues', async () => {
      (<jest.Mock>datastore.get).mockReturnValue(
        Promise.resolve([
          {
            github_user: 'not-codertocat',
            snippets: ['accidently'],
            slack_channel: 'some-channel'
          },
          {
            github_user: 'also-not-codertocat',
            snippets: ['spelled '],
            slack_channel: 'some-other-channel'
          },
          {
            github_user: 'Codertocat',
            snippets: ['accidently'],
            slack_channel: 'my-channel'
          }
        ])
      );
      expectPostMessage({
        token: process.env.SLACK_ACCESS_TOKEN,
        text: 'You were mentioned in an issue for *Codertocat/Hello-World* by *Codertocat*',
        attachments: [
          {
            title: '#2: Spelling error in the README file',
            title_link: 'https://github.com/Codertocat/Hello-World/issues/2',
            text: "It looks like you accidently spelled 'commit' with two 't's.",
            color: undefined,
            mrkdwn_in: ['text']
          }
        ],
        channel: 'some-channel'
      });
      expectPostMessage({
        token: process.env.SLACK_ACCESS_TOKEN,
        text: 'You were mentioned in an issue for *Codertocat/Hello-World* by *Codertocat*',
        attachments: [
          {
            title: '#2: Spelling error in the README file',
            title_link: 'https://github.com/Codertocat/Hello-World/issues/2',
            text: "It looks like you accidently spelled 'commit' with two 't's.",
            color: undefined,
            mrkdwn_in: ['text']
          }
        ],
        channel: 'some-other-channel'
      });
      await getWebhooksHandler(issues.name, editedIssueExample);
      expect(datastore.get).toHaveBeenCalledTimes(1);
      slackScope.isDone();
    });
  });

  describe('issue comment', () => {
    const issueComments = find(webhookDefinitions, ['name', 'issue_comment']);
    const newIssueCommentExample: any = issueComments.examples[0];

    beforeEach(() => {
      // sanity check
      expect(issueComments.name).toEqual('issue_comment');
      expect(newIssueCommentExample.action).toEqual('created');
    });

    it('should ignore bot users', async () => {
      const copiedExample = cloneDeep(newIssueCommentExample);
      copiedExample.sender.type = 'Bot';
      await getWebhooksHandler(issueComments.name, copiedExample);
      expect(datastore.get).not.toHaveBeenCalled();
    });

    it('should handle new issue comments', async () => {
      (<jest.Mock>datastore.get).mockReturnValue(
        Promise.resolve([
          {
            github_user: 'not-codertocat',
            snippets: ['You are totally right'],
            slack_channel: 'some-channel'
          },
          {
            github_user: 'also-not-codertocat',
            snippets: ['totally'],
            slack_channel: 'some-other-channel'
          },
          {
            github_user: 'Codertocat',
            snippets: ['totally'],
            slack_channel: 'my-channel'
          }
        ])
      );
      expectPostMessage({
        token: process.env.SLACK_ACCESS_TOKEN,
        text: 'You were mentioned in a comment on *Codertocat/Hello-World* by *Codertocat*',
        attachments: [
          {
            title: '#2: Spelling error in the README file',
            title_link: 'https://github.com/Codertocat/Hello-World/issues/2#issuecomment-393304133',
            text: "You are totally right! I'll get this fixed right away.",
            color: undefined,
            mrkdwn_in: ['text']
          }
        ],
        channel: 'some-channel'
      });
      expectPostMessage({
        token: process.env.SLACK_ACCESS_TOKEN,
        text: 'You were mentioned in a comment on *Codertocat/Hello-World* by *Codertocat*',
        attachments: [
          {
            title: '#2: Spelling error in the README file',
            title_link: 'https://github.com/Codertocat/Hello-World/issues/2#issuecomment-393304133',
            text: "You are totally right! I'll get this fixed right away.",
            color: undefined,
            mrkdwn_in: ['text']
          }
        ],
        channel: 'some-other-channel'
      });
      await getWebhooksHandler(issueComments.name, newIssueCommentExample);
      expect(datastore.get).toHaveBeenCalledTimes(1);
      slackScope.isDone();
    });
  });

  describe('status', () => {
    const status = find(webhookDefinitions, ['name', 'status']);
    const successExample: any = status.examples[0];

    beforeEach(() => {
      // sanity check
      expect(status.name).toEqual('status');
      expect(successExample.state).toEqual('success');
    });

    it('should ignore pending status', async () => {
      const copiedExample = cloneDeep(successExample);
      copiedExample.state = 'pending';
      await getWebhooksHandler(status.name, copiedExample);
      githubScope.isDone();
    });
  });
});
