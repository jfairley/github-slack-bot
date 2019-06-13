import * as crypto from 'crypto';

process.env = {
  ...process.env,
  GITHUB_TOKEN: 'test-github-token',
  GITHUB_WEBHOOK_SECRET: 'test-github-webhook-secret',
  SLACK_ACCESS_TOKEN: 'test-slack-token',
  SLACK_SIGNING_SECRET: crypto.randomBytes(32).toString()
};
