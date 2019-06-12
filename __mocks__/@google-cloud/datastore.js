const instance = {
  key: jest.fn(),
  get: jest.fn().mockReturnValue(Promise.resolve([]))
};
module.exports.Datastore = jest.fn(() => instance);
