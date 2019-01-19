const bot = {
  say: jest.fn(),
  startPrivateConversation: jest.fn(),
  startRTM: jest.fn().mockReturnThis()
};

const controller = {
  spawn: jest.fn().mockReturnValue(bot),
  storage: {
    users: {
      all: jest.fn()
    }
  }
};

module.exports = {
  slackbot: jest.fn().mockReturnValue(controller)
};
