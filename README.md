# Slack Bot for Github

## Develop

lint and format

```bash
npm run lint
```

run locally

```bash
npm install
npm start
```

## Dockerfile

### with docker-compose

```bash
docker-compose up
```

### with commands

```bash
docker build -t github-slack-bot .
docker run -d \
           -p 3420:3420 \
           --env GITHUB_TOKEN=$GITHUB_TOKEN \
           --env SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN \
           --env SLACK_BOT_ID=$SLACK_BOT_ID \
           --name github-slack-bot \
           github-slack-bot
docker logs -f github-slack-bot
```

## Tunneling

[ngrok](ngrok.com)

```bash
ngrok 3420
```

[localtunnel](localtunnel.me)

```bash
lt --port 3420
```
