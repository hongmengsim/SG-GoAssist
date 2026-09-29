const React = require("react");
const { Pressable, Text, View } = require("react-native");

let mountCount = 0;
let lastProps = null;

function JourneyMap(props) {
  lastProps = props;
  const testMapEnabled = Boolean(
    globalThis.__GOASSIST_REGIONAL_MAP_TEST__,
  );
  const [instanceId] = React.useState(() => {
    if (testMapEnabled) mountCount += 1;
    return mountCount;
  });

  React.useEffect(() => {
    props.onProviderAvailabilityChange(testMapEnabled);
  }, [props.onProviderAvailabilityChange, testMapEnabled]);

  if (!testMapEnabled) {
    return React.createElement(View, { style: { flex: 1 } }, props.fallback);
  }

  return React.createElement(
    View,
    { testID: "leaflet-map-mock", accessibilityLabel: `Map ${instanceId}` },
    ...props.stops.map((stop) =>
      React.createElement(View, {
        key: stop.busStopCode,
        testID: `rendered-stop-${stop.busStopCode}`,
      }),
    ),
    React.createElement(
      Pressable,
      {
        accessibilityRole: "button",
        accessibilityLabel: "Pan mock map to Clementi",
        onPress: () => {
          props.onMove();
          props.onViewportChange({
            center: { latitude: 1.315, longitude: 103.765 },
            zoom: 15,
            bearing: 0,
            pitch: 0,
          });
        },
      },
      React.createElement(Text, null, "Pan mock map"),
    ),
  );
}

module.exports = {
  JourneyMap,
  getJourneyMapMountCount: () => mountCount,
  getLastJourneyMapProps: () => lastProps,
};
