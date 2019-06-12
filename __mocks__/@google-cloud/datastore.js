module.exports.Datastore = function() {
  this.key = jest.fn();
  this.get = jest.fn().mockReturnValue(Promise.resolve([]));
};
