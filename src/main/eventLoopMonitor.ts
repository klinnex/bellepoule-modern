// Lag de la boucle d'événements du process principal (#1154, étape 4 : mesurer avant de déplacer).
// Le main héberge l'UI, les IPC `db:*` et le serveur distant : tout blocage s'y répercute sur les tablettes.
import { monitorEventLoopDelay, type ELDHistogram } from 'perf_hooks';

export interface EventLoopDelaySnapshot {
  /** Échantillons collectés depuis le dernier reset */
  samples: number;
  meanMs: number;
  p50Ms: number;
  p99Ms: number;
  maxMs: number;
}

const NS_PER_MS = 1e6;

export class EventLoopMonitor {
  private histogram: ELDHistogram;
  private running = false;

  constructor(resolutionMs = 10) {
    this.histogram = monitorEventLoopDelay({ resolution: resolutionMs });
  }

  start(): void {
    if (this.running) return;
    this.histogram.enable();
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    this.histogram.disable();
    this.running = false;
  }

  /** Statistiques depuis le dernier reset ; `reset` remet l'histogramme à zéro (fenêtre glissante) */
  snapshot(reset = false): EventLoopDelaySnapshot {
    const h = this.histogram;
    const round = (ns: number) => Math.round((ns / NS_PER_MS) * 100) / 100;
    const hasData = h.count > 0;
    const out: EventLoopDelaySnapshot = {
      samples: h.count,
      meanMs: hasData ? round(h.mean) : 0,
      p50Ms: hasData ? round(h.percentile(50)) : 0,
      p99Ms: hasData ? round(h.percentile(99)) : 0,
      maxMs: hasData ? round(h.max) : 0,
    };
    if (reset) h.reset();
    return out;
  }
}

export const eventLoopMonitor = new EventLoopMonitor();
