import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllDataMallPages, type FetchLike } from "../bus-stops/dataMall";
import { normalizeDataMallBusData } from "../bus-stops/normalize";

test("DataMall pagination loads records beyond 500 with the server-only AccountKey header", async () => {
  const calls: Array<{ skip: string | null; accountKey: string | null }> = [];
  const pages = [
    Array.from({ length: 500 }, (_, index) => ({ id: index })),
    Array.from({ length: 37 }, (_, index) => ({ id: 500 + index })),
  ];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      skip: url.searchParams.get("$skip"),
      accountKey: headers.get("AccountKey"),
    });
    return new Response(JSON.stringify({ value: pages[calls.length - 1] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const records = await fetchAllDataMallPages<{ id: number }>(
    "https://datamall2.mytransport.sg/ltaodataservice/BusStops",
    "server-secret",
    { fetchImpl },
  );

  assert.equal(records.length, 537);
  assert.deepEqual(calls, [
    { skip: "0", accountKey: "server-secret" },
    { skip: "500", accountKey: "server-secret" },
  ]);
});

test("DataMall pagination requests an empty terminating page after an exact 500-record page", async () => {
  const skips: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    const skip = new URL(String(input)).searchParams.get("$skip") ?? "";
    skips.push(skip);
    const value =
      skip === "0" ? Array.from({ length: 500 }, (_, id) => ({ id })) : [];
    return new Response(JSON.stringify({ value }), { status: 200 });
  };

  const records = await fetchAllDataMallPages<{ id: number }>(
    "https://example.test/data",
    "key",
    {
      fetchImpl,
    },
  );
  assert.equal(records.length, 500);
  assert.deepEqual(skips, ["0", "500"]);
});

test("normalization removes duplicate stops and invalid coordinates while deriving sorted services", () => {
  const result = normalizeDataMallBusData(
    [
      {
        BusStopCode: "18139",
        RoadName: "Lower Kent Ridge Rd",
        Description: "Opp Yusof Ishak House",
        Latitude: 1.29812,
        Longitude: 103.77424,
      },
      {
        BusStopCode: "18139",
        RoadName: "Duplicate Rd",
        Description: "Duplicate",
        Latitude: 1.3,
        Longitude: 103.8,
      },
      { BusStopCode: "99998", Latitude: 0, Longitude: 0 },
      { BusStopCode: "", Latitude: 1.3, Longitude: 103.8 },
    ],
    [
      { BusStopCode: "18139", ServiceNo: "10A" },
      { BusStopCode: "18139", ServiceNo: "2" },
      { BusStopCode: "18139", ServiceNo: "10" },
      { BusStopCode: "18139", ServiceNo: "2" },
    ],
  );

  assert.equal(result.stops.length, 1);
  assert.deepEqual(result.stops[0].services, ["2", "10", "10A"]);
  assert.equal(result.summary.duplicateStopCodesRemoved, 1);
  assert.equal(result.summary.invalidCoordinatesRemoved, 1);
  assert.equal(result.summary.invalidStopRecordsRemoved, 1);
  assert.equal(result.summary.serviceCount, 3);
});

test("normalization builds deduplicated one-service and multi-service stop indexes from route records", () => {
  const result = normalizeDataMallBusData(
    [
      {
        BusStopCode: "19069",
        RoadName: "Dover Rd",
        Description: "Opp Ayer Rajah Telecoms",
        Latitude: 1.30778758,
        Longitude: 103.7767117,
      },
      {
        BusStopCode: "01109",
        RoadName: "Queen St",
        Description: "Queen St Ter",
        Latitude: 1.30358578,
        Longitude: 103.85650373,
      },
    ],
    [
      {
        BusStopCode: "19069",
        ServiceNo: "196",
        Direction: 1,
        StopSequence: 60,
      },
      {
        BusStopCode: "19069",
        ServiceNo: "33",
        Direction: 1,
        StopSequence: 59,
      },
      {
        BusStopCode: "19069",
        ServiceNo: "33",
        Direction: 1,
        StopSequence: 59,
      },
      {
        BusStopCode: "01109",
        ServiceNo: "170",
        Direction: 1,
        StopSequence: 1,
      },
    ],
  );

  assert.deepEqual(
    result.stops.find((stop) => stop.busStopCode === "19069")?.services,
    ["33", "196"],
  );
  assert.deepEqual(
    result.stops.find((stop) => stop.busStopCode === "01109")?.services,
    ["170"],
  );
  assert.equal(result.summary.stopsWithServices, 2);
  assert.equal(result.summary.routePatternCount, 3);
});

test("DataMall synchronization rejects a missing backend key before any request", async () => {
  await assert.rejects(
    () => fetchAllDataMallPages("https://example.test/data", "   "),
    /LTA_DATAMALL_ACCOUNT_KEY is required/,
  );
});
