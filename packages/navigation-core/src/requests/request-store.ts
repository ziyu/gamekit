import type { NavigationPathRequest, NavigationRequestResult } from "../contracts/routes";

export type NavigationRequestRecord = {
  request: NavigationPathRequest & { id: string };
  state: "queued" | "submitted" | "terminal";
  staleRetries: number;
};

export type NavigationRequestStore = {
  allocateRequestId(requestedId: string | undefined, prefix: string): string;
  allocateUniqueId(prefix: string): string;
  signature(requestId: string): string | undefined;
  reserveSignature(requestId: string, signature: string): void;
  addQueued(record: NavigationRequestRecord): void;
  record(requestId: string): NavigationRequestRecord | undefined;
  result(requestId: string): NavigationRequestResult | undefined;
  setResult(requestId: string, result: NavigationRequestResult): void;
  activeCount(): number;
  activeForRequester(requesterId: string): number;
  isSubmitted(requestId: string): boolean;
  submittedRecords(): Iterable<NavigationRequestRecord>;
  transitionToSubmitted(record: NavigationRequestRecord): void;
  transitionToQueued(record: NavigationRequestRecord): void;
  finishActive(record: NavigationRequestRecord): void;
  retainTerminal(result: Exclude<NavigationRequestResult, { status: "pending" | "missing" }>): void;
  snapshot(): {
    active: number;
    queued: number;
    submitted: number;
    retainedResults: number;
  };
  clear(): void;
};

export function createNavigationRequestStore(maxRetainedResults: number): NavigationRequestStore {
  const records = new Map<string, NavigationRequestRecord>();
  const submitted = new Map<string, NavigationRequestRecord>();
  const signatures = new Map<string, string>();
  const results = new Map<string, NavigationRequestResult>();
  const requesterActive = new Map<string, number>();
  const terminalOrder: string[] = [];
  let queuedCount = 0;
  let submittedCount = 0;
  let nextSequence = 0;

  return {
    allocateRequestId(requestedId, prefix) {
      const sequence = nextSequence;
      nextSequence += 1;
      return requestedId ?? `${prefix}.${sequence}`;
    },
    allocateUniqueId(prefix) {
      let candidate = `${prefix}.${nextSequence}`;
      nextSequence += 1;
      while (signatures.has(candidate)) {
        candidate = `${prefix}.${nextSequence}`;
        nextSequence += 1;
      }
      return candidate;
    },
    signature: (requestId) => signatures.get(requestId),
    reserveSignature(requestId, signature) {
      signatures.set(requestId, signature);
    },
    addQueued(record) {
      records.set(record.request.id, record);
      queuedCount += 1;
      const requesterId = record.request.requesterId;
      requesterActive.set(requesterId, (requesterActive.get(requesterId) ?? 0) + 1);
    },
    record: (requestId) => records.get(requestId),
    result: (requestId) => results.get(requestId),
    setResult(requestId, result) {
      results.set(requestId, result);
    },
    activeCount: () => queuedCount + submittedCount,
    activeForRequester: (requesterId) => requesterActive.get(requesterId) ?? 0,
    isSubmitted: (requestId) => submitted.has(requestId),
    submittedRecords: () => submitted.values(),
    transitionToSubmitted(record) {
      if (record.state !== "queued") {
        return;
      }
      record.state = "submitted";
      queuedCount = Math.max(0, queuedCount - 1);
      submittedCount += 1;
      submitted.set(record.request.id, record);
    },
    transitionToQueued(record) {
      if (record.state !== "submitted") {
        return;
      }
      record.state = "queued";
      submittedCount = Math.max(0, submittedCount - 1);
      queuedCount += 1;
      submitted.delete(record.request.id);
    },
    finishActive(record) {
      if (record.state === "terminal") {
        return;
      }
      if (record.state === "queued") {
        queuedCount = Math.max(0, queuedCount - 1);
      } else {
        submittedCount = Math.max(0, submittedCount - 1);
        submitted.delete(record.request.id);
      }
      record.state = "terminal";
      const requesterId = record.request.requesterId;
      const next = Math.max(0, (requesterActive.get(requesterId) ?? 0) - 1);
      if (next === 0) {
        requesterActive.delete(requesterId);
      } else {
        requesterActive.set(requesterId, next);
      }
    },
    retainTerminal(result) {
      results.set(result.requestId, result);
      terminalOrder.push(result.requestId);
      while (terminalOrder.length > maxRetainedResults) {
        const oldest = terminalOrder.shift();
        if (oldest !== undefined && results.get(oldest)?.status !== "pending") {
          results.delete(oldest);
          records.delete(oldest);
          signatures.delete(oldest);
        }
      }
    },
    snapshot() {
      return {
        active: queuedCount + submittedCount,
        queued: queuedCount,
        submitted: submittedCount,
        retainedResults: results.size
      };
    },
    clear() {
      records.clear();
      submitted.clear();
      signatures.clear();
      results.clear();
      requesterActive.clear();
      terminalOrder.length = 0;
      queuedCount = 0;
      submittedCount = 0;
    }
  };
}
