module.exports = {
  verifyConditions: ['@semantic-release/github'],
  prepare: [],
  publish: ['@semantic-release/github'],
  branch: 'master',
  tagFormat: '${version}'
};
