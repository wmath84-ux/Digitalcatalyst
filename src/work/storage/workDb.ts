import Dexie, { type Table } from "dexie";
import type { WorkMyDayItem, WorkMyDayNotebook } from "./workMyDay";

/** Work's private database. It is separate from both the app and Revision DBs. */
class WorkDatabase extends Dexie {
  myDayItems!: Table<WorkMyDayItem, string>;
  myDayNotebooks!: Table<WorkMyDayNotebook, string>;

  constructor() {
    super("digitalcatalyst-work");
    this.version(1).stores({
      myDayItems: "id, ownerId, kind, notebookId, completed, dueAt, updatedAt, deletedAt",
      myDayNotebooks: "id, ownerId, parentId, updatedAt, deletedAt",
    });
  }
}

let instance: WorkDatabase | null = null;

/** Open lazily so Work storage can be imported during SSR and contract tests. */
export function workDatabase(): WorkDatabase {
  if (!instance) instance = new WorkDatabase();
  return instance;
}

/** Test cleanup and account/device reset without exposing the singleton. */
export async function closeWorkDatabase(): Promise<void> {
  if (!instance) return;
  instance.close();
  instance = null;
}
