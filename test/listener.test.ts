import * as Github from '@octokit/rest';
import * as WebhooksApi from '@octokit/webhooks';
import * as webhookDefinitions from '@octokit/webhooks-definitions';
import { slackbot } from 'botkit';
import { cloneDeep, find } from 'lodash';
import { messenger } from '../src/listener';

jest.mock('http', () => ({
  createServer: jest.fn().mockReturnValue({
    listen: jest.fn()
  })
}));

describe('listener', () => {
  let controller;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = slackbot({});
  });

  describe('webhooks', () => {
    function getWebhooks() {
      return (<jest.Mock>WebhooksApi).mock.results[0].value;
    }

    function getWebhooksHandler() {
      return getWebhooks().on.mock.calls[0][1];
    }

    function getGithub() {
      return (<jest.Mock>(<any>Github)).mock.results[0].value;
    }

    function getBot() {
      return controller.spawn.mock.results[0].value;
    }

    beforeEach(() => messenger(controller));

    it('should configure slack bot', () => {
      expect(controller.spawn).toHaveBeenCalledWith({ token: process.env.SLACK_BOT_TOKEN });
      expect(controller.spawn.mock.results[0].value.startRTM).toHaveBeenCalledTimes(1);
    });

    it('should configure github webhook listener', () => {
      const httpCreateServer = require('http').createServer;
      expect(httpCreateServer).toHaveBeenCalledTimes(1);
      expect(httpCreateServer).toHaveBeenCalledWith(getWebhooks().middleware);
      expect(httpCreateServer.mock.results[0].value.listen).toHaveBeenCalledWith(process.env.GITHUB_WEBHOOK_PORT);
      expect(getWebhooks().on).toHaveBeenCalledWith('*', expect.any(Function));
    });

    it('should configure github rest API', () => {
      expect(Github).toHaveBeenCalledTimes(1);
      expect(getGithub().authenticate).toHaveBeenCalledTimes(1);
      expect(getGithub().authenticate).toHaveBeenCalledWith({
        type: 'token',
        token: process.env.GITHUB_TOKEN
      });
    });

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
        await getWebhooksHandler()({ name: issues.name, payload: copiedExample });
        expect(controller.storage.users.all).not.toHaveBeenCalled();
      });

      it('should handle edited issues', async () => {
        await getWebhooksHandler()({ name: issues.name, payload: editedIssueExample });
        expect(controller.storage.users.all).toHaveBeenCalledTimes(1);
        await controller.storage.users.all.mock.calls[0][0](null, [
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
        ]);
        expect(getBot().say).toHaveBeenCalledTimes(2);
        expect(getBot().say).toHaveBeenNthCalledWith(1, {
          attachments: [
            {
              color: undefined,
              mrkdwn_in: ['text'],
              text: "It looks like you accidently spelled 'commit' with two 't's.",
              title: '#2: Spelling error in the README file',
              title_link: 'https://github.com/Codertocat/Hello-World/issues/2'
            }
          ],
          channel: 'some-channel',
          text: 'You were mentioned in an issue for *Codertocat/Hello-World* by *Codertocat*'
        });
        expect(getBot().say).toHaveBeenNthCalledWith(2, {
          attachments: [
            {
              color: undefined,
              mrkdwn_in: ['text'],
              text: "It looks like you accidently spelled 'commit' with two 't's.",
              title: '#2: Spelling error in the README file',
              title_link: 'https://github.com/Codertocat/Hello-World/issues/2'
            }
          ],
          channel: 'some-other-channel',
          text: 'You were mentioned in an issue for *Codertocat/Hello-World* by *Codertocat*'
        });
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
        await getWebhooksHandler()({ name: issueComments.name, payload: copiedExample });
        expect(controller.storage.users.all).not.toHaveBeenCalled();
      });

      it('should handle new issue comments', async () => {
        await getWebhooksHandler()({ name: issueComments.name, payload: newIssueCommentExample });
        expect(controller.storage.users.all).toHaveBeenCalledTimes(1);
        await controller.storage.users.all.mock.calls[0][0](null, [
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
        ]);
        expect(getBot().say).toHaveBeenCalledTimes(2);
        expect(getBot().say).toHaveBeenNthCalledWith(1, {
          attachments: [
            {
              color: undefined,
              mrkdwn_in: ['text'],
              text: "You are totally right! I'll get this fixed right away.",
              title: '#2: Spelling error in the README file',
              title_link: 'https://github.com/Codertocat/Hello-World/issues/2#issuecomment-393304133'
            }
          ],
          channel: 'some-channel',
          text: 'You were mentioned in a comment on *Codertocat/Hello-World* by *Codertocat*'
        });
        expect(getBot().say).toHaveBeenNthCalledWith(2, {
          attachments: [
            {
              color: undefined,
              mrkdwn_in: ['text'],
              text: "You are totally right! I'll get this fixed right away.",
              title: '#2: Spelling error in the README file',
              title_link: 'https://github.com/Codertocat/Hello-World/issues/2#issuecomment-393304133'
            }
          ],
          channel: 'some-other-channel',
          text: 'You were mentioned in a comment on *Codertocat/Hello-World* by *Codertocat*'
        });
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
        await getWebhooksHandler()({ name: status.name, payload: copiedExample });
        expect(getGithub().search.issues).not.toHaveBeenCalled();
      });
    });
  });
});
