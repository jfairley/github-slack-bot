module.exports = jest.fn().mockImplementation(() => {
  return {
    middleware: jest.fn(),
    on: jest.fn()
  };
});
