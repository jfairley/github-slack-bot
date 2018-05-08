FROM node:latest@sha256:5082d4db78ee2d24f72b25eb75537f2e19c49f04a595378d1ae8814d6f2fbf28

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
