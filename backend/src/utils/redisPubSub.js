const Redis = require('ioredis');
const { redisConnection } = require('../config/queue');

let publisher = null;
let subscriber = null;

function getPublisher() {
  if (!publisher) {
    publisher = new Redis(redisConnection.options);
  }
  return publisher;
}

function getSubscriber() {
  if (!subscriber) {
    subscriber = new Redis(redisConnection.options);
  }
  return subscriber;
}

module.exports = { getPublisher, getSubscriber }; 