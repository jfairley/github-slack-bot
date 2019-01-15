# Slack Bot for Github

[![Total alerts](https://img.shields.io/lgtm/alerts/g/jfairley/github-slack-bot.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/jfairley/github-slack-bot/alerts/)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/jfairley/github-slack-bot.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/jfairley/github-slack-bot/context:javascript)
[![CodeFactor](https://www.codefactor.io/repository/github/jfairley/github-slack-bot/badge)](https://www.codefactor.io/repository/github/jfairley/github-slack-bot)
[![CircleCI](https://circleci.com/gh/jfairley/github-slack-bot.svg?style=svg)](https://circleci.com/gh/jfairley/github-slack-bot)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Gitter chat](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/github-slack-bot/Lobby)

## Runtime Environment

| Variables               | Description                | Required           | More Information                                                        |
|-------------------------|----------------------------|--------------------|-------------------------------------------------------------------------|
| `GITHUB_TOKEN`          | github webhook token       | :white_check_mark: | https://developer.github.com/webhooks/                                  |
| `GITHUB_WEBHOOK_PORT`   | github webhook port        | :white_check_mark: | https://developer.github.com/webhooks/                                  |
| `GITHUB_WEBHOOK_SECRET` | github webhook secret      | :white_check_mark: | https://developer.github.com/webhooks/                                  |
| `SLACK_BOT_TOKEN`       | bot token from slack.com   |                    | https://api.slack.com/bot-users / https://my.slack.com/services/new/bot |
| `SLACK_BOT_PORT`        | botkit persistence path    |                    | https://github.com/howdyai/botkit#storing-information                   |
| `SLACK_BOT_DEBUG`       | enable botkit debug output |                    | `true` / `false`                                                        |
| `SLACK_BOT_STORAGE`     | botkit persistence path    |                    | https://github.com/howdyai/botkit#storing-information                   |


## Develop

install dependencies

```bash
npm install
```

lint and format

```bash
npm run lint
```

run locally

```bash
npm start
```


## Dockerfile

### with docker-compose

```bash
docker-compose build
docker-compose up
```

### with shell commands

```bash
docker build -t github-slack-bot .
docker run -d \
           -p 3000:3000 \
           -p 3420:3420 \
           --env GITHUB_TOKEN=$GITHUB_TOKEN \
           --env SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN \
           --env SLACK_BOT_DEBUG=$SLACK_BOT_DEBUG \
           --env SLACK_BOT_STORAGE=/storage \
           -v $SLACK_BOT_STORAGE:/storage \
           --name github-slack-bot \
           github-slack-bot
docker logs -f github-slack-bot
```


## Tunneling

If you're running locally, use one of these utilities to expose a port on your local machine.

[ngrok](ngrok.com)

```bash
ngrok 3420
```

[localtunnel](https://localtunnel.github.io/www/)

```bash
lt --port 3420
```
