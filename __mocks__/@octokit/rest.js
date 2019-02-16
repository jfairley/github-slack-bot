module.exports = jest.fn().mockImplementation(() => {
  return {
    search: {
      issues: jest.fn()
    }
  };
});
