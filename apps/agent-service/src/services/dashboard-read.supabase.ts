import { supabase } from "../lib/supabase.js";
import {
  DashboardDataError,
  type DashboardReader,
  type Filter,
  type ListRequest,
  type Row,
} from "./dashboard-read.service.js";

type QueryError = { message: string } | null;

type QueryResult = {
  data: unknown;
  error: QueryError;
  count: number | null;
};

type Query = {
  select: (
    columns: string,
    options?: { count?: "exact"; head?: boolean },
  ) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
  eq: (column: string, value: string) => Query;
  in: (column: string, values: string[]) => Query;
  then: PromiseLike<QueryResult>["then"];
};

type SupabaseLike = {
  from: (table: string) => Query;
};

function applyFilters(query: Query, filters: Filter[] | undefined): Query {
  let next = query;

  for (const filter of filters ?? []) {
    next = next.eq(filter.column, filter.value);
  }

  return next;
}

function asRows(table: string, data: unknown): Row[] {
  if (!Array.isArray(data)) {
    throw new DashboardDataError(`Failed to load ${table}`);
  }

  return data.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new DashboardDataError(`Failed to load ${table}`);
    }

    return row as Row;
  });
}

export function createSupabaseDashboardReader(
  client: SupabaseLike = supabase as unknown as SupabaseLike,
): DashboardReader {
  return {
    async list(input: ListRequest) {
      if (input.in && input.in.values.length === 0) {
        return [];
      }

      let query = client
        .from(input.table)
        .select(input.columns);

      query = applyFilters(query, input.filters);

      if (input.in) {
        query = query.in(input.in.column, input.in.values);
      }

      if (input.orderBy) {
        query = query.order(input.orderBy, {
          ascending: input.ascending ?? false,
        });
      }

      const { data, error } = await query.limit(input.limit);

      if (error) {
        throw new DashboardDataError(
          `Failed to load ${input.table}: ${error.message}`,
        );
      }

      return asRows(input.table, data);
    },

    async count(table: string, filters?: Filter[]) {
      let query = client
        .from(table)
        .select("id", { count: "exact", head: true });
      query = applyFilters(query, filters);
      const { error, count } = await query;

      if (error || count == null) {
        throw new DashboardDataError(
          `Failed to count ${table}${error ? `: ${error.message}` : ""}`,
        );
      }

      return count;
    },
  };
}
