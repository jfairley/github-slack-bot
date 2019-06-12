module.exports.LoggingWinston = function() {
  this.log = jest.fn();
  this.on = jest.fn();
};
