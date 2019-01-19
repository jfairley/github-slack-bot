module.exports = jest.fn().mockImplementation(() => {
  return {
    authenticate: jest.fn(),
    search: {
      issues: jest.fn()
    }
  };
});
