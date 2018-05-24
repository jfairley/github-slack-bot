module.exports = {
  verifyConditions: ['@semantic-release/github'],
  publish: ['@semantic-release/github'],
  branch: 'master',
  tagFormat: '${version}'
};
