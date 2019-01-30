process.env = {
  ...process.env,
  GITHUB_TOKEN: 'test-github-token',
  GITHUB_WEBHOOK_PORT: '12345',
  GITHUB_WEBHOOK_SECRET: 'test-github-webhook-secret',
  SLACK_BOT_TOKEN: 'test-slack-bot-token'
};
