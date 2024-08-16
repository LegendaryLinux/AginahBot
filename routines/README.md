This directory should contain .js files which define functions to be run once per hour. They receive the Discord
client as their sole argument.

### example.js
```js
module.exports = (client) => {
  console.log('I will be printed once per hour.');
};
```