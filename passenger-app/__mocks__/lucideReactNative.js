const React = require("react");
const { View } = require("react-native");

function MockIcon(props) {
  return React.createElement(View, {
    ...props,
    accessible: false,
  });
}

module.exports = new Proxy(
  {
    __esModule: true,
  },
  {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      return MockIcon;
    },
  }
);
