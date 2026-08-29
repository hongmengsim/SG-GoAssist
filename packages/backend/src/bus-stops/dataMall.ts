const DEFAULT_PAGE_SIZE = 500;

type DataMallResponse<T> = {
  value?: T[];
};

export type FetchLike = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchAllDataMallPages<T>(
  endpoint: string,
  accountKey: string,
  options: {
    fetchImpl?: FetchLike;
    pageSize?: number;
  } = {},
): Promise<T[]> {
  const trimmedKey = accountKey.trim();
  if (!trimmedKey) {
    throw new Error("LTA_DATAMALL_ACCOUNT_KEY is required.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("DataMall page size must be a positive integer.");
  }

  const records: T[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const url = new URL(endpoint);
    url.searchParams.set("$skip", String(skip));
    const response = await fetchImpl(url, {
      headers: {
        AccountKey: trimmedKey,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `LTA DataMall request failed (${response.status}) for ${url.pathname} at $skip=${skip}.`,
      );
    }

    const payload = (await response.json()) as DataMallResponse<T>;
    if (!Array.isArray(payload.value)) {
      throw new Error(
        `LTA DataMall returned an invalid page at $skip=${skip}.`,
      );
    }

    records.push(...payload.value);
    if (payload.value.length < pageSize) {
      break;
    }
  }

  return records;
}
