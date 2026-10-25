/**
 * How much of a layered load has arrived: each tracked load adds its weight
 * when it settles, loaded or failed, and the listener hears the share of the
 * total so far.
 */
export class LoadProgress {
  private done = 0

  constructor(
    private readonly total: number,
    private readonly onProgress: (fraction: number) => void,
  ) {}

  track<T>(load: Promise<T>, weight: number): Promise<T> {
    return load.finally(() => {
      this.done += weight
      this.onProgress(Math.min(1, this.done / this.total))
    })
  }
}
