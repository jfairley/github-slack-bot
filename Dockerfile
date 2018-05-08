FROM node:latest@sha256:4013aa6c297808defd01234fce4a42e1ca0518a5bd0260752a86a46542b38206

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
