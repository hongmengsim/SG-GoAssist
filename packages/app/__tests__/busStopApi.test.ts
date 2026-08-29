import {
  BusStopRequestError,
  fetchBusStop,
  fetchBusStopArrivals,
  fetchBusStopServiceRoutes,
  fetchRegionalBusStops,
  findNearbyBusStops,
  searchBusStops,
} from "../src/api/assistanceApi";

const stopWithoutServices = {
  busStopCode: "19069",
  roadName: "Dover Rd",
  description: "Opp Ayer Rajah Telecoms",
  latitude: 1.3078,
  longitude: 103.7767,
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(() => Promise.resolve(body)),
  };
}

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
});

it("loads a regional radius and normalizes legacy stops without services", async () => {
  const controller = new AbortController();
  (global.fetch as jest.Mock).mockResolvedValue(
    response({
      stops: [{ ...stopWithoutServices, distanceMeters: 120 }],
      radiusMeters: 3_000,
    }),
  );

  const result = await fetchRegionalBusStops(
    {
      latitude: 1.2942,
      longitude: 103.7711,
      radiusMeters: 3_000,
      limit: 250,
    },
    controller.signal,
  );

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(String(url)).toContain(
    "/api/bus-stops/nearby?lat=1.2942&lng=103.7711&radius=3000&limit=250",
  );
  expect(init).toEqual({ signal: controller.signal });
  expect(result.stops[0].services).toEqual([]);
});

it("reports regional HTTP and network failures with endpoint context", async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce(response({}, 503));
  await expect(
    fetchRegionalBusStops({
      latitude: 1.3,
      longitude: 103.8,
      radiusMeters: 1_000,
    }),
  ).rejects.toMatchObject<Partial<BusStopRequestError>>({
    name: "BusStopRequestError",
    status: 503,
    endpoint: expect.stringContaining("/api/bus-stops/nearby?"),
  });

  (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("offline"));
  await expect(
    fetchRegionalBusStops({
      latitude: 1.3,
      longitude: 103.8,
      radiusMeters: 1_000,
    }),
  ).rejects.toMatchObject<Partial<BusStopRequestError>>({ status: null });
});

it("does not wrap request cancellation as a service failure", async () => {
  const aborted = new Error("cancelled");
  aborted.name = "AbortError";
  (global.fetch as jest.Mock).mockRejectedValue(aborted);

  await expect(
    fetchRegionalBusStops({
      latitude: 1.3,
      longitude: 103.8,
      radiusMeters: 1_000,
    }),
  ).rejects.toBe(aborted);
});

it("encodes search, detail and service-route requests", async () => {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(
      response({ stops: [stopWithoutServices], query: "Dover & 196", total: 1 }),
    )
    .mockResolvedValueOnce(response({ stop: stopWithoutServices }))
    .mockResolvedValueOnce(
      response({
        busStop: stopWithoutServices,
        serviceNo: "196/e",
        routes: [
          {
            serviceNo: "196/e",
            direction: 1,
            destination: { ...stopWithoutServices, busStopCode: "17009" },
            stops: [],
          },
        ],
      }),
    );

  const search = await searchBusStops("Dover & 196");
  const detail = await fetchBusStop("19/069");
  const routes = await fetchBusStopServiceRoutes("19/069", "196/e");

  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
    "/api/bus-stops/search?q=Dover+%26+196&limit=50",
  );
  expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain("19%2F069");
  expect((global.fetch as jest.Mock).mock.calls[2][0]).toContain(
    "19%2F069/services/196%2Fe/routes",
  );
  expect(search.stops[0].services).toEqual([]);
  expect(detail.stop.services).toEqual([]);
  expect(routes.busStop.services).toEqual([]);
  expect(routes.routes[0].destination.services).toEqual([]);
});

it("normalizes legacy nearby and arrivals responses", async () => {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(
      response({
        stops: [{ ...stopWithoutServices, distanceMeters: 10 }],
        debug: {
          latitude: 1.3,
          longitude: 103.8,
          maxDistanceMeters: 800,
        },
      }),
    )
    .mockResolvedValueOnce(
      response({ busStop: stopWithoutServices, services: [] }),
    );

  const nearby = await findNearbyBusStops({ latitude: 1.3, longitude: 103.8 });
  const arrivals = await fetchBusStopArrivals("19069");

  expect(nearby.stops[0].services).toEqual([]);
  expect(arrivals.busStop.services).toEqual([]);
});
