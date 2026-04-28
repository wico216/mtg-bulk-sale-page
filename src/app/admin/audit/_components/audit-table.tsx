import Link from "next/link";
import type {
  AdminAuditAction,
  AdminAuditEntriesResult,
  ImportHistoryEntry,
  ImportHistoryResult,
} from "@/db/queries";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const ACTION_LABELS: Record<AdminAuditAction, string> = {
  "inventory.update": "Inventory edit",
  "inventory.delete_one": "Single delete",
  "inventory.delete_many": "Bulk delete",
  "inventory.delete_all": "Delete inventory",
  "inventory.import_commit": "Import commit",
  "order.status_update": "Order workflow",
  "order.cancel": "Order cancel",
  "order.restore_inventory": "Inventory restore",
};

const ACTION_CLASSES: Record<AdminAuditAction, string> = {
  "inventory.update": "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
  "inventory.delete_one": "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  "inventory.delete_many": "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  "inventory.delete_all": "bg-red-200 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  "inventory.import_commit": "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  "order.status_update": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300",
  "order.cancel": "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "order.restore_inventory": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
};

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function metadataPreview(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${formatMetadataValue(value)}`)
    .join(" · ");
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(formatMetadataValue).join(", ")}]`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildHref(current: URLSearchParams, key: string, page: number): string {
  const params = new URLSearchParams(current);
  params.set(key, String(page));
  return `/admin/audit?${params.toString()}`;
}

function Pager({
  currentParams,
  pageKey,
  page,
  totalPages,
}: {
  currentParams: URLSearchParams;
  pageKey: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const previousDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      {previousDisabled ? (
        <span className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600">
          Previous Page
        </span>
      ) : (
        <Link
          href={buildHref(currentParams, pageKey, page - 1)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Previous Page
        </Link>
      )}
      <span className="text-zinc-500 dark:text-zinc-400">
        Page {page} of {totalPages}
      </span>
      {nextDisabled ? (
        <span className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600">
          Next Page
        </span>
      ) : (
        <Link
          href={buildHref(currentParams, pageKey, page + 1)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Next Page
        </Link>
      )}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}

function ActionBadge({ action }: { action: AdminAuditAction }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_CLASSES[action]}`}>
      {ACTION_LABELS[action]}
    </span>
  );
}

export function AuditTable({
  result,
  currentParams,
}: {
  result: AdminAuditEntriesResult;
  currentParams: URLSearchParams;
}) {
  if (result.entries.length === 0) {
    return (
      <EmptyState
        title="No audit entries yet"
        description="High-impact admin actions will appear here after they succeed."
      />
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left dark:bg-zinc-900">
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">Action</th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">Target</th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">Actor</th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">When</th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-t border-zinc-100 align-top dark:border-zinc-800"
              >
                <td className="px-4 py-3">
                  <ActionBadge action={entry.action} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {entry.targetType}
                    {entry.targetCount !== null ? ` · ${entry.targetCount}` : ""}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {entry.targetId ?? "—"}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {entry.actorEmail ?? "Unknown"}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {formatDate(entry.createdAt)}
                </td>
                <td className="max-w-xl px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                  {metadataPreview(entry.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        currentParams={currentParams}
        pageKey="auditPage"
        page={result.page}
        totalPages={result.totalPages}
      />
    </div>
  );
}

export function ImportHistoryTable({
  result,
  currentParams,
}: {
  result: ImportHistoryResult;
  currentParams: URLSearchParams;
}) {
  if (result.entries.length === 0) {
    return (
      <EmptyState
        title="No import history yet"
        description="CSV replacement imports will appear here with safe file and row-count details."
      />
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left dark:bg-zinc-900">
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">Committed</th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">Files</th>
              <th className="px-4 py-3 text-right font-semibold text-zinc-600 dark:text-zinc-400">Parsed</th>
              <th className="px-4 py-3 text-right font-semibold text-zinc-600 dark:text-zinc-400">Skipped</th>
              <th className="px-4 py-3 text-right font-semibold text-zinc-600 dark:text-zinc-400">Inserted</th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">Actor</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((entry) => (
              <ImportHistoryRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        currentParams={currentParams}
        pageKey="importPage"
        page={result.page}
        totalPages={result.totalPages}
      />
    </div>
  );
}

function ImportHistoryRow({ entry }: { entry: ImportHistoryEntry }) {
  return (
    <tr className="border-t border-zinc-100 align-top dark:border-zinc-800">
      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
        {formatDate(entry.committedAt)}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-zinc-900 dark:text-zinc-100">
          {entry.fileCount} {entry.fileCount === 1 ? "file" : "files"}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {entry.fileNames.map((fileName) => (
            <span
              key={fileName}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {fileName}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{entry.parsedRows}</td>
      <td className="px-4 py-3 text-right tabular-nums">{entry.skippedRows}</td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums">
        {entry.insertedCards}
      </td>
      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
        {entry.actorEmail ?? "Unknown"}
      </td>
    </tr>
  );
}
