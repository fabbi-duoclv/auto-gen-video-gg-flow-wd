export interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  scene?: string;
  flowId?: string;
}

export type LogListener = (entry: LogEntry) => void;

const _listeners = new Set<LogListener>();

export function addLogListener(fn: LogListener): void {
  _listeners.add(fn);
}

export function removeLogListener(fn: LogListener): void {
  _listeners.delete(fn);
}

/** @deprecated Use addLogListener instead */
export function setLogListener(fn: LogListener | undefined): void {
  _listeners.clear();
  if (fn) _listeners.add(fn);
}

const timestamp = () => new Date().toLocaleTimeString('vi-VN');

function emit(level: LogEntry['level'], message: string, scene?: string, flowId?: string): void {
  const entry: LogEntry = { timestamp: timestamp(), level, message, scene, flowId };
  for (const fn of _listeners) fn(entry);
}

export const log = {
  info: (msg: string) => { console.log(`[${timestamp()}] ℹ ${msg}`); emit('info', msg); },
  success: (msg: string) => { console.log(`[${timestamp()}] ✓ ${msg}`); emit('success', msg); },
  warn: (msg: string) => { console.warn(`[${timestamp()}] ⚠ ${msg}`); emit('warn', msg); },
  error: (msg: string) => { console.error(`[${timestamp()}] ✗ ${msg}`); emit('error', msg); },
  scene: (num: string, msg: string) => { console.log(`[${timestamp()}] [Scene ${num}] ${msg}`); emit('info', msg, num); },
};

export interface FlowLogger {
  info: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  scene: (num: string, msg: string) => void;
}

export function createFlowLogger(flowId: string): FlowLogger {
  return {
    info: (msg: string) => { console.log(`[${timestamp()}] [${flowId}] ℹ ${msg}`); emit('info', msg, undefined, flowId); },
    success: (msg: string) => { console.log(`[${timestamp()}] [${flowId}] ✓ ${msg}`); emit('success', msg, undefined, flowId); },
    warn: (msg: string) => { console.warn(`[${timestamp()}] [${flowId}] ⚠ ${msg}`); emit('warn', msg, undefined, flowId); },
    error: (msg: string) => { console.error(`[${timestamp()}] [${flowId}] ✗ ${msg}`); emit('error', msg, undefined, flowId); },
    scene: (num: string, msg: string) => { console.log(`[${timestamp()}] [${flowId}] [Scene ${num}] ${msg}`); emit('info', msg, num, flowId); },
  };
}
