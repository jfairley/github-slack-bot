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

```bash
docker build -t gh-bot .
docker run -d --name gh-bot gh-bot
docker logs -f gh-bot
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
