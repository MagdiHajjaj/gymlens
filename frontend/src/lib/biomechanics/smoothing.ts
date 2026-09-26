export class Smoother {
  private values = new Map<string, number>();
  reset() {
    this.values.clear();
  }
  update(key: string, value: number, dt: number, tau = 100) {
    const previous = this.values.get(key) ?? value;
    const result = previous + (1 - Math.exp(-Math.max(1, dt) / tau)) * (value - previous);
    this.values.set(key, result);
    return result;
  }
}
