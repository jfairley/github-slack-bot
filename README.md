# Slack Bot for Github


## Runtime Environment

| Variables           | Description                | More Information                                                        |
|---------------------|----------------------------|-------------------------------------------------------------------------|
| `GITHUB_TOKEN`      | github webhook token       | https://developer.github.com/webhooks/                                  |
| `SLACK_BOT_TOKEN`   | bot token from slack.com   | https://api.slack.com/bot-users / https://my.slack.com/services/new/bot |
| `SLACK_BOT_DEBUG`   | enable botkit debug output | `true` / `false`                                                        |
| `SLACK_BOT_STORAGE` | botkit persistence path    | https://github.com/howdyai/botkit#storing-information                   |


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

[localtunnel](localtunnel.me)

```bash
lt --port 3420
```
