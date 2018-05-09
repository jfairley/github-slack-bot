FROM node:latest@sha256:492f2a28fbc54cf96eb0eea3faa2486179c71b3154a6b3e6b89b6c36ef7f59eb

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
