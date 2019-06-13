import { Datastore } from '@google-cloud/datastore';
import { ChatPostEphemeralArguments } from '@slack/web-api';
import * as crypto from 'crypto';
import * as moment from 'moment';
import * as nock from 'nock';
import * as randomstring from 'randomstring';
import { slack } from '..';
import { configureExistingTeamPayload, configureNewTeamPayload } from '../src/functions/slack/configure';
import { User } from '../src/models';
import { isSlackVerified } from '../src/verifySignature';

describe('slack function', () => {
  let githubToken: string;
  let slackAccessToken: string;
  let slackSigningSecret: string;
  let verificationToken: string;
  let team: { id: string; domain: string };
  let channel: { id: string; name: string };
  let user: { id: string; name: string };
  let responseUrl: string;
  let triggerId: string;
  let req;
  let res;
  let slackScope: nock.Scope;

  function generateSlackSignature(): string {
    const version = 'v0';
    const timestamp = req.headers['x-slack-request-timestamp'];
    const hmac = crypto.createHmac('sha256', slackSigningSecret);
    const hash = hmac.update(`${version}:${timestamp}:${req.rawBody}`).digest('hex');
    return (req.headers['x-slack-signature'] = `${version}=${hash}`);
  }

  function expectPostEphemeral(body: ChatPostEphemeralArguments) {
    slackScope.options('/api/chat.postEphemeral').reply(200);
    slackScope
      .post(
        '/api/chat.postEphemeral',
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

  beforeEach(() => jest.clearAllMocks());

  // initialize random variables
  beforeEach(() => {
    // environments
    githubToken = process.env.GITHUB_TOKEN = 'github-token-123';
    slackAccessToken = process.env.SLACK_ACCESS_TOKEN = 'slack-token-123';
    slackSigningSecret = process.env.SLACK_SIGNING_SECRET = crypto.randomBytes(32).toString();
    // slack payload datas
    verificationToken = randomstring.generate(24);
    team = {
      id: `T${randomstring.generate({ length: 8, capitalization: 'uppercase' })}`,
      domain: randomstring.generate()
    };
    channel = {
      id: `C${randomstring.generate({ length: 8, capitalization: 'uppercase' })}`,
      name: randomstring.generate()
    };
    user = {
      id: `U${randomstring.generate({ length: 8, capitalization: 'uppercase' })}`,
      name: randomstring.generate()
    };
    responseUrl = `https://hooks.slack.com/commands/${team.id}/${randomstring.generate({
      length: 12,
      charset: 'numeric'
    })}/${randomstring.generate({ length: 24 })}`;
    triggerId = [
      randomstring.generate({ length: 12, charset: 'numeric' }),
      randomstring.generate({ length: 12, charset: 'numeric' }),
      randomstring.generate({ length: 30, charset: 'hex' })
    ].join('.');
  });

  // build request / response
  beforeEach(() => {
    req = {
      body: {
        token: verificationToken,
        team_id: team.id,
        team_domain: team.domain,
        channel_id: channel.id,
        channel_name: channel.name,
        user_id: user.id,
        user_name: user.name,
        command: '/github',
        text: '',
        response_url: responseUrl,
        trigger_id: triggerId
      },
      rawBody: 'this is not an actual representation of the raw message body...',
      headers: {
        'x-slack-signature': '',
        'x-slack-request-timestamp': moment()
          .unix()
          .toString()
      }
    };
    res = {
      sendStatus: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };
    generateSlackSignature();
    slackScope = nock('https://slack.com').log(console.log);
  });

  afterEach(() => {
    slackScope.isDone();
  });

  describe('verification', () => {
    it('should allow a valid signature', () => {
      // the default "beforeEach" should set up everything properly
      expect(isSlackVerified(req)).toEqual(true);
    });

    it('should reject request missing headers', async () => {
      delete req.headers['x-slack-signature'];
      delete req.headers['x-slack-request-timestamp'];
      await slack(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith('Error: Unable to verify slack secret');
      expect(res.end).toHaveBeenCalled();
    });

    it('should reject expired request', async () => {
      req.headers['x-slack-request-timestamp'] = moment()
        .subtract(6, 'minutes')
        .unix()
        .toString();
      await slack(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith('Error: Unable to verify slack secret');
      expect(res.end).toHaveBeenCalled();
    });

    it('should reject and invalid signature', async () => {
      req.headers['x-slack-signature'] = 'foo';
      await slack(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith('Error: Unable to verify slack secret');
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('environment validation', () => {
    it('should error without GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN;
      await slack(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error: Specify GITHUB_TOKEN in environment');
      expect(res.end).toHaveBeenCalled();
    });

    it('should error without SLACK_ACCESS_TOKEN', async () => {
      delete process.env.SLACK_ACCESS_TOKEN;
      await slack(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error: Specify SLACK_ACCESS_TOKEN in environment');
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('unrecognized input', () => {
    it('should handle unrecognized input by trying to configure the user', async () => {
      expectPostEphemeral({
        ...configureNewTeamPayload(user.id),
        channel: channel.id,
        user: user.id
      });
      await slack(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(202);
      slackScope.isDone();
    });
  });

  describe('configure team', () => {
    it('should handle not configured team', async () => {
      req.body.text = 'configure my-team';
      expectPostEphemeral({
        ...configureNewTeamPayload('my-team'),
        channel: channel.id,
        user: user.id
      });
      await slack(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(202);
      slackScope.isDone();
    });

    it('should handle configured team', async () => {
      const testUser: User = {
        id: 'foo',
        name: 'my-team'
      };
      (new Datastore().get as jest.Mock).mockReturnValue(Promise.resolve([testUser]));
      req.body.text = 'configure my-team';
      expectPostEphemeral({
        ...configureExistingTeamPayload(testUser, false),
        channel: channel.id,
        user: user.id
      });
      await slack(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(202);
      slackScope.isDone();
    });
  });
});
